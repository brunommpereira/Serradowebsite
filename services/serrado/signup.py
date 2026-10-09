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
import binascii
import hashlib
import io
import json
import re
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from fpdf import FPDF
from PIL import Image, ImageChops, UnidentifiedImageError
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
MAX_SIGNATURE = 300_000  # bytes do PNG


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


# ------------------------------------------------------------------ assinatura
def check_signature(data_url: str) -> bytes:
    """PNG desenhado no browser → PNG limpo (sem metadados). Recusa imagens vazias ou que não são assinaturas."""
    m = re.fullmatch(r"data:image/png;base64,([A-Za-z0-9+/=]+)", data_url.strip())
    if not m:
        raise HttpError(400, "invalid_signature", "Assinatura inválida")
    try:
        raw = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        raise HttpError(400, "invalid_signature", "Assinatura inválida") from None
    if len(raw) > MAX_SIGNATURE or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HttpError(400, "invalid_signature", "Assinatura inválida")
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format != "PNG" or not (100 <= img.width <= 2000 and 50 <= img.height <= 1000):
                raise HttpError(400, "invalid_signature", "Assinatura inválida")
            rgba = img.convert("RGBA")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HttpError(400, "invalid_signature", "Assinatura inválida") from None
    # Traço: píxeis visíveis e escuros. Uma assinatura tem de ter algum (e não pode ser tudo).
    visible = rgba.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    dark = rgba.convert("L").point(lambda g: 255 if g < 160 else 0)
    ink = ImageChops.multiply(visible, dark).histogram()[255]
    ratio = ink / (rgba.width * rgba.height)
    if ink < 150 or ratio > 0.4:
        raise HttpError(400, "empty_signature", "Desenha a tua assinatura no quadro")
    out = io.BytesIO()
    rgba.save(out, format="PNG", optimize=True)
    return out.getvalue()


# ------------------------------------------------------------------ formulários
Required = Annotated[str, BeforeValidator(_blank), Field(min_length=1, max_length=200)]
ReqEmail = Annotated[str, BeforeValidator(_email)]
ReqDate = Annotated[str, BeforeValidator(_to_date)]


