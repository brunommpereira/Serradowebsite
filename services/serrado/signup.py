"""
Registo online de sócios e atletas com aceitação de documentos e assinatura desenhada.

É uma assinatura eletrónica simples (eIDAS, art. 3.º, n.º 10), com prova. Para cada registo
fica guardado:

- o que foi submetido;
- a versão exata de cada documento aceite, com o hash do texto;
- a imagem da assinatura e o seu hash;
- a hora do servidor, o IP e o navegador;
- um hash de tudo isto junto;
- um PDF com tudo, enviado por email a quem assinou.

O registo fica ativo de imediato: o sócio ou o atleta é criado e a conta do site fica ligada ao
email de quem assinou.
"""

import asyncio
import base64
import hashlib
import json
import re
import secrets
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from fpdf import FPDF
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from .backend.core import Actor, audit
from .config import config
from .db.pool import Conn, Jsonb, Pool, Row, fetch
from .mail import enqueue, layout
from .registry import NO_PASSWORD, SPORTS, AthleteIn, MemberIn, Phone, Text, _blank, _email, _to_date, save_athlete, save_member
from .validation import is_valid_phone
from .web import HttpError

KINDS = ("socio", "atleta", "rgpd", "imagem")
TITLES = {
    "socio": "Condições de admissão de sócio",
    "atleta": "Regulamento e condições de inscrição de atleta",
    "rgpd": "Informação sobre proteção de dados (RGPD)",
    "imagem": "Autorização de utilização de imagem",
}
REQUIRED = {"member": ("socio", "rgpd"), "athlete": ("atleta", "rgpd")}
SYSTEM = Actor()
LISBON = ZoneInfo("Europe/Lisbon")


# ------------------------------------------------------------------ documentos legais
def doc_hash(title: str, body: str) -> str:
    return hashlib.sha256(f"{title}\n\n{body}".encode()).hexdigest()


async def current_documents(db: Pool | Conn) -> dict[str, Row]:
    rows = await fetch(
        db,
        """select distinct on (kind) id, kind, version, title, body, sha256, created_at
             from legal_documents order by kind, version desc""",
    )
    return {r["kind"]: r for r in rows}


async def publish_document(c: Conn, who: Actor, kind: str, title: str, body: str) -> dict[str, Any]:
    if kind not in KINDS:
        raise HttpError(404, "not_found", "Documento desconhecido")
    body = re.sub(r"\r\n?", "\n", body).strip()
    title = title.strip()
    cur = await c.execute(
        """insert into legal_documents (kind, version, title, body, sha256, created_by)
           values (%s, coalesce((select max(version) from legal_documents where kind = %s), 0) + 1, %s, %s, %s, %s)
           returning id, kind, version, title, sha256, created_at""",
        [kind, kind, title, body, doc_hash(title, body), who.id],
    )
    row = await cur.fetchone()
    assert row is not None
    await audit(c, who, "legal.publish", "legal_documents", row["id"], {"kind": kind, "version": row["version"]})
    return dict(row)


# ------------------------------------------------------------------ aceitação
DECLARATION = {
    "titular": "Declaro que os dados indicados são verdadeiros e aceito as condições e os documentos acima, na qualidade de titular.",
    "encarregado": "Declaro que os dados indicados são verdadeiros e aceito as condições e os documentos acima, na qualidade de encarregado de educação do atleta.",
}
CONFIRM_DAYS = 7


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ------------------------------------------------------------------ formulários
Required = Annotated[str, BeforeValidator(_blank), Field(min_length=1, max_length=200)]
ReqEmail = Annotated[str, BeforeValidator(_email)]
ReqDate = Annotated[str, BeforeValidator(_to_date)]


