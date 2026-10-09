"""Registo online de sócios e atletas (público) e, no backoffice, documentos legais e registos assinados."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend
from ..session import staff
from .payments import _pdf

JsonObject = Annotated[dict[str, Any], Body()]
RegId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]


def _client(req: Request) -> dict[str, str]:
    """O IP vem do middleware (com as regras de proxy de confiança), nunca do formulário."""
    return {"ip": str(req.state.ip), "userAgent": req.headers.get("user-agent", "")[:400]}


def register(r: APIRouter) -> None:
    public: list[str | Any] = ["Registo online"]
    office: list[str | Any] = ["Backoffice · Registos"]

    @r.get("/registrations/form", tags=public, summary="Documentos a aceitar, categorias e modalidades")
    async def form(req: Request) -> Any:
        return await backend(req).call("GET", "/signup/form")

    @r.post("/registrations/{kind}", tags=public, summary="Registo de sócio ou de atleta com assinatura desenhada", status_code=201)
    async def submit(req: Request, kind: Annotated[Literal["member", "athlete"], Path()], body: JsonObject) -> Any:
        return await backend(req).call("POST", f"/signup/{kind}", body={"form": body, "client": _client(req)})

    @r.get("/admin/legal", tags=office, summary="Documentos legais (em vigor e histórico)")
    async def legal(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/legal", actor=s)

    @r.post("/admin/legal/{kind}", tags=office, summary="Publicar versão nova", status_code=201)
    async def publish(req: Request, kind: Annotated[Literal["socio", "atleta", "rgpd", "imagem"], Path()], body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/legal/{kind}", actor=s, body=body)

    @r.get("/admin/registrations", tags=office, summary="Registos online assinados")
    async def registrations(req: Request, kind: Literal["member", "athlete"] | None = None) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/registrations", actor=s, query={"kind": kind})

    @r.get("/admin/registrations/{id}/pdf", tags=office, summary="PDF assinado")
    async def pdf(req: Request, id: RegId) -> Response:
        s = await staff(req)
        return _pdf(await backend(req).call("GET", f"/registrations/{id}/pdf", actor=s))
