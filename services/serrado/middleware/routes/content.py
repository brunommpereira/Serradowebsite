"""
Conteúdo público (site). O middleware adapta o formato do CMS ao modelo que
o front já usa (NewsArticle, ClubEvent, Sponsor) e guarda em cache 60 s.
"""

import base64
from datetime import datetime
from typing import Annotated, Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Path, Query, Request, Response

from ...html import to_html
from ..deps import backend, cache

Row = dict[str, Any]


def _drop_none(d: Row, *keys: str) -> Row:
    """Campos opcionais sem valor não seguem na resposta (como no modelo do front)."""
    return {k: v for k, v in d.items() if not (k in keys and v is None)}


def to_news(n: Row) -> Row:
    return {
        "id": n.get("id"),
        "slug": n.get("slug"),
        "title": n.get("title"),
        "category": n.get("category"),
        "summary": n.get("summary"),
        "bodyHtml": to_html(n.get("body")),
        "author": n.get("author"),
        "coverUrl": n.get("coverUrl"),
        "publicationDate": str(n.get("publishedAt") or n.get("updatedAt") or "")[:10],
    }


def to_event(e: Row) -> Row:
    return _drop_none(
        {
            "id": e.get("id"),
            "slug": e.get("slug"),
            "title": e.get("title"),
            "kind": e.get("kind"),
            "sportSlug": e.get("sportSlug"),
            "summary": e.get("summary"),
            "bodyHtml": to_html(e.get("body")),
            "coverUrl": e.get("coverUrl"),
            "date": e.get("startsAt"),
            "endTime": e.get("endTime"),
            "location": e.get("location"),
            "capacity": e.get("capacity"),
            "registered": 0,
            "price": e.get("price"),
            "memberPrice": e.get("memberPrice"),
            "registrationRequired": e.get("registrationRequired"),
            "askShirtSize": e.get("askShirtSize"),
        },
        "sportSlug",
        "endTime",
        "memberPrice",
    )


def to_partner(p: Row) -> Row:
    return {
        "id": p.get("id"),
        "name": p.get("name"),
        "category": p.get("category"),
        "website": p.get("website") or "",
        "description": p.get("description"),
        "active": True,
    }


def to_page(p: Row) -> Row:
    return {
        "slug": p.get("slug"),
        "title": p.get("title"),
        "summary": p.get("summary"),
        "bodyHtml": to_html(p.get("body")),
        "updatedAt": p.get("updatedAt"),
    }


Slug = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,120}$")]
PUBLIC_CACHE = {"cache-control": "public, max-age=60"}


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Conteúdo público"]

    async def listing(req: Request, type_: str, limit: int = 200) -> list[Row]:
        async def load() -> list[Row]:
            out = await backend(req).call("GET", f"/cms/{type_}", query={"limit": limit})
            return list(out["items"])

        return await cache(req).get(f"content:{type_}:{limit}", load)  # type: ignore[no-any-return]

    async def by_slug(req: Request, type_: str, slug: str) -> Row:
        async def load() -> Row:
            return await backend(req).call("GET", f"/cms/{type_}/slug/{quote(slug)}")  # type: ignore[no-any-return]

        return await cache(req).get(f"content:{type_}:slug:{slug}", load)  # type: ignore[no-any-return]

    @r.get("/content/home", tags=tags, summary="Agregado da página inicial: últimas notícias, próximos eventos e parceiros")
    async def home(req: Request, resp: Response) -> Row:
        news, events, partners = await listing(req, "news"), await listing(req, "events"), await listing(req, "partners")
        now = datetime.now(ZoneInfo("Europe/Lisbon")).strftime("%Y-%m-%dT%H:%M")  # os eventos estão em hora local
        resp.headers.update(PUBLIC_CACHE)
        upcoming = sorted((e for e in map(to_event, events) if str(e["date"]) >= now), key=lambda e: str(e["date"]))[:3]
        return {"news": [to_news(n) for n in news[:3]], "events": upcoming, "partners": [to_partner(p) for p in partners]}

    @r.get("/content/news", tags=tags, summary="Notícias publicadas")
    async def news(req: Request, resp: Response, category: Annotated[str | None, Query(max_length=40)] = None) -> list[Row]:
        resp.headers.update(PUBLIC_CACHE)
        return [n for n in map(to_news, await listing(req, "news")) if not category or n["category"] == category]

    @r.get("/content/news/{slug}", tags=tags, summary="Notícia")
    async def news_item(req: Request, slug: Slug) -> Row:
        return to_news(await by_slug(req, "news", slug))

    @r.get("/content/events", tags=tags, summary="Eventos publicados")
    async def events(req: Request, resp: Response) -> list[Row]:
        resp.headers.update(PUBLIC_CACHE)
        return sorted(map(to_event, await listing(req, "events")), key=lambda e: str(e["date"]))

    @r.get("/content/events/{slug}", tags=tags, summary="Evento")
    async def event(req: Request, slug: Slug) -> Row:
        return to_event(await by_slug(req, "events", slug))

    @r.get("/content/pages", tags=tags, summary="Páginas institucionais publicadas")
    async def pages(req: Request, resp: Response) -> list[Row]:
        resp.headers.update(PUBLIC_CACHE)
        return [to_page(p) for p in await listing(req, "pages")]

    @r.get("/content/pages/{slug}", tags=tags, summary="Página institucional")
    async def page(req: Request, slug: Slug) -> Row:
        return to_page(await by_slug(req, "pages", slug))

    # Imagens da biblioteca do CMS: o endereço tem uma chave aleatória e nunca muda, por isso a cache é longa
    @r.get("/media/{file}", tags=tags, summary="Imagem ou PDF do CMS")
    async def media(req: Request, file: Annotated[str, Path(pattern=r"^[0-9a-f-]{36}(\.[a-z]{3,4})?$")]) -> Response:
        img = await backend(req).call("GET", f"/media/{file[:36]}")
        headers = {"cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff"}
        if img["mime"] == "application/pdf":
            # Documentos (estatutos, relatórios…): abrem no leitor de PDF do browser, com o nome original
            name = quote(str(img.get("name") or "documento").removesuffix(".pdf") + ".pdf")
            headers["content-disposition"] = f"inline; filename*=UTF-8''{name}"
        else:
            headers["content-security-policy"] = "default-src 'none'"
        return Response(content=base64.b64decode(img["data"]), media_type=img["mime"], headers=headers)

    @r.get("/content/partners", tags=tags, summary="Parceiros e patrocinadores")
    async def partners(req: Request) -> list[Row]:
        return [to_partner(p) for p in await listing(req, "partners")]
