"""
Biblioteca de imagens do CMS. O browser reduz e converte as imagens antes de as enviar,
o que também apaga os metadados (EXIF, localização GPS). Aqui confirma-se o tipo real
pelo conteúdo do ficheiro e o tamanho. Também guarda documentos em PDF (estatutos,
relatórios e contas…), que são sempre públicos.
"""

import base64
import binascii
import re
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from ...db.pool import Pool, fetch, fetch_one, tx
from ..core import HttpError, actor, audit, camel, not_found, pool, require

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PDF_BYTES = 10 * 1024 * 1024
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf"}


def sniff_image(b: bytes) -> str | None:
    """Tipo de imagem pelos primeiros bytes (não confia no nome nem no tipo declarado)."""
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if b[:5] == b"%PDF-":
        return "application/pdf"
    return None


COLUMNS = "id, key, name, mime, size_bytes, width, height, alt, created_at, (select name from users where id = uploaded_by) as uploaded_by_name"


async def usage(db: Pool, key: str) -> list[dict[str, Any]]:
    """Onde a imagem está a ser usada (texto ou capa de notícias, eventos e páginas, e conteúdos do site)."""
    like = f"%{key}%"
    return await fetch(
        db,
        """select 'news' as type, id::text, title from cms_news where body like %s or cover_url like %s
           union all select 'events', id::text, title from cms_events where body like %s or cover_url like %s
           union all select 'pages', id::text, title from cms_pages where body like %s
           union all select 'site', key, key from site_blocks where data::text like %s""",
        [like, like, like, like, like, like],
    )


class Upload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    data: str = Field(min_length=8, max_length=14_100_000)
    alt: str | None = Field(default=None, max_length=300)
    width: int | None = Field(default=None, ge=1, le=10000)
    height: int | None = Field(default=None, ge=1, le=10000)


class AltText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    alt: str = Field(max_length=300)


Id = Annotated[int, Path(ge=1)]
_UNSAFE_NAME = re.compile(r"[^\w .-]", re.UNICODE)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Imagens"]

    @r.get("/cms/media", tags=tags, summary="Lista as imagens (sem o conteúdo)")
    async def list_media(
        req: Request, q: Annotated[str | None, Query(max_length=100)] = None, limit: Annotated[int, Query(ge=1, le=500)] = 200
    ) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        pattern = f"%{q}%" if q else None
        rows = await fetch(
            pool(req),
            f"select {COLUMNS} from cms_media where (%s::text is null or name ilike %s or alt ilike %s) order by created_at desc limit %s",
            [pattern, pattern, pattern, limit],
        )
        return [camel(x) for x in rows]

    @r.post("/cms/media", tags=tags, summary="Carrega uma imagem (conteúdo em base64)", status_code=201)
    async def upload(req: Request, body: Upload) -> dict[str, Any]:
        require(req, "cms.edit")
        try:
            data = base64.b64decode(body.data, validate=False)
        except (binascii.Error, ValueError):
            raise HttpError(400, "validation", "data: base64 inválido") from None
        mime = sniff_image(data)
        if not mime:
            raise HttpError(415, "unsupported_type", "Formato não suportado. Usa JPEG, PNG, WebP, GIF ou PDF.")
        if mime == "application/pdf" and len(data) > MAX_PDF_BYTES:
            raise HttpError(413, "too_large", "O PDF tem mais de 10 MB")
        if mime != "application/pdf" and len(data) > MAX_IMAGE_BYTES:
            raise HttpError(413, "too_large", "A imagem tem mais de 5 MB")
        name = _UNSAFE_NAME.sub("", body.name).strip()[:200] or "imagem"
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                f"insert into cms_media (name, mime, size_bytes, width, height, alt, data, uploaded_by) values (%s,%s,%s,%s,%s,%s,%s,%s) returning {COLUMNS}",
                [name, mime, len(data), body.width, body.height, (body.alt or "").strip(), data, who.id],
            )
            row = await cur.fetchone()
            assert row is not None
            await audit(c, who, "cms.media.upload", "cms_media", row["id"], {"name": name, "size": len(data)})
        return camel(row)

    @r.patch("/cms/media/{id}", tags=tags, summary="Altera o texto alternativo")
    async def set_alt(req: Request, id: Id, body: AltText) -> dict[str, Any]:
        require(req, "cms.edit")
        async with tx(pool(req)) as c:
            cur = await c.execute(f"update cms_media set alt = %s where id = %s returning {COLUMNS}", [body.alt.strip(), id])
            row = await cur.fetchone()
            if not row:
                raise not_found("Imagem")
            await audit(c, actor(req), "cms.media.update", "cms_media", id, {})
        return camel(row)

    @r.get("/cms/media/{id}/usage", tags=tags, summary="Conteúdos que usam a imagem")
    async def media_usage(req: Request, id: Id) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        row = await fetch_one(pool(req), "select key from cms_media where id = %s", [id])
        if not row:
            raise not_found("Imagem")
        return await usage(pool(req), row["key"])

    @r.delete("/cms/media/{id}", tags=tags, summary="Apaga (recusa se estiver a ser usada)", status_code=204)
    async def delete_media(req: Request, id: Id) -> Response:
        require(req, "cms.edit")
        row = await fetch_one(pool(req), "select key, name from cms_media where id = %s", [id])
        if not row:
            raise not_found("Imagem")
        used = await usage(pool(req), row["key"])
        if used:
            raise HttpError(409, "in_use", f"A imagem está a ser usada em: {', '.join(u['title'] for u in used)}")
        async with tx(pool(req)) as c:
            await c.execute("delete from cms_media where id = %s", [id])
            await audit(c, actor(req), "cms.media.delete", "cms_media", id, {"name": row["name"]})
        return Response(status_code=204)

    # Público (o middleware serve a imagem ao site): só pelo endereço aleatório, sem listagem
    @r.get("/media/{key}", tags=tags, summary="Conteúdo de uma imagem (base64)")
    async def media_content(
        req: Request, key: Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
    ) -> dict[str, str]:
        row = await fetch_one(pool(req), "select mime, name, data from cms_media where key = %s", [key])
        if not row:
            raise not_found("Imagem")
        return {"mime": row["mime"], "name": row["name"], "data": base64.b64encode(row["data"]).decode()}
