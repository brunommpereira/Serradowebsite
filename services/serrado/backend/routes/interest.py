"""
Pré-inscrições (ex.: Escola de Futsal): os pais deixam os contactos para o clube ligar.
Não cria contas nem fichas de atleta. A secretaria acompanha o estado no backoffice
(novo → contactado → inscrito / desistiu) e pode apagar o pedido (RGPD).
"""

from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...config import config
from ...db.pool import fetch, fetch_one, tx
from ...mail import enqueue, layout
from ...registry import DateStr, Email, Name, Phone
from ...validation import is_valid_phone
from ..core import HttpError, actor, audit, camel, not_found, pool, require

SPORT_NAMES = {"atletismo": "Atletismo", "futsal": "Futsal", "rugby": "Rugby", "formacao": "Formação", "escola-de-desporto": "Escola de Desporto"}
Status = Literal["novo", "contactado", "inscrito", "desistiu"]
Id = Annotated[int, Path(ge=1)]


class InterestForm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    sport: Literal["atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"] = "futsal"
    childName: Name
    birthDate: DateStr = None
    guardianName: Name
    email: Email
    phone: Phone
    notes: str = Field(default="", max_length=1000)
    consent: bool
    website: str = Field(default="", max_length=200)  # armadilha para robôs: tem de vir vazio

    @field_validator("email")
    @classmethod
    def _email_required(cls, v: str | None) -> str:
        if not v:
            raise ValueError("obrigatório")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str:
        if not v or not is_valid_phone(v):
            raise ValueError("telemóvel inválido")
        return v

    @field_validator("birthDate")
    @classmethod
    def _age(cls, v: str | None) -> str | None:
        if v and not (date(1920, 1, 1) <= date.fromisoformat(v) <= date.today()):
            raise ValueError("data de nascimento inválida")
        return v


class Client(BaseModel):
    ip: str = Field(min_length=2, max_length=64)
    userAgent: str = Field(default="", max_length=400)


class InterestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    form: InterestForm
    client: Client


class InterestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status | None = None
    staffNote: str | None = Field(default=None, max_length=2000)


async def club_email(c: Any) -> str:
    """Para onde vai o aviso: o email dos Contactos do site (ou o remetente dos emails)."""
    row = await fetch_one(c, "select data->>'email' as email from site_blocks where key = 'contacts'")
    return str((row or {}).get("email") or config.mail.from_email)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Pré-inscrições"]

    @r.post("/interest", tags=tags, summary="Pré-inscrição pública (o middleware junta o IP)", status_code=201)
    async def create(req: Request, body: InterestBody) -> dict[str, Any]:
        f = body.form
        if f.website:
            raise HttpError(400, "invalid", "Pedido inválido")
        if not f.consent:
            raise HttpError(400, "validation", "consent: é preciso aceitar ser contactado")
        assert f.email and f.phone
        sport = SPORT_NAMES[f.sport]
        async with tx(pool(req)) as c:
            # O mesmo pedido repetido (duplo clique, voltar atrás) não cria outro
            dup = await (
                await c.execute(
                    """select id from interest_signups where email = %s and lower(child_name) = lower(%s) and sport = %s
                        and created_at > now() - interval '30 days'""",
                    [f.email, f.childName, f.sport],
                )
            ).fetchone()
            if dup:
                return {"id": dup["id"], "duplicate": True}
            cur = await c.execute(
                """insert into interest_signups (sport, child_name, birth_date, guardian_name, email, phone, notes, consent_at, ip, user_agent)
                   values (%s, %s, %s, %s, %s, %s, %s, now(), %s, %s) returning id""",
                [f.sport, f.childName, f.birthDate, f.guardianName, f.email, f.phone, f.notes, body.client.ip, body.client.userAgent],
            )
            row = await cur.fetchone()
            assert row is not None
            if config.mail.enabled:
                await enqueue(
                    c,
                    to_email=f.email,
                    to_name=f.guardianName,
                    subject=f"Pré-inscrição recebida — {sport} — Serrado FC",
                    html_body=layout(
                        "Pré-inscrição recebida",
                        [
                            f"Olá {f.guardianName},",
                            f"Recebemos a pré-inscrição de {f.childName} em {sport}. Vamos entrar em contacto em breve para combinar o primeiro treino e explicar os próximos passos.",
                            "Se não foste tu a fazer este pedido, responde a este email e apagamos os dados.",
                        ],
                    ),
                )
                await enqueue(
                    c,
                    to_email=await club_email(c),
                    to_name="Serrado FC",
                    subject=f"Nova pré-inscrição — {sport}: {f.childName}",
                    html_body=layout(
                        f"Nova pré-inscrição — {sport}",
                        [
                            f"Criança: {f.childName}" + (f" (nascida a {f.birthDate})" if f.birthDate else ""),
                            f"Encarregado: {f.guardianName} · {f.phone} · {f.email}",
                            *([f"Observações: {f.notes}"] if f.notes else []),
                        ],
                        ("Ver no backoffice", f"{config.oauth.site_url}/admin/pre-inscricoes"),
                    ),
                )
        return {"id": row["id"], "duplicate": False}

    @r.get("/interest", tags=tags, summary="Pré-inscrições (secretaria)")
    async def list_(
        req: Request,
        status: Annotated[Status | None, Query()] = None,
        sport: Annotated[Literal["atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"] | None, Query()] = None,
    ) -> list[dict[str, Any]]:
        require(req, "registrations.manage")
        rows = await fetch(
            pool(req),
            """select i.id, i.sport, i.child_name, i.birth_date, i.guardian_name, i.email, i.phone, i.notes, i.status, i.staff_note,
                      i.created_at, i.updated_at, u.name as updated_by
                 from interest_signups i left join users u on u.id = i.updated_by
                where (%s::text is null or i.status = %s) and (%s::text is null or i.sport = %s)
                order by i.created_at desc limit 1000""",
            [status, status, sport, sport],
        )
        return [camel(x) for x in rows]

    @r.patch("/interest/{id}", tags=tags, summary="Muda o estado ou a nota interna")
    async def update(req: Request, id: Id, body: InterestUpdate) -> dict[str, Any]:
        require(req, "registrations.manage")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                """update interest_signups set status = coalesce(%s, status), staff_note = coalesce(%s, staff_note),
                          updated_at = now(), updated_by = %s where id = %s returning id, status, staff_note""",
                [body.status, body.staffNote, who.id, id],
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Pré-inscrição")
            await audit(c, who, "interest.update", "interest_signups", id, {"status": row["status"]})
        return camel(row)

    @r.delete("/interest/{id}", tags=tags, summary="Apaga (pedido do próprio ou já sem interesse)", status_code=204)
    async def delete(req: Request, id: Id) -> Response:
        require(req, "registrations.manage")
        async with tx(pool(req)) as c:
            cur = await c.execute("delete from interest_signups where id = %s returning sport", [id])
            if not await cur.fetchone():
                raise not_found("Pré-inscrição")
            await audit(c, actor(req), "interest.delete", "interest_signups", id, {})
        return Response(status_code=204)
