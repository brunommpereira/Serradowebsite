"""Registo online (público, através do middleware) e, no backoffice, os documentos legais e os registos assinados."""

import base64
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Request
from pydantic import BaseModel, ConfigDict, Field

from ...db.pool import fetch, fetch_one, tx
from ...legal_templates import TEMPLATES
from ...registry import SPORTS
from ...signup import (
    KINDS,
    TITLES,
    AthleteSignup,
    MemberSignup,
    approve,
    confirm,
    current_documents,
    publish_document,
    register_athlete,
    register_member,
    reject,
)
from ..core import actor, can, not_found, pool, require

Kind = Annotated[Literal["socio", "atleta", "rgpd", "imagem"], Path()]
RegId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]


class Client(BaseModel):
    """Quem submeteu (posto pelo middleware, não pelo browser)."""

    ip: str = Field(min_length=2, max_length=64)
    userAgent: str = Field(default="", max_length=400)


class MemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    form: MemberSignup
    client: Client


class AthleteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    form: AthleteSignup
    client: Client


class ConfirmBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    client: Client


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(default="", max_length=2000)
    category: str | None = Field(default=None, min_length=2, max_length=40)
    # N.º de sócio escolhido pela secretaria (vazio: o maior que existe + 1)
    memberNumber: str | None = Field(default=None, pattern=r"^\d{1,8}$")


class LegalBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=20, max_length=60000)