class _Signup(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    accept: dict[str, int] = Field(max_length=4)
    imageConsent: bool = False
    # A caixa «Declaro que os dados são verdadeiros e aceito…» (substitui a assinatura desenhada)
    declaration: bool
    website: str = Field(default="", max_length=200)  # armadilha para robôs: tem de vir vazio

    @field_validator("declaration")
    @classmethod
    def _declared(cls, v: bool) -> bool:
        if not v:
            raise ValueError("é preciso aceitar a declaração")
        return v


class MemberSignup(_Signup):
    name: Annotated[str, BeforeValidator(_blank), Field(min_length=5, max_length=160)]
    email: ReqEmail
    phone: Annotated[str, BeforeValidator(lambda v: re.sub(r"\s", "", str(v or "")))]
    taxNumber: Annotated[str | None, BeforeValidator(_blank)] = None
    birthDate: ReqDate
    address: Text = None
    postalCode: Text = None
    city: Text = None
    category: Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_blank)] = None
    # Sócio proponente (Regulamento Interno, art.º 9.º): opcional no site; a secretaria confirma
    proposerNumber: Annotated[str | None, BeforeValidator(lambda v: re.sub(r"\D", "", str(v or "")) or None)] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        if not is_valid_phone(v):
            raise ValueError("telemóvel inválido")
        return v


class Guardian(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Annotated[str, BeforeValidator(_blank), Field(min_length=5, max_length=160)]
    email: ReqEmail
    phone: Annotated[str, BeforeValidator(lambda v: re.sub(r"\s", "", str(v or "")))]
    relation: Annotated[str, BeforeValidator(_blank), Field(min_length=2, max_length=40)] = "Encarregado de educação"

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        if not is_valid_phone(v):
            raise ValueError("telemóvel inválido")
        return v


class AthleteSignup(_Signup):
    name: Annotated[str, BeforeValidator(_blank), Field(min_length=5, max_length=160)]
    birthDate: ReqDate
    gender: Literal["Feminino", "Masculino"]
    sport: Literal["atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"]
    idNumber: Annotated[str | None, BeforeValidator(_blank)] = None
    idExpiry: Annotated[str | None, BeforeValidator(_to_date)] = None
    taxNumber: Annotated[str | None, BeforeValidator(_blank)] = None
    email: Annotated[str | None, BeforeValidator(_email)] = None
    phone: Phone = None
    address: Text = None
    postalCode: Text = None
    city: Text = None
    emergencyName: Annotated[str, BeforeValidator(_blank), Field(min_length=3, max_length=120)]
    emergencyPhone: Annotated[str, BeforeValidator(lambda v: re.sub(r"\s", "", str(v or "")))]
    shirtSize: Annotated[Annotated[str, Field(max_length=5)] | None, BeforeValidator(_blank)] = None
    guardian: Guardian | None = None

    @field_validator("emergencyPhone")
    @classmethod
    def _emergency(cls, v: str) -> str:
        if not is_valid_phone(v):
            raise ValueError("telemóvel de emergência inválido")
        return v


def age_on(birth: str, today: date) -> int:
    b = date.fromisoformat(birth)
    return today.year - b.year - ((today.month, today.day) < (b.month, b.day))


# ------------------------------------------------------------------ PDF
_PDF_MAP = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "€": "EUR"})


def _t(s: Any) -> str:
    """As fontes base do PDF só têm Latin-1 (chega para o português)."""
    return str("" if s is None else s).translate(_PDF_MAP).encode("latin-1", "replace").decode("latin-1")