class _Signup(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    accept: dict[str, int] = Field(max_length=4)
    imageConsent: bool = False
    signature: str = Field(max_length=MAX_SIGNATURE * 2)
    website: str = Field(default="", max_length=200)  # armadilha para robôs: tem de vir vazio


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


def build_pdf(reg: dict[str, Any], docs: list[Row], labels: Sequence[tuple[str, str | None]], signature_png: bytes) -> bytes:
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
    pdf.cell(0, 7, "Assinatura", new_x="LMARGIN", new_y="NEXT", align="L")
    y = pdf.get_y()
    pdf.image(io.BytesIO(signature_png), x=pdf.l_margin, y=y, w=70)
    pdf.set_y(y + 32)
    pdf.set_font("Helvetica", "", 10)
    role = "titular" if reg["signerRole"] == "titular" else "encarregado de educação"
    pdf.multi_cell(0, 5, _t(f"{reg['signerName']} ({role}) · {reg['signerEmail']}"), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Prova da assinatura", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Helvetica", "", 8)
    for line in (
        f"Assinado em {reg['signedAt']} (UTC), a partir do endereço IP {reg['ip']}.",
        f"Navegador: {reg['userAgent'][:200]}",
        f"SHA-256 da imagem da assinatura: {reg['signatureSha256']}",
        "SHA-256 do registo (dados, documentos, assinatura, hora, IP e navegador):",
        reg["evidenceSha256"],
        "Assinatura eletrónica simples (Regulamento (UE) n.º 910/2014, eIDAS). O clube guarda estes elementos e este documento.",
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
    title: str,
    data: dict[str, Any],
    labels: Sequence[tuple[str, str | None]],
    accepted: list[dict[str, Any]],
    docs: list[Row],
    image_consent: bool,
    signature: bytes,
    signer: tuple[str, str, str],
    client: dict[str, str],
    member_number: str | None = None,
    athlete_id: str | None = None,
) -> dict[str, Any]:
    signed_at = datetime.now(UTC).replace(microsecond=0)
    sig_sha = hashlib.sha256(signature).hexdigest()
    name, email, role = signer
    evidence = {
        "kind": kind,
        "data": data,
        "accepted": accepted,
        "imageConsent": image_consent,
        "signer": {"name": name, "email": email, "role": role},
        "signatureSha256": sig_sha,
        "signedAt": signed_at.isoformat(),
        "ip": client["ip"],
        "userAgent": client["userAgent"],
    }
    ev_sha = _evidence(evidence)
    cur = await c.execute(
        """insert into registrations (kind, data, member_number, athlete_id, signer_name, signer_email, signer_role, accepted, image_consent,
                                      signature_png, signature_sha256, ip, user_agent, signed_at, evidence_sha256)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
        [
            kind,
            Jsonb(data),
            member_number,
            athlete_id,
            name,
            email,
            role,
            Jsonb(accepted),
            image_consent,
            signature,
            sig_sha,
            client["ip"],
            client["userAgent"],
            signed_at,
            ev_sha,
        ],
    )
    row = await cur.fetchone()
    assert row is not None
    reg_id = str(row["id"])
    pdf = await asyncio.to_thread(
        build_pdf,
        {
            "id": reg_id,
            "title": title,
            "signedLocal": signed_at.astimezone(LISBON).strftime("%d/%m/%Y %H:%M"),
            "signedAt": signed_at.strftime("%Y-%m-%d %H:%M:%S"),
            "accepted": accepted,
            "signerName": name,
            "signerEmail": email,
            "signerRole": role,
            "ip": client["ip"],
            "userAgent": client["userAgent"],
            "signatureSha256": sig_sha,
            "evidenceSha256": ev_sha,
        },
        docs,
        labels,
        signature,
    )
    await c.execute("update registrations set pdf = %s, pdf_sha256 = %s where id = %s", [pdf, hashlib.sha256(pdf).hexdigest(), reg_id])
    if config.mail.enabled:
        await enqueue(
            c,
            to_email=email,
            to_name=name,
            subject=f"{title} — Serrado FC",
            html_body=layout(
                title,
                [
                    f"Olá {name.split()[0]},",
                    "Obrigado! O registo ficou feito. Em anexo segue o documento assinado, com os dados, os documentos aceites e a prova da assinatura.",
                    "Para entrares na área reservada do site, usa a ligação que vais receber num email à parte (ou «Esqueci-me da password»).",
                ],
                footer="Se não foste tu, responde a este email ou contacta a secretaria do clube.",
            ),
            attachments=[{"name": f"registo-serrado-{reg_id[:8]}.pdf", "content": base64.b64encode(pdf).decode()}],
        )
    await audit(c, SYSTEM, f"registrations.{kind}", "registrations", reg_id, {"evidence": ev_sha[:16]})
    return {"id": reg_id, "evidenceSha256": ev_sha}


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
    signature = check_signature(body.signature)
    accepted, docs = await _accepted(c, "member", body)
    if await (await c.execute("select 1 from members where email = %s", [body.email])).fetchone():
        raise HttpError(409, "already_member", "Já existe um sócio com este email. Entra na área reservada ou contacta a secretaria.")
    categories = {r["category"] for r in await fetch(c, "select category from quota_plans where active")}
    category: str = (
        body.category
        if body.category and body.category in categories
        else ("Efetivo" if not categories or "Efetivo" in categories else sorted(categories)[0])
    )
    member = MemberIn(
        name=body.name,
        email=body.email,
        phone=body.phone,
        taxNumber=body.taxNumber,
        birthDate=body.birthDate,
        address=body.address,
        postalCode=body.postalCode,
        city=body.city,
        category=category,
        status="Ativo",
        joinedOn=date.today().isoformat(),
        notes="Registo online",
    )
    number, _ = await save_member(c, SYSTEM, member)
    data = {k: v for k, v in body.model_dump().items() if k not in ("signature", "website", "accept")} | {
        "memberNumber": number,
        "category": category,
    }
    labels = [
        ("N.º de sócio", number),
        ("Nome", body.name),
        ("Email", body.email),
        ("Telemóvel", body.phone),
        ("NIF", body.taxNumber or ""),
        ("Data de nascimento", body.birthDate),
        ("Morada", ", ".join(x for x in (body.address, body.postalCode, body.city) if x)),
        ("Categoria", category),
        ("Imagem", "Autoriza" if body.imageConsent else "Não autoriza"),
    ]
    out = await _finish(
        c,
        kind="member",
        title="Ficha de inscrição de sócio",
        data=data,
        labels=labels,
        accepted=accepted,
        docs=docs,
        image_consent=body.imageConsent,
        signature=signature,
        signer=(body.name, body.email, "titular"),
        client=client,
        member_number=number,
    )
    await _invite_if_new(c, body.email, body.name)
    return {**out, "memberNumber": number}


async def register_athlete(c: Conn, body: AthleteSignup, client: dict[str, str]) -> dict[str, Any]:
    if body.website:
        raise HttpError(400, "invalid", "Pedido inválido")
    minor = age_on(body.birthDate, date.today()) < 18
    if minor and not body.guardian:
        raise HttpError(400, "validation", "guardian: obrigatório para menores de 18 anos")
    if not minor and not body.email:
        raise HttpError(400, "validation", "email: obrigatório (o atleta assina e recebe o documento)")
    signature = check_signature(body.signature)
    accepted, docs = await _accepted(c, "athlete", body)
    if await (await c.execute("select 1 from athletes where lower(name) = lower(%s) and birth_date = %s", [body.name, body.birthDate])).fetchone():
        raise HttpError(409, "already_registered", "Este atleta já está inscrito. Fala com a secretaria para renovar ou alterar a inscrição.")
    athlete = AthleteIn(
        name=body.name,
        birthDate=body.birthDate,
        gender=body.gender,
        sport=body.sport,
        idNumber=body.idNumber,
        idExpiry=body.idExpiry,
        taxNumber=body.taxNumber,
        email=body.email,
        phone=body.phone,
        address=body.address,
        postalCode=body.postalCode,
        city=body.city,
        guardianName=body.guardian.name if minor and body.guardian else None,
        guardianEmail=body.guardian.email if minor and body.guardian else None,
        accountEmail=None if minor else body.email,
    )
    athlete_id, _ = await save_athlete(c, SYSTEM, athlete)
    await c.execute(
        """update athletes set emergency_name = %s, emergency_phone = %s, shirt_size = %s, consent_rgpd = true, consent_image = %s
            where id = %s""",
        [body.emergencyName, body.emergencyPhone, body.shirtSize, body.imageConsent, athlete_id],
    )
    code = (await (await c.execute("select code from athletes where id = %s", [athlete_id])).fetchone() or {}).get("code")
    if minor and body.guardian:
        signer = (body.guardian.name, body.guardian.email, "encarregado")
    else:
        assert body.email is not None
        signer = (body.name, body.email, "titular")
    data = {k: v for k, v in body.model_dump().items() if k not in ("signature", "website", "accept")} | {"code": code}
    g = body.guardian
    labels = [
        ("Código", code or ""),
        ("Nome", body.name),
        ("Data de nascimento", body.birthDate),
        ("Género", body.gender),
        (
            "Modalidade",
            dict(zip(SPORTS, ("Atletismo", "Escola de Futsal", "Escola de Rugby", "Formação", "Escola de Desporto"), strict=True))[body.sport],
        ),
        ("N.º do CC", body.idNumber or ""),
        ("NIF", body.taxNumber or ""),
        ("Email", body.email or ""),
        ("Telemóvel", body.phone or ""),
        ("Morada", ", ".join(x for x in (body.address, body.postalCode, body.city) if x)),
        ("Contacto de emergência", f"{body.emergencyName} · {body.emergencyPhone}"),
        ("Encarregado", f"{g.name} ({g.relation}) · {g.email} · {g.phone}" if minor and g else ""),
        ("Imagem", "Autoriza" if body.imageConsent else "Não autoriza"),
    ]
    out = await _finish(
        c,
        kind="athlete",
        title="Ficha de inscrição de atleta",
        data=data,
        labels=labels,
        accepted=accepted,
        docs=docs,
        image_consent=body.imageConsent,
        signature=signature,
        signer=signer,
        client=client,
        athlete_id=athlete_id,
    )
    await _invite_if_new(c, signer[1], signer[0])
    return {**out, "code": code}


__all__ = [
    "KINDS",
    "TITLES",
    "AthleteSignup",
    "MemberSignup",
    "build_pdf",
    "check_signature",
    "current_documents",
    "doc_hash",
    "publish_document",
    "register_athlete",
    "register_member",
]