def register(r: APIRouter) -> None:
    public: list[str | Any] = ["Registo online"]
    office: list[str | Any] = ["Backoffice · Registos"]

    @r.get("/signup/form", tags=public, summary="Documentos em vigor, categorias de sócio e modalidades para os formulários")
    async def form(req: Request) -> dict[str, Any]:
        docs = await current_documents(pool(req))
        categories = [x["category"] for x in await fetch(pool(req), "select category from quota_plans where active order by category")]
        return {
            "documents": {k: {"version": d["version"], "title": d["title"], "body": d["body"], "sha256": d["sha256"]} for k, d in docs.items()},
            "ready": {"member": all(k in docs for k in ("socio", "rgpd", "imagem")), "athlete": all(k in docs for k in ("atleta", "rgpd", "imagem"))},
            "categories": categories or ["Efetivo"],
            "sports": list(SPORTS),
        }

    @r.post(
        "/signup/member",
        tags=public,
        summary="Proposta de sócio (aceitação + confirmação por email; depois fica à espera da secretaria)",
        status_code=201,
    )
    async def signup_member(req: Request, body: MemberBody) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            return await register_member(c, body.form, body.client.model_dump())

    @r.post("/signup/athlete", tags=public, summary="Proposta de inscrição de atleta (aceitação + confirmação por email)", status_code=201)
    async def signup_athlete(req: Request, body: AthleteBody) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            return await register_athlete(c, body.form, body.client.model_dump())

    # ------------------------------------------------------------- backoffice
    @r.post("/signup/confirm", tags=public, summary="Confirmação por email: a proposta passa à secretaria (com o PDF)")
    async def confirm_signup(req: Request, body: ConfirmBody) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            return await confirm(c, body.token, body.client.model_dump())

    @r.get("/legal", tags=office, summary="Documentos legais: versão em vigor e histórico")
    async def legal(req: Request) -> dict[str, Any]:
        require(req, "registrations.manage")
        current = await current_documents(pool(req))
        history = await fetch(
            pool(req),
            """select d.kind, d.version, d.title, d.sha256, d.created_at as "createdAt", u.name as "createdBy",
                      (select count(*)::int from registrations g where g.accepted @> jsonb_build_array(jsonb_build_object('kind', d.kind, 'version', d.version)))
                        as registrations
                 from legal_documents d left join users u on u.id = d.created_by order by d.kind, d.version desc""",
        )
        return {
            "kinds": [{"kind": k, "label": TITLES[k]} for k in KINDS],
            "current": {k: {"version": d["version"], "title": d["title"], "body": d["body"]} for k, d in current.items()},
            "history": history,
            # Pontos de partida para a direção rever antes de publicar
            "templates": {k: {"title": t, "body": b} for k, (t, b) in TEMPLATES.items()},
        }

    @r.post("/legal/{kind}", tags=office, summary="Publica uma versão nova (as anteriores ficam como estavam)", status_code=201)
    async def publish(req: Request, kind: Kind, body: LegalBody) -> dict[str, Any]:
        require(req, "registrations.manage")
        async with tx(pool(req)) as c:
            return await publish_document(c, actor(req), kind, body.title, body.body)

    @r.get("/registrations", tags=office, summary="Registos online assinados (mais recentes primeiro)")
    async def registrations(
        req: Request,
        kind: Literal["member", "athlete"] | None = None,
        status: Literal["por_confirmar", "pendente", "aceite", "recusada"] | None = None,
    ) -> list[dict[str, Any]]:
        require(req, "registrations.manage")
        rows = await fetch(
            pool(req),
            """select g.id, g.kind, g.status, g.signed_at as "signedAt", g.signer_name as "signerName", g.signer_email as "signerEmail",
                      g.signer_role as "signerRole", g.image_consent as "imageConsent", g.member_number as "memberNumber",
                      a.code as "athleteCode", coalesce(g.data->>'name', '') as name, g.evidence_sha256 as "evidenceSha256",
                      g.proposer_number as "proposerNumber", p.name as "proposerName", g.data,
                      g.review_note as "reviewNote", g.reviewed_at as "reviewedAt", u.name as "reviewedBy",
                      g.confirmed_at as "confirmedAt", (g.pdf is not null) as "hasPdf"
                 from registrations g left join athletes a on a.id = g.athlete_id
                      left join members p on p.member_number = g.proposer_number
                      left join users u on u.id = g.reviewed_by
                where (%s::text is null or g.kind = %s) and (%s::text is null or g.status = %s)
                order by g.signed_at desc limit 500""",
            [kind, kind, status, status],
        )
        # CC, NIF e morada dos atletas propostos só para quem vê dados sensíveis
        if not can(req, "athletes.sensitive"):
            for r in rows:
                if r["kind"] == "athlete":
                    r["data"] = {k: v for k, v in r["data"].items() if k not in ("idNumber", "idExpiry", "taxNumber", "address", "postalCode")}
        return rows

    @r.get("/registrations/next-member-number", tags=office, summary="O n.º que o próximo sócio vai ter (o maior que existe + 1)")
    async def next_number(req: Request) -> dict[str, str]:
        require(req, "registrations.manage")
        row = await fetch_one(
            pool(req), "select lpad((coalesce(max(member_number::int), 0) + 1)::text, 5, '0') as n from members where member_number ~ '^\\d{1,8}$'"
        )
        return {"memberNumber": str((row or {}).get("n") or "00001")}

    @r.post("/registrations/{id}/approve", tags=office, summary="Aceita a proposta: cria o sócio (n.º seguinte) ou o atleta")
    async def approve_registration(req: Request, id: RegId, body: Decision) -> dict[str, Any]:
        require(req, "registrations.manage")
        async with tx(pool(req)) as c:
            kind = await (await c.execute("select kind from registrations where id = %s", [id])).fetchone()
            if not kind:
                raise not_found("Proposta")
            require(req, "members.manage" if kind["kind"] == "member" else "athletes.manage")
            return await approve(c, actor(req), id, category=body.category, note=body.note, member_number=body.memberNumber)

    @r.post("/registrations/{id}/reject", tags=office, summary="Recusa a proposta (email com o motivo)")
    async def reject_registration(req: Request, id: RegId, body: Decision) -> dict[str, Any]:
        require(req, "registrations.manage")
        async with tx(pool(req)) as c:
            return await reject(c, actor(req), id, body.note)

    @r.get("/registrations/{id}/pdf", tags=office, summary="PDF assinado")
    async def registration_pdf(req: Request, id: RegId) -> dict[str, str]:
        require(req, "registrations.manage")
        row = await fetch_one(pool(req), "select pdf from registrations where id = %s", [id])
        if not row or not row["pdf"]:
            raise not_found("Registo")
        return {"filename": f"registo-{id[:8]}.pdf", "data": base64.b64encode(row["pdf"]).decode()}