def build_pdf(reg: dict[str, Any], docs: list[Row], labels: Sequence[tuple[str, str | None]]) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_title(_t(reg["title"]))
    pdf.set_author("Serrado Futebol Clube")
    pdf.set_creator("serradofc.pt")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.multi_cell(0, 8, _t(reg["title"]), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, _t(f"Serrado Futebol Clube · Registo {reg['id']} · {reg['signedLocal']}"), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Dados", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 10)
    for label, value in labels:
        if value in (None, ""):
            continue
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(55, 6, _t(label))
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _t(value), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Documentos", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 9)
    for d in reg["accepted"]:
        state = "Aceite" if d["accepted"] else "NÃO autorizado"
        pdf.set_font("Helvetica", "", 9.5)
        pdf.multi_cell(0, 5, _t(f"{d['title']} (versão {d['version']}): {state}"), new_x="LMARGIN", new_y="NEXT", align="L")
        pdf.set_font("Helvetica", "", 7.5)
        pdf.multi_cell(0, 4, _t(f"SHA-256 do texto: {d['sha256']}"), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Aceitação", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 10)
    role = "titular" if reg["signerRole"] == "titular" else "encarregado de educação"
    pdf.multi_cell(0, 5, _t(f"«{reg['declaration']}»"), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(1)
    pdf.multi_cell(0, 5, _t(f"Aceite por {reg['signerName']} ({role}) · {reg['signerEmail']}"), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Prova da aceitação", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 8)
    for line in (
        f"Aceite no site em {reg['signedAt']} (UTC), a partir do endereço IP {reg['ip']}.",
        f"Navegador: {reg['userAgent'][:200]}",
        f"Email confirmado em {reg['confirmedAt']} (UTC), através da ligação enviada para {reg['signerEmail']}, a partir do IP {reg['confirmIp']}.",
        "SHA-256 do registo (dados, documentos, declaração, hora, IP e navegador):",
        reg["evidenceSha256"],
        "Assinatura eletrónica simples (Regulamento (UE) n.º 910/2014, eIDAS): aceitação expressa com confirmação do email.",
        "O clube guarda estes elementos e este documento.",
    ):
        pdf.multi_cell(0, 4.2, _t(line), new_x="LMARGIN", new_y="NEXT", align="L")

    for d in docs:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 12)
        pdf.multi_cell(0, 7, _t(f"Anexo: {d['title']} (versão {d['version']})"), new_x="LMARGIN", new_y="NEXT", align="L")
        pdf.set_font("Helvetica", "", 9.5)
        for para in re.split(r"\n\s*\n", d["body"]):
            pdf.multi_cell(0, 4.8, _t(para.strip()), new_x="LMARGIN", new_y="NEXT", align="L")
            pdf.ln(1.5)
    return bytes(pdf.output())


# ------------------------------------------------------------------ registo
async def _accepted(db: Conn, kind: Literal["member", "athlete"], body: _Signup) -> tuple[list[dict[str, Any]], list[Row]]:
    docs = await current_documents(db)
    needed = [*REQUIRED[kind], "imagem"]
    if any(k not in docs for k in needed):
        raise HttpError(503, "signup_unavailable", "O registo online ainda não está disponível. Contacta a secretaria.")
    out: list[dict[str, Any]] = []
    used: list[Row] = []
    for k in needed:
        d = docs[k]
        if body.accept.get(k) != d["version"]:
            if k in REQUIRED[kind]:
                raise HttpError(409, "documents_changed", "Os documentos foram atualizados entretanto. Recarrega a página e lê a versão nova.")
        accepted = k in REQUIRED[kind] or (body.imageConsent and body.accept.get(k) == d["version"])
        out.append({"kind": k, "title": d["title"], "version": d["version"], "sha256": d["sha256"], "accepted": accepted})
        used.append(d)
    return out, used


def _evidence(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


async def _finish(
    c: Conn,
    *,
    kind: Literal["member", "athlete"],
    data: dict[str, Any],
    accepted: list[dict[str, Any]],
    image_consent: bool,
    signer: tuple[str, str, str],
    client: dict[str, str],
    proposer_number: str | None = None,
) -> dict[str, Any]:
    """Guarda a proposta aceite no site e envia o email para a confirmar (só depois chega à secretaria)."""
    signed_at = datetime.now(UTC).replace(microsecond=0)
    name, email, role = signer
    declaration = DECLARATION[role]
    evidence = {
        "kind": kind,
        "data": data,
        "accepted": accepted,
        "imageConsent": image_consent,
        "signer": {"name": name, "email": email, "role": role},
        "declaration": declaration,
        "signedAt": signed_at.isoformat(),
        "ip": client["ip"],
        "userAgent": client["userAgent"],
    }
    ev_sha = _evidence(evidence)
    token = secrets.token_urlsafe(32)
    cur = await c.execute(
        """insert into registrations (kind, data, proposer_number, signer_name, signer_email, signer_role, accepted, image_consent,
                                      declaration, ip, user_agent, signed_at, evidence_sha256, status, confirm_token_hash, confirm_expires_at)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'por_confirmar', %s, now() + %s * interval '1 day') returning id""",
        [
            kind,
            Jsonb(data),
            proposer_number,
            name,
            email,
            role,
            Jsonb(accepted),
            image_consent,
            declaration,
            client["ip"],
            client["userAgent"],
            signed_at,
            ev_sha,
            _token_hash(token),
            CONFIRM_DAYS,
        ],
    )
    row = await cur.fetchone()
    assert row is not None
    reg_id = str(row["id"])
    what = "a proposta de sócio" if kind == "member" else f"a inscrição de {data.get('name', 'atleta')}"
    if config.mail.enabled:
        await enqueue(
            c,
            to_email=email,
            to_name=name,
            subject="Confirma a tua proposta — Serrado FC",
            html_body=layout(
                "Confirma a tua proposta",
                [
                    f"Olá {name.split()[0]},",
                    f"Para enviarmos {what} à secretaria do clube, confirma que foste tu a preenchê-la e que aceitas as condições.",
                    f"A ligação é válida durante {CONFIRM_DAYS} dias. Depois de confirmares, recebes o documento com a proposta e a prova da aceitação.",
                ],
                ("Confirmar a proposta", f"{config.oauth.site_url}/propostas/confirmar?token={token}"),
                footer="Se não foste tu, ignora este email: sem confirmação, a proposta não segue.",
            ),
        )
    await audit(c, SYSTEM, f"registrations.{kind}", "registrations", reg_id, {"evidence": ev_sha[:16]})
    return {"id": reg_id, "evidenceSha256": ev_sha, "status": "por_confirmar"}


def _labels(kind: str, d: dict[str, Any]) -> list[tuple[str, str | None]]:
    address = ", ".join(x for x in (d.get("address"), d.get("postalCode"), d.get("city")) if x)
    image = "Autoriza" if d.get("imageConsent") else "Não autoriza"
    if kind == "member":
        return [
            ("N.º de sócio", "a atribuir pela secretaria"),
            ("Nome", d.get("name")),
            ("Email", d.get("email")),
            ("Telemóvel", d.get("phone")),
            ("NIF", d.get("taxNumber") or ""),
            ("Data de nascimento", d.get("birthDate")),
            ("Morada", address),
            ("Categoria", d.get("category")),
            ("Sócio proponente", f"n.º {d['proposerNumber']}" if d.get("proposerNumber") else ""),
            ("Imagem", image),
        ]
    g = d.get("guardian") or {}
    return [
        ("Código", "a atribuir pela secretaria"),
        ("Nome", d.get("name")),
        ("Data de nascimento", d.get("birthDate")),
        ("Género", d.get("gender")),
        ("Modalidade", SPORT_NAMES.get(str(d.get("sport")), str(d.get("sport")))),
        ("N.º do CC", d.get("idNumber") or ""),
        ("NIF", d.get("taxNumber") or ""),
        ("Email", d.get("email") or ""),
        ("Telemóvel", d.get("phone") or ""),
        ("Morada", address),
        ("Contacto de emergência", f"{d.get('emergencyName')} · {d.get('emergencyPhone')}"),
        ("Encarregado", f"{g.get('name')} ({g.get('relation')}) · {g.get('email')} · {g.get('phone')}" if g else ""),
        ("Imagem", image),
    ]


async def confirm(c: Conn, token: str, client: dict[str, str]) -> dict[str, Any]:
    """Ligação do email: a proposta passa à secretaria, com o PDF (dados, documentos e prova da aceitação)."""
    reg = await (await c.execute("select * from registrations where confirm_token_hash = %s for update", [_token_hash(token)])).fetchone()
    if not reg:
        raise HttpError(400, "invalid_link", "Ligação inválida. Copia-a completa do email ou faz a proposta outra vez.")
    out = {"id": str(reg["id"]), "kind": reg["kind"], "name": reg["data"].get("name", "")}
    if reg["status"] != "por_confirmar":
        return {**out, "status": reg["status"], "already": True}
    expired = await (await c.execute("select confirm_expires_at < now() as x from registrations where id = %s", [reg["id"]])).fetchone()
    if expired and expired["x"]:
        raise HttpError(400, "expired_link", f"A ligação expirou ({CONFIRM_DAYS} dias). Faz a proposta outra vez.")
    d: dict[str, Any] = reg["data"]
    if reg["kind"] == "member":
        if await (await c.execute("select 1 from members where email = %s", [d["email"]])).fetchone():
            raise HttpError(409, "already_member", "Já existe um sócio com este email.")
        dup = "kind = 'member' and lower(data->>'email') = lower(%s)"
        dup_args = [d["email"]]
    else:
        dup = "kind = 'athlete' and lower(data->>'name') = lower(%s) and data->>'birthDate' = %s"
        dup_args = [d["name"], d["birthDate"]]
    if await (await c.execute(f"select 1 from registrations where status = 'pendente' and {dup} and id <> %s", [*dup_args, reg["id"]])).fetchone():
        raise HttpError(409, "already_proposed", "Já há uma proposta igual à espera da secretaria.")
    await c.execute(
        "update registrations set status = 'pendente', confirmed_at = now(), confirm_ip = %s where id = %s returning confirmed_at",
        [client["ip"], reg["id"]],
    )
    confirmed = await (await c.execute("select confirmed_at from registrations where id = %s", [reg["id"]])).fetchone()
    assert confirmed is not None
    docs = [
        x
        for a in reg["accepted"]
        for x in await fetch(c, "select * from legal_documents where kind = %s and version = %s", [a["kind"], a["version"]])
    ]
    signed_at = datetime.fromisoformat(str(reg["signed_at"]).replace("Z", "+00:00"))
    confirmed_at = datetime.fromisoformat(str(confirmed["confirmed_at"]).replace("Z", "+00:00"))
    title = "Proposta de sócio" if reg["kind"] == "member" else "Proposta de inscrição de atleta"
    reg_id = str(reg["id"])
    pdf = await asyncio.to_thread(
        build_pdf,
        {
            "id": reg_id,
            "title": title,
            "signedLocal": signed_at.astimezone(LISBON).strftime("%d/%m/%Y %H:%M"),
            "signedAt": signed_at.strftime("%Y-%m-%d %H:%M:%S"),
            "confirmedAt": confirmed_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S"),
            "confirmIp": client["ip"],
            "accepted": reg["accepted"],
            "declaration": reg["declaration"],
            "signerName": reg["signer_name"],
            "signerEmail": reg["signer_email"],
            "signerRole": reg["signer_role"],
            "ip": reg["ip"],
            "userAgent": reg["user_agent"],
            "evidenceSha256": reg["evidence_sha256"],
        },
        docs,
        _labels(reg["kind"], {**d, "imageConsent": reg["image_consent"]}),
    )
    await c.execute("update registrations set pdf = %s, pdf_sha256 = %s where id = %s", [pdf, hashlib.sha256(pdf).hexdigest(), reg_id])
    name = str(reg["signer_name"])
    if config.mail.enabled:
        await enqueue(
            c,
            to_email=reg["signer_email"],
            to_name=name,
            subject=f"{title} — Serrado FC",
            html_body=layout(
                title,
                [
                    f"Olá {name.split()[0]},",
                    "Obrigado! A proposta foi confirmada e seguiu para a secretaria do clube. Recebes um email quando for aceite.",
                    "Em anexo segue o documento com os dados, os documentos aceites e a prova da aceitação.",
                ],
                footer="Se não foste tu, responde a este email ou contacta a secretaria do clube.",
            ),
            attachments=[{"name": f"proposta-serrado-{reg_id[:8]}.pdf", "content": base64.b64encode(pdf).decode()}],
        )
    await audit(c, SYSTEM, "registrations.confirm", "registrations", reg_id, {"kind": reg["kind"]})
    await _notify_club(c, reg["kind"], str(d.get("name", "")), reg_id)
    return {**out, "status": "pendente", "already": False}


async def _notify_club(c: Conn, kind: str, name: str, reg_id: str) -> None:
    if not config.mail.enabled:
        return
    from .backend.routes.interest import club_email

    what = "sócio" if kind == "member" else "atleta"
    await enqueue(
        c,
        to_email=await club_email(c),
        to_name="Serrado FC",
        subject=f"Nova proposta de {what}: {name}",
        html_body=layout(
            f"Nova proposta de {what}",
            [f"{name} fez e confirmou uma proposta de {what} no site.", "Aceita ou recusa no backoffice, em Propostas."],
            ("Ver propostas", f"{config.oauth.site_url}/admin/registos"),
        ),
    )


async def _invite_if_new(c: Conn, email: str, name: str) -> None:
    """Conta sem password (acabada de criar): envia o convite para a definir."""
    from .backend.accounts import send_link

    cur = await c.execute("select id, password_hash from users where email = %s", [email])
    row = await cur.fetchone()
    if row and row["password_hash"] == NO_PASSWORD and config.mail.enabled:
        await send_link(c, user_id=str(row["id"]), email=email, name=name, purpose="invite")


async def register_member(c: Conn, body: MemberSignup, client: dict[str, str]) -> dict[str, Any]:
    if body.website:
        raise HttpError(400, "invalid", "Pedido inválido")
    accepted, _docs = await _accepted(c, "member", body)
    if await (await c.execute("select 1 from members where email = %s", [body.email])).fetchone():
        raise HttpError(409, "already_member", "Já existe um sócio com este email. Entra na área reservada ou contacta a secretaria.")
    if await (
        await c.execute(
            "select 1 from registrations where kind = 'member' and status = 'pendente' and lower(data->>'email') = lower(%s)", [body.email]
        )
    ).fetchone():
        raise HttpError(409, "already_proposed", "Já há uma proposta de sócio com este email à espera da secretaria.")
    categories = {r["category"] for r in await fetch(c, "select category from quota_plans where active")}
    category: str = (
        body.category
        if body.category and body.category in categories
        else ("Efetivo" if not categories or "Efetivo" in categories else sorted(categories)[0])
    )
    if (
        body.proposerNumber
        and not await (
            await c.execute("select 1 from members where member_number = %s and status = 'Ativo'", [body.proposerNumber.zfill(5)])
        ).fetchone()
    ):
        raise HttpError(400, "validation", "proposerNumber: não há um sócio ativo com esse número")
    proposer = body.proposerNumber.zfill(5) if body.proposerNumber else None
    data = {k: v for k, v in body.model_dump().items() if k not in ("declaration", "website", "accept", "proposerNumber")} | {
        "category": category,
        "proposerNumber": proposer,
    }
    return await _finish(
        c,
        kind="member",
        data=data,
        accepted=accepted,
        image_consent=body.imageConsent,
        signer=(body.name, body.email, "titular"),
        client=client,
        proposer_number=proposer,
    )


async def register_athlete(c: Conn, body: AthleteSignup, client: dict[str, str]) -> dict[str, Any]:
    if body.website:
        raise HttpError(400, "invalid", "Pedido inválido")
    minor = age_on(body.birthDate, date.today()) < 18
    if minor and not body.guardian:
        raise HttpError(400, "validation", "guardian: obrigatório para menores de 18 anos")
    if not minor and not body.email:
        raise HttpError(400, "validation", "email: obrigatório (o atleta assina e recebe o documento)")
    accepted, _docs = await _accepted(c, "athlete", body)
    if await (await c.execute("select 1 from athletes where lower(name) = lower(%s) and birth_date = %s", [body.name, body.birthDate])).fetchone():
        raise HttpError(409, "already_registered", "Este atleta já está inscrito. Fala com a secretaria para renovar ou alterar a inscrição.")
    if await (
        await c.execute(
            "select 1 from registrations where kind = 'athlete' and status = 'pendente' and lower(data->>'name') = lower(%s) and data->>'birthDate' = %s",
            [body.name, body.birthDate],
        )
    ).fetchone():
        raise HttpError(409, "already_proposed", "Já há uma inscrição deste atleta à espera da secretaria.")
    if minor and body.guardian:
        signer = (body.guardian.name, body.guardian.email, "encarregado")
    else:
        assert body.email is not None
        signer = (body.name, body.email, "titular")
    data = {k: v for k, v in body.model_dump().items() if k not in ("declaration", "website", "accept")}
    return await _finish(
        c,
        kind="athlete",
        data=data,
        accepted=accepted,
        image_consent=body.imageConsent,
        signer=signer,
        client=client,
    )


# ------------------------------------------------------------------ decisão da secretaria
SPORT_NAMES = dict(zip(SPORTS, ("Atletismo", "Escola de Futsal", "Escola de Rugby", "Formação", "Escola de Desporto"), strict=True))


async def _pending(c: Conn, reg_id: str) -> Row:
    row = await (await c.execute("select * from registrations where id = %s for update", [reg_id])).fetchone()
    if not row:
        raise HttpError(404, "not_found", "Proposta não encontrada")
    if row["status"] != "pendente":
        raise HttpError(409, "conflict", f"A proposta já foi {row['status']}")
    return row


async def _decided(c: Conn, who: Actor, reg_id: str, status: str, note: str, **cols: Any) -> None:
    extra = "".join(f", {k} = %s" for k in cols)
    await c.execute(
        f"update registrations set status = %s, review_note = %s, reviewed_by = %s, reviewed_at = now(){extra} where id = %s",
        [status, note, who.id, *cols.values(), reg_id],
    )


async def approve(
    c: Conn, who: Actor, reg_id: str, *, category: str | None = None, note: str = "", member_number: str | None = None
) -> dict[str, Any]:
    """Aceita a proposta: cria o sócio (com o n.º seguinte) ou o atleta, dá acesso ao site e avisa por email."""
    reg = await _pending(c, reg_id)
    d: dict[str, Any] = reg["data"]
    first = str(reg["signer_name"]).split()[0]
    if reg["kind"] == "member":
        if await (await c.execute("select 1 from members where email = %s", [d["email"]])).fetchone():
            raise HttpError(409, "already_member", "Entretanto já existe um sócio com este email")
        if member_number and await (await c.execute("select 1 from members where member_number = %s", [member_number.zfill(5)])).fetchone():
            raise HttpError(409, "conflict", f"Já existe o sócio n.º {member_number.zfill(5)}")
        member = MemberIn(
            memberNumber=member_number,
            name=d["name"],
            email=d["email"],
            phone=d["phone"],
            taxNumber=d.get("taxNumber"),
            birthDate=d["birthDate"],
            address=d.get("address"),
            postalCode=d.get("postalCode"),
            city=d.get("city"),
            category=category or d.get("category") or "Efetivo",
            status="Ativo",
            joinedOn=date.today().isoformat(),
            notes="Proposta online" + (f" (proponente n.º {reg['proposer_number']})" if reg["proposer_number"] else ""),
        )
        number, _ = await save_member(c, who, member)
        await _decided(c, who, reg_id, "aceite", note, member_number=number)
        lines = [f"Olá {first},", f"A tua proposta foi aceite: és o sócio n.º {number} do Serrado Futebol Clube. Bem-vindo à família!"]
        result: dict[str, Any] = {"memberNumber": number}
    else:
        minor = age_on(d["birthDate"], date.today()) < 18
        g = d.get("guardian") or {}
        athlete = AthleteIn(
            name=d["name"],
            birthDate=d["birthDate"],
            gender=d["gender"],
            sport=d["sport"],
            idNumber=d.get("idNumber"),
            idExpiry=d.get("idExpiry"),
            taxNumber=d.get("taxNumber"),
            email=d.get("email"),
            phone=d.get("phone"),
            address=d.get("address"),
            postalCode=d.get("postalCode"),
            city=d.get("city"),
            guardianName=g.get("name") if minor and g else None,
            guardianEmail=g.get("email") if minor and g else None,
            accountEmail=None if minor else d.get("email"),
        )
        athlete_id, _ = await save_athlete(c, who, athlete)
        await c.execute(
            """update athletes set emergency_name = %s, emergency_phone = %s, shirt_size = %s, consent_rgpd = true, consent_image = %s
                where id = %s""",
            [d.get("emergencyName"), d.get("emergencyPhone"), d.get("shirtSize"), bool(d.get("imageConsent")), athlete_id],
        )
        code = (await (await c.execute("select code from athletes where id = %s", [athlete_id])).fetchone() or {}).get("code")
        await _decided(c, who, reg_id, "aceite", note, athlete_id=athlete_id)
        lines = [f"Olá {first},", f"A inscrição de {d['name']} em {SPORT_NAMES.get(d['sport'], d['sport'])} foi aceite. Código de atleta: {code}."]
        result = {"athleteId": athlete_id, "code": code}
    if note:
        lines.append(f"Nota da secretaria: {note}")
    lines.append("Vais receber (ou já recebeste) uma ligação para definir a password da área reservada; também podes usar «Esqueci-me da password».")
    if config.mail.enabled:
        await enqueue(
            c,
            to_email=reg["signer_email"],
            to_name=reg["signer_name"],
            subject="Proposta aceite — Serrado FC",
            html_body=layout("Proposta aceite", lines, (("Entrar no site", f"{config.oauth.site_url}/entrar"))),
        )
    await _invite_if_new(c, reg["signer_email"], reg["signer_name"])
    await audit(c, who, "registrations.approve", "registrations", reg_id, {"kind": reg["kind"], **result})
    return {"id": reg_id, "status": "aceite", **result}


async def reject(c: Conn, who: Actor, reg_id: str, note: str) -> dict[str, Any]:
    reg = await _pending(c, reg_id)
    await _decided(c, who, reg_id, "recusada", note)
    if config.mail.enabled:
        what = "de sócio" if reg["kind"] == "member" else f"de inscrição de {reg['data'].get('name', 'atleta')}"
        await enqueue(
            c,
            to_email=reg["signer_email"],
            to_name=reg["signer_name"],
            subject="Proposta não aceite — Serrado FC",
            html_body=layout(
                "Proposta não aceite",
                [
                    f"Olá {str(reg['signer_name']).split()[0]},",
                    f"A proposta {what} não foi aceite pela secretaria do clube.",
                    *([f"Motivo: {note}"] if note else []),
                    "Se tiveres dúvidas, responde a este email.",
                ],
            ),
        )
    await audit(c, who, "registrations.reject", "registrations", reg_id, {"kind": reg["kind"]})
    return {"id": reg_id, "status": "recusada"}


__all__ = [
    "KINDS",
    "TITLES",
    "AthleteSignup",
    "MemberSignup",
    "build_pdf",
    "confirm",
    "current_documents",
    "doc_hash",
    "approve",
    "publish_document",
    "register_athlete",
    "register_member",
    "reject",
]
