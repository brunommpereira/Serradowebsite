"""
Inscrições nos eventos do site (eventos do CMS publicados com «Exige inscrição»).

- Uma inscrição pode ser para várias pessoas (a família); conta para a lotação (capacity, 0 = sem limite).
- O valor é o preço do evento × pessoas (o preço de sócio, se o evento o tiver e a pessoa indicar que é sócia).
  O pagamento não é feito no site: a tesouraria ou a secretaria marcam «pago» no backoffice.
- Quem se inscreve recebe um email com o n.º de inscrição; o clube recebe um aviso.
"""

import secrets
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...config import config
from ...db.pool import fetch, fetch_one, tx
from ...mail import enqueue, layout
from ...registry import Email, Name, Phone
from ...validation import is_valid_phone
from ..core import HttpError, actor, audit, camel, not_found, pool, require
from .interest import Client, club_email

Status = Literal["inscrito", "pago", "cancelado"]
Id = Annotated[int, Path(ge=1)]
Slug = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,120}$")]
STAFF = ("registrations.manage", "payments.manage")
SHIRTS = ("6A", "10A", "XS", "S", "M", "L", "XL", "XXL")
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O nem 1/I


class RegistrationForm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Name
    email: Email
    phone: Phone
    people: int = Field(default=1, ge=1, le=20)
    isMember: bool = False
    memberNumber: str = Field(default="", max_length=20)
    sport: Literal["atletismo", "futsal", "rugby"] | None = None
    shirtSize: str | None = None
    notes: str = Field(default="", max_length=1000)
    consent: bool
    consentImage: bool = False
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

    @field_validator("shirtSize")
    @classmethod
    def _shirt(cls, v: str | None) -> str | None:
        if v and v not in SHIRTS:
            raise ValueError("tamanho inválido")
        return v or None


class RegistrationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    form: RegistrationForm
    client: Client


class RegistrationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status | None = None
    staffNote: str | None = Field(default=None, max_length=2000)


def euros(v: Any) -> str:
    return f"{Decimal(v):.2f}".replace(".", ",").replace(",00", "") + " €"


