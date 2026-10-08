"""Área reservada (sócio, atleta, encarregado): sempre em nome do utilizador da sessão."""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request

from ...web import HttpError
from ..deps import backend
from ..session import session

AthleteId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
Provider = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,32}$")]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    @r.get("/me", tags=["Sessão"], summary="Utilizador atual: papéis, sócio (opcional) e atletas acompanhados")
    async def me(req: Request) -> Any:
        s = await session(req)
        return await backend(req).call("GET", f"/users/{s.sub}", actor=s)

    @r.get("/me/identities", tags=["Sessão"], summary="Contas Google/Microsoft ligadas a esta conta")
    async def identities(req: Request) -> Any:
        s = await session(req)
        return await backend(req).call("GET", f"/users/{s.sub}/identities", actor=s)

    @r.delete("/me/identities/{provider}", tags=["Sessão"], summary="Desligar uma conta Google/Microsoft")
    async def unlink(req: Request, provider: Provider) -> Any:
        s = await session(req)
        return await backend(req).call("DELETE", f"/users/{s.sub}/identities/{provider}", actor=s)

    async def member_number(req: Request) -> tuple[Any, str]:
        s = await session(req)
        me = await backend(req).call("GET", f"/users/{s.sub}", actor=s)
        if not me.get("member"):
            raise HttpError(404, "not_member", "Esta conta não está associada a um sócio")
        return s, me["member"]["memberNumber"]

    @r.get("/me/member", tags=["Área de Sócio"], summary="Os meus dados de sócio")
    async def my_member(req: Request) -> Any:
        s, number = await member_number(req)
        return await backend(req).call("GET", f"/members/{number}", actor=s)

    @r.get("/me/quotas", tags=["Área de Sócio"], summary="As minhas quotas e pagamentos")
    async def my_quotas(req: Request) -> Any:
        s, number = await member_number(req)
        return await backend(req).call("GET", f"/members/{number}/quotas", actor=s)

    tags: list[str | Any] = ["Área de Atletas"]

    @r.get("/me/athletes", tags=tags, summary="Os meus atletas (educandos e/ou o próprio)")
    async def my_athletes(req: Request) -> Any:
        s = await session(req)
        return await backend(req).call("GET", "/athletes", actor=s, query={"scope": "mine"})

    @r.get("/athletes/{id}", tags=tags, summary="Ficha do atleta")
    async def athlete(req: Request, id: AthleteId) -> Any:
        s = await session(req)
        return await backend(req).call("GET", f"/athletes/{id}", actor=s)

    @r.patch("/athletes/{id}", tags=tags, summary="Alterar contactos, emergência, equipamento, consentimentos")
    async def update(req: Request, id: AthleteId, body: JsonObject) -> Any:
        s = await session(req)
        return await backend(req).call("PATCH", f"/athletes/{id}", actor=s, body=body)

    @r.post("/athletes/{id}/confirm", tags=tags, summary="Confirmar a ficha da época")
    async def confirm(req: Request, id: AthleteId) -> Any:
        s = await session(req)
        return await backend(req).call("POST", f"/athletes/{id}/confirm", actor=s)

    @r.post("/athletes/{id}/change-requests", tags=tags, summary="Pedir alteração de dados de identificação", status_code=201)
    async def change_request(req: Request, id: AthleteId, body: JsonObject) -> Any:
        s = await session(req)
        return await backend(req).call("POST", f"/athletes/{id}/change-requests", actor=s, body=body)

    @r.get("/athletes/{id}/results", tags=tags, summary="Resultados no Troféu de Almada")
    async def results(req: Request, id: AthleteId) -> Any:
        s = await session(req)
        return await backend(req).call("GET", f"/athletes/{id}/results", actor=s)
