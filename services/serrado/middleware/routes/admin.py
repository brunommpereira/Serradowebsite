"""
Backoffice (/api/v1/admin). Exige sessão; as permissões (papéis editáveis no
backoffice) verifica-as o backend em cada pedido. Escritas no CMS limpam a cache do conteúdo público.
"""

import asyncio
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Path, Query, Request, Response

from ..backend_client import BackendError
from ..deps import backend, cache
from ..session import staff

CmsType = Annotated[Literal["news", "events", "pages", "partners"], Path()]
Id = Annotated[int, Path(ge=1)]
UserId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
JsonObject = Annotated[dict[str, Any], Body()]
OptionalJson = Annotated[dict[str, Any] | None, Body()]


def _query(req: Request) -> dict[str, Any]:
    return dict(req.query_params)


def register(r: APIRouter) -> None:
    # ---------------------------------------------------------------- dashboard (agregação)
    @r.get("/dashboard", tags=["Backoffice"], summary="Indicadores + atividade recente + o que precisa de atenção (agregado)")
    async def dashboard(req: Request) -> Any:
        s = await staff(req)
        b = backend(req)

        async def optional(path: str) -> list[Any]:
            """Só para quem tem a permissão (athletes.manage); os outros veem a lista vazia."""
            try:
                return list(await b.call("GET", path, actor=s))
            except BackendError as e:
                if e.status == 403:
                    return []
                raise

        stats, activity, requests, documents, me = await asyncio.gather(
            b.call("GET", "/stats", actor=s),
            b.call("GET", "/audit", actor=s, query={"limit": 8}),
            optional("/change-requests"),
            optional("/documents"),
            b.call("GET", f"/users/{s.sub}", actor=s),
        )
        return {
            "user": {"name": s.name, "roles": me["roles"], "permissions": me["permissions"]},
            "stats": stats,
            "activity": activity,
            "attention": {"requests": requests[:5], "documents": documents[:5]},
        }

    # Antes de «/{kind}/{id}/{action}» (pedidos e documentos), que apanharia este caminho
    @r.post("/users/{id}/invite", tags=["Backoffice · Gestão"], summary="Enviar convite por email (definir password)", status_code=202)
    async def user_invite(req: Request, id: UserId) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/users/{id}/invite", actor=s, body={})

    # ---------------------------------------------------------------- Imagens (biblioteca do CMS)
    media_tags: list[str | Any] = ["Backoffice · Imagens"]

    @r.get("/media", tags=media_tags, summary="Lista as imagens")
    async def media_list(req: Request, q: Annotated[str | None, Query(max_length=100)] = None) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/cms/media", actor=s, query=_query(req))

    @r.post("/media", tags=media_tags, summary="Carrega uma imagem (base64; o browser reduz e converte antes)", status_code=201)
    async def media_upload(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/cms/media", actor=s, body=body)

    @r.patch("/media/{id}", tags=media_tags, summary="Altera o texto alternativo")
    async def media_alt(req: Request, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PATCH", f"/cms/media/{id}", actor=s, body=body)

    @r.get("/media/{id}/usage", tags=media_tags, summary="Onde a imagem é usada")
    async def media_usage(req: Request, id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/cms/media/{id}/usage", actor=s)

    @r.delete("/media/{id}", tags=media_tags, summary="Apaga (recusa se estiver a ser usada)", status_code=204)
    async def media_delete(req: Request, id: Id) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/cms/media/{id}", actor=s)
        return Response(status_code=204)

    # ---------------------------------------------------------------- CMS
    cms_tags: list[str | Any] = ["Backoffice · CMS"]

    @r.get("/cms/{type}", tags=cms_tags, summary="Lista (todos os estados)")
    async def cms_list(req: Request, type: CmsType) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/cms/{type}", actor=s, query=_query(req))

    @r.get("/cms/{type}/{id}", tags=cms_tags, summary="Detalhe")
    async def cms_get(req: Request, type: CmsType, id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/cms/{type}/{id}", actor=s)

    @r.post("/cms/{type}", tags=cms_tags, summary="Criar rascunho", status_code=201)
    async def cms_create(req: Request, type: CmsType, body: JsonObject) -> Any:
        s = await staff(req)
        out = await backend(req).call("POST", f"/cms/{type}", actor=s, body=body)
        cache(req).invalidate("content:")
        return out

    @r.put("/cms/{type}/{id}", tags=cms_tags, summary="Guardar (nova revisão)")
    async def cms_update(req: Request, type: CmsType, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        out = await backend(req).call("PUT", f"/cms/{type}/{id}", actor=s, body=body)
        cache(req).invalidate("content:")
        return out

    @r.delete("/cms/{type}/{id}", tags=cms_tags, summary="Apagar", status_code=204)
    async def cms_delete(req: Request, type: CmsType, id: Id) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/cms/{type}/{id}", actor=s)
        cache(req).invalidate("content:")
        return Response(status_code=204)

    @r.post("/cms/{type}/{id}/{action}", tags=cms_tags, summary="Publicar, despublicar ou arquivar")
    async def cms_status(req: Request, type: CmsType, id: Id, action: Annotated[Literal["publish", "unpublish", "archive"], Path()]) -> Any:
        s = await staff(req)
        out = await backend(req).call("POST", f"/cms/{type}/{id}/{action}", actor=s)
        cache(req).invalidate("content:")
        return out

    @r.get("/cms/{type}/{id}/revisions", tags=cms_tags, summary="Histórico de versões")
    async def cms_revisions(req: Request, type: CmsType, id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/cms/{type}/{id}/revisions", actor=s)

    @r.post("/cms/{type}/{id}/revisions/{rev}/restore", tags=cms_tags, summary="Repor versão")
    async def cms_restore(req: Request, type: CmsType, id: Id, rev: int) -> Any:
        s = await staff(req)
        out = await backend(req).call("POST", f"/cms/{type}/{id}/revisions/{rev}/restore", actor=s)
        cache(req).invalidate("content:")
        return out

    # ---------------------------------------------------------------- atletas, documentos, pedidos
    a_tags: list[str | Any] = ["Backoffice · Atletas"]

    @r.get("/athletes", tags=a_tags, summary="Todos os atletas (filtros: q, sport, pending)")
    async def athletes(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/athletes", actor=s, query={**_query(req), "scope": "all"})

    @r.get("/athletes/{id}", tags=a_tags, summary="Ficha (treinador sem dados sensíveis)")
    async def athlete(req: Request, id: UserId) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/athletes/{id}", actor=s)

    @r.get("/change-requests", tags=a_tags, summary="Pedidos de alteração")
    async def change_requests(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/change-requests", actor=s, query=_query(req))

    @r.get("/documents", tags=a_tags, summary="Documentos por estado")
    async def documents(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/documents", actor=s, query=_query(req))

    @r.post("/{kind}/{id}/{action}", tags=a_tags, summary="Aprovar ou rejeitar (rejeitar exige note): pedidos de alteração e documentos")
    async def review(
        req: Request,
        kind: Annotated[Literal["change-requests", "documents"], Path()],
        id: Id,
        action: Annotated[Literal["approve", "reject"], Path()],
        body: OptionalJson = None,
    ) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/{kind}/{id}/{action}", actor=s, body=body or {})

    # ---------------------------------------------------------------- resultados, utilizadores, auditoria
    @r.post("/results/import", tags=["Backoffice · Resultados"], summary="Importar resultados do Troféu de Almada")
    async def results_import(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/results/import", actor=s, body=body)

    @r.get("/users", tags=["Backoffice · Gestão"], summary="Utilizadores e papéis")
    async def users(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/users", actor=s)

    @r.put("/users/{id}/roles", tags=["Backoffice · Gestão"], summary="Definir papéis")
    async def user_roles(req: Request, id: UserId, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/users/{id}/roles", actor=s, body=body)

    RoleKey = Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{1,30}$")]

    @r.get("/permissions", tags=["Backoffice · Gestão"], summary="Catálogo de permissões")
    async def permissions(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/permissions", actor=s)

    @r.get("/roles", tags=["Backoffice · Gestão"], summary="Papéis e permissões")
    async def roles(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/roles", actor=s)

    @r.post("/roles", tags=["Backoffice · Gestão"], summary="Criar papel", status_code=201)
    async def role_create(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/roles", actor=s, body=body)

    @r.put("/roles/{key}", tags=["Backoffice · Gestão"], summary="Alterar papel e permissões")
    async def role_update(req: Request, key: RoleKey, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/roles/{key}", actor=s, body=body)

    @r.delete("/roles/{key}", tags=["Backoffice · Gestão"], summary="Apagar papel", status_code=204)
    async def role_delete(req: Request, key: RoleKey) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/roles/{key}", actor=s)
        return Response(status_code=204)

    @r.get("/audit", tags=["Backoffice · Gestão"], summary="Auditoria")
    async def audit(req: Request, limit: Annotated[int | None, Query()] = None) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/audit", actor=s, query=_query(req))