async def taken(c: Any, event_id: int) -> int:
    row = await fetch_one(
        c, "select coalesce(sum(people), 0)::int as n from event_registrations where event_id = %s and status <> 'cancelado'", [event_id]
    )
    return int((row or {}).get("n") or 0)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Inscrições em eventos"]

    @r.get("/events/{slug}/availability", tags=tags, summary="Vagas e se aceita inscrições (público)")
    async def availability(req: Request, slug: Slug) -> dict[str, Any]:
        e = await fetch_one(
            pool(req),
            "select id, capacity, registration_required, starts_at > (now() at time zone 'Europe/Lisbon') as future from cms_events where slug = %s and status = 'published'",
            [slug],
        )
        if not e:
            raise not_found("Evento")
        n = await taken(pool(req), e["id"])
        open_ = bool(e["registration_required"]) and bool(e["future"]) and (not e["capacity"] or n < e["capacity"])
        return {"registered": n, "capacity": e["capacity"], "open": open_}

    @r.post("/events/{slug}/registrations", tags=tags, summary="Inscrição pública (o middleware junta o IP)", status_code=201)
    async def create(req: Request, slug: Slug, body: RegistrationBody) -> dict[str, Any]:
        f = body.form
        if f.website:
            raise HttpError(400, "invalid", "Pedido inválido")
        if not f.consent:
            raise HttpError(400, "validation", "consent: é preciso aceitar o tratamento dos dados")
        assert f.email and f.phone
        async with tx(pool(req)) as c:
            e = await (
                await c.execute(
                    """select id, title, location, capacity, price, member_price, registration_required, ask_shirt_size, payment_info,
                              to_char(starts_at, 'DD/MM/YYYY "às" HH24"h"MI') as starts, starts_at > (now() at time zone 'Europe/Lisbon') as future
                         from cms_events where slug = %s and status = 'published' for update""",
                    [slug],
                )
            ).fetchone()
            if not e:
                raise not_found("Evento")
            if not e["registration_required"] or not e["future"]:
                raise HttpError(409, "closed", "As inscrições neste evento estão fechadas")
            if e["ask_shirt_size"] and not f.shirtSize:
                raise HttpError(400, "validation", "shirtSize: escolhe o tamanho da t-shirt")
            # O mesmo pedido repetido (duplo clique, voltar atrás) não cria outro
            dup = await (
                await c.execute(
                    """select code, people, amount from event_registrations
                        where event_id = %s and email = %s and lower(name) = lower(%s) and status <> 'cancelado'""",
                    [e["id"], f.email, f.name],
                )
            ).fetchone()
            if dup:
                return {"code": dup["code"], "people": dup["people"], "amount": float(dup["amount"]), "duplicate": True}
            if e["capacity"] and await taken(c, e["id"]) + f.people > e["capacity"]:
                left = max(0, e["capacity"] - await taken(c, e["id"]))
                raise HttpError(409, "full", f"Já não há vagas para {f.people} pessoas (restam {left})")
            unit = e["member_price"] if f.isMember and e["member_price"] is not None else e["price"]
            amount = Decimal(unit) * f.people
            code = f"EV{e['id']}-" + "".join(secrets.choice(CODE_CHARS) for _ in range(6))
            await c.execute(
                """insert into event_registrations (event_id, code, name, email, phone, people, is_member, member_number, sport,
                          shirt_size, notes, amount, consent_at, consent_image, ip, user_agent)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), %s, %s, %s)""",
                [
                    e["id"],
                    code,
                    f.name,
                    f.email,
                    f.phone,
                    f.people,
                    f.isMember,
                    f.memberNumber if f.isMember else "",
                    f.sport,
                    f.shirtSize,
                    f.notes,
                    amount,
                    f.consentImage,
                    body.client.ip,
                    body.client.userAgent,
                ],
            )
            when = e["starts"]
            who = "1 pessoa" if f.people == 1 else f"{f.people} pessoas"
            total = euros(amount) if amount else "gratuito"
            if config.mail.enabled:
                await enqueue(
                    c,
                    to_email=f.email,
                    to_name=f.name,
                    subject=f"Inscrição confirmada — {e['title']} — Serrado FC",
                    html_body=layout(
                        "Inscrição confirmada",
                        [
                            f"Olá {f.name},",
                            f"A tua inscrição em «{e['title']}» ({when}, {e['location']}) está registada.",
                            f"N.º de inscrição: {code} · {who} · total {total}.",
                            *([e["payment_info"] or "O clube vai indicar-te como fazer o pagamento."] if amount else []),
                            "Se precisares de alterar ou cancelar, responde a este email.",
                        ],
                        ("Ver o evento", f"{config.oauth.site_url}/eventos/{slug}"),
                    ),
                )
                await enqueue(
                    c,
                    to_email=await club_email(c),
                    to_name="Serrado FC",
                    subject=f"Nova inscrição — {e['title']}: {f.name} ({who})",
                    html_body=layout(
                        f"Nova inscrição — {e['title']}",
                        [
                            f"{f.name} · {f.phone} · {f.email}",
                            f"{who} · total {total}"
                            + (f" · sócio n.º {f.memberNumber}" if f.isMember and f.memberNumber else " · sócio" if f.isMember else ""),
                            *([f"Observações: {f.notes}"] if f.notes else []),
                            f"N.º de inscrição: {code}",
                        ],
                        ("Ver no backoffice", f"{config.oauth.site_url}/admin/inscricoes-eventos"),
                    ),
                )
        return {"code": code, "people": f.people, "amount": float(amount), "duplicate": False}

    @r.get("/event-registrations/events", tags=tags, summary="Eventos com inscrição, com totais (backoffice)")
    async def events(req: Request) -> list[dict[str, Any]]:
        require(req, *STAFF)
        rows = await fetch(
            pool(req),
            """select e.id, e.slug, e.title, to_char(e.starts_at, 'YYYY-MM-DD"T"HH24:MI') as starts_at, e.capacity, e.price, e.status,
                      coalesce(sum(r.people) filter (where r.status <> 'cancelado'), 0)::int as people,
                      count(r.id) filter (where r.status <> 'cancelado')::int as registrations,
                      coalesce(sum(r.amount) filter (where r.status <> 'cancelado'), 0) as amount,
                      coalesce(sum(r.amount) filter (where r.status = 'pago'), 0) as paid
                 from cms_events e left join event_registrations r on r.event_id = e.id
                where e.registration_required or r.id is not null
                group by e.id order by e.starts_at desc""",
        )
        return [camel({**x, "amount": float(x["amount"]), "paid": float(x["paid"]), "price": float(x["price"])}) for x in rows]

    @r.get("/event-registrations", tags=tags, summary="Inscrições de um evento (backoffice)")
    async def list_(req: Request, event_id: Annotated[int, Query(alias="eventId", ge=1)]) -> list[dict[str, Any]]:
        require(req, *STAFF)
        rows = await fetch(
            pool(req),
            """select r.id, r.code, r.name, r.email, r.phone, r.people, r.is_member, r.member_number, r.sport, r.shirt_size, r.notes,
                      r.amount, r.consent_image, r.status, r.staff_note, r.created_at, r.updated_at, u.name as updated_by
                 from event_registrations r left join users u on u.id = r.updated_by
                where r.event_id = %s order by r.created_at desc""",
            [event_id],
        )
        return [camel({**x, "amount": float(x["amount"])}) for x in rows]

    @r.patch("/event-registrations/{id}", tags=tags, summary="Estado (inscrito, pago, cancelado) e nota interna")
    async def update(req: Request, id: Id, body: RegistrationUpdate) -> dict[str, Any]:
        require(req, *STAFF)
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                """update event_registrations set status = coalesce(%s, status), staff_note = coalesce(%s, staff_note),
                          updated_at = now(), updated_by = %s where id = %s returning id, status, staff_note""",
                [body.status, body.staffNote, who.id, id],
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Inscrição")
            await audit(c, who, "event_registration.update", "event_registrations", id, {"status": row["status"]})
        return camel(row)

    @r.delete("/event-registrations/{id}", tags=tags, summary="Apaga (pedido do próprio, RGPD)", status_code=204)
    async def delete(req: Request, id: Id) -> Response:
        require(req, "registrations.manage")
        async with tx(pool(req)) as c:
            cur = await c.execute("delete from event_registrations where id = %s returning code", [id])
            if not await cur.fetchone():
                raise not_found("Inscrição")
            await audit(c, actor(req), "event_registration.delete", "event_registrations", id, {})
        return Response(status_code=204)
