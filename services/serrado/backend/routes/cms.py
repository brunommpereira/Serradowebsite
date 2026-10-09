"""
CMS — conteúdos editados no backoffice.
Fluxo editorial: rascunho → publicado (→ arquivado). Cada gravação cria uma
revisão completa em cms_revisions, que pode ser reposta.
"""

from dataclasses import dataclass
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, create_model

from ...db.pool import Conn, Jsonb, fetch, fetch_one, tx
from ...html import sanitize_body
from ..core import HttpError, actor, audit, camel, can, not_found, pool, require, snake


@dataclass(frozen=True)
class F:
    type: Literal["string", "integer", "number", "boolean"] = "string"
    required: bool = False
    nullable: bool = False
    max_length: int | None = None
    enum: tuple[str, ...] | None = None
    pattern: str | None = None
    minimum: float | None = None


SLUG = F(required=True, max_length=120, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
TEXT = F(max_length=200000)
# Imagem de capa: da biblioteca de imagens (/api/v1/media/…) ou um endereço https
COVER = F(nullable=True, max_length=500, pattern=r'^((https://|/api/v1/media/)[^\s"<>]+)?$')


@dataclass(frozen=True)
class CmsType:
    table: str
    label: str
    order: str
    search: tuple[str, ...]
    fields: dict[str, F]


CMS_TYPES: dict[str, CmsType] = {
    "news": CmsType(
        table="cms_news",
        label="Notícias",
        order="coalesce(published_at, updated_at) desc",
        search=("title", "summary"),
        fields={
            "slug": SLUG,
            "title": F(required=True, max_length=200),
            "category": F(
                required=True, enum=("Clube", "Atletismo", "Futsal", "Rugby", "Formação", "Comunidade", "Eventos", "Parceiros", "Comunicados")
            ),
            "summary": F(max_length=400),
            "body": TEXT,
            "coverUrl": COVER,
            "author": F(max_length=120),
        },
    ),
    "events": CmsType(
        table="cms_events",
        label="Eventos",
        order="starts_at desc",
        search=("title", "summary", "location"),
        fields={
            "slug": SLUG,
            "title": F(required=True, max_length=200),
            "kind": F(required=True, enum=("Torneio", "Caminhada", "Corrida", "Solidário", "Convívio", "Crianças")),
            "sportSlug": F(nullable=True, enum=("atletismo", "futsal", "rugby", "formacao", "escola-de-desporto")),
            "summary": F(max_length=400),
            "body": TEXT,
            "coverUrl": COVER,
            "startsAt": F(required=True, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$"),
            "endTime": F(nullable=True, pattern=r"^\d{2}:\d{2}$"),
            "location": F(required=True, max_length=200),
            "capacity": F(type="integer", minimum=0),
            "price": F(type="number", minimum=0),
            "memberPrice": F(type="number", nullable=True, minimum=0),
            "registrationRequired": F(type="boolean"),
            "askShirtSize": F(type="boolean"),
        },
    ),
    "pages": CmsType(
        table="cms_pages",
        label="Páginas",
        order="title",
        search=("title", "summary"),
        fields={"slug": SLUG, "title": F(required=True, max_length=200), "summary": F(max_length=400), "body": TEXT},
    ),
    "partners": CmsType(
        table="cms_partners",
        label="Parceiros",
        order="name",
        search=("name", "description"),
        fields={
            "slug": SLUG,
            "name": F(required=True, max_length=200),
            "category": F(required=True, enum=("Patrocinador Principal", "Patrocinador", "Parceiro", "Parceiro Institucional")),
            "website": F(nullable=True, max_length=300, pattern=r"^(https?://.+)?$"),
            "description": F(max_length=2000),
        },
    ),
}

STATUS = ("draft", "published", "archived")


def _annotation(f: F) -> Any:
    base: Any
    if f.enum:
        base = Literal[f.enum]  # type: ignore[valid-type]
    elif f.type == "string":
        base = Annotated[str, StringConstraints(max_length=f.max_length, pattern=f.pattern)]
    elif f.type == "integer":
        base = Annotated[int, Field(ge=f.minimum)] if f.minimum is not None else int
    elif f.type == "number":
        base = Annotated[float, Field(ge=f.minimum)] if f.minimum is not None else float
    else:
        base = bool
    return base | None if f.nullable else base


def body_model(name: str, fields: dict[str, F]) -> type[BaseModel]:
    """Modelo do corpo (sem campos extra). Campos opcionais omitidos ficam «não definidos» (exclude_unset)."""
    spec: dict[str, Any] = {k: (_annotation(f), ... if f.required else None) for k, f in fields.items()}
    return create_model(name, __config__=ConfigDict(extra="forbid"), **spec)  # type: ignore[call-overload,no-any-return]


def default_for(f: F) -> Any:
    if f.nullable:
        return None
    return False if f.type == "boolean" else 0 if f.type in ("integer", "number") else ""


def clean(data: dict[str, Any]) -> dict[str, Any]:
    """O HTML do editor é limpo antes de ser gravado (sem scripts, estilos nem atributos de eventos)."""
    return {**data, "body": sanitize_body(data["body"])} if isinstance(data.get("body"), str) else data


def can_edit(req: Request) -> bool:
    """Leitura de rascunhos/arquivados e escrita: editor ou admin."""
    return can(req, "cms.edit")


async def load(c: Any, table: str, entry_id: int) -> dict[str, Any] | None:
    row = await fetch_one(c, f"select * from {table} where id = %s", [entry_id])
    return camel(row) if row else None


async def revision(c: Conn, type_: str, entry: dict[str, Any], actor_id: str | None) -> None:
    await c.execute(
        "insert into cms_revisions (type, entry_id, data, author_id) values (%s, %s, %s, %s)", [type_, entry["id"], Jsonb(entry), actor_id]
    )


Id = Annotated[int, Path(ge=1)]


def _register_type(r: APIRouter, type_: str, d: CmsType) -> None:
    base = f"/cms/{type_}"
    tags: list[str | Any] = [f"CMS · {d.label}"]
    columns = list(d.fields)
    Body = body_model(f"{type_.capitalize()}Body", d.fields)

    @r.get(base, tags=tags, summary=f"Lista de {d.label.lower()} (público vê só publicados)")
    async def list_entries(
        req: Request,
        status: Annotated[Literal["draft", "published", "archived"] | None, Query()] = None,
        q: Annotated[str | None, Query(max_length=100)] = None,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> dict[str, Any]:
        st = status if can_edit(req) else "published"
        where: list[str] = []
        args: list[Any] = []
        if st:
            where.append("status = %s")
            args.append(st)
        if q:
            where.append("(" + " or ".join(f"{col} ilike %s" for col in d.search) + ")")
            args.extend([f"%{q}%"] * len(d.search))
        w = ("where " + " and ".join(where)) if where else ""
        total = await fetch_one(pool(req), f"select count(*)::int as n from {d.table} {w}", args)
        rows = await fetch(pool(req), f"select * from {d.table} {w} order by {d.order} limit %s offset %s", [*args, limit, offset])
        return {"items": [camel(x) for x in rows], "total": total["n"] if total else 0}

    @r.get(base + "/slug/{slug}", tags=tags, summary="Detalhe por slug (público: só publicado)")
    async def by_slug(req: Request, slug: Annotated[str, Path(max_length=120)]) -> dict[str, Any]:
        row = await fetch_one(pool(req), f"select * from {d.table} where slug = %s", [slug])
        if not row or (row["status"] != "published" and not can_edit(req)):
            raise not_found("Conteúdo")
        return camel(row)

    @r.get(base + "/{id}", tags=tags, summary="Detalhe por id")
    async def by_id(req: Request, id: Id) -> dict[str, Any]:
        entry = await load(pool(req), d.table, id)
        if not entry or (entry["status"] != "published" and not can_edit(req)):
            raise not_found("Conteúdo")
        return entry

    @r.post(base, tags=tags, summary="Cria um rascunho", status_code=201)
    async def create(req: Request, body: Body) -> dict[str, Any]:  # type: ignore[valid-type]
        require(req, "cms.edit")
        data = clean(body.model_dump(exclude_unset=True))  # type: ignore[attr-defined]
        keys = [k for k in columns if k in data]
        who = actor(req)
        async with tx(pool(req)) as c:
            cols = ", ".join([*(snake(k) for k in keys), "updated_by"])
            marks = ", ".join(["%s"] * (len(keys) + 1))
            cur = await c.execute(f"insert into {d.table} ({cols}) values ({marks}) returning *", [*(data[k] for k in keys), who.id])
            row = await cur.fetchone()
            assert row is not None
            e = camel(row)
            await revision(c, type_, e, who.id)
            await audit(c, who, f"cms.{type_}.create", d.table, e["id"], {"slug": e["slug"]})
        return e

    @r.put(base + "/{id}", tags=tags, summary="Atualiza (cria revisão)")
    async def update(req: Request, id: Id, body: Body) -> dict[str, Any]:  # type: ignore[valid-type]
        require(req, "cms.edit")
        data = clean(body.model_dump(exclude_unset=True))  # type: ignore[attr-defined]
        who = actor(req)
        async with tx(pool(req)) as c:
            # Campos omitidos voltam ao valor por omissão (PUT = substituição completa dos campos editáveis)
            sets = ", ".join(f"{snake(k)} = %s" for k in columns)
            values = [data[k] if k in data else default_for(d.fields[k]) for k in columns]
            cur = await c.execute(
                f"update {d.table} set {sets}, updated_at = now(), updated_by = %s where id = %s returning *", [*values, who.id, id]
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Conteúdo")
            e = camel(row)
            await revision(c, type_, e, who.id)
            await audit(c, who, f"cms.{type_}.update", d.table, id, {"slug": e["slug"]})
        return e

    for action, status, summary in (
        ("publish", "published", "Publica"),
        ("unpublish", "draft", "Volta a rascunho"),
        ("archive", "archived", "Arquiva"),
    ):
        _register_status(r, base, tags, type_, d, action, status, summary)

    @r.delete(base + "/{id}", tags=tags, summary="Apaga (fica no histórico de auditoria)", status_code=204)
    async def delete(req: Request, id: Id) -> Response:
        require(req, "cms.edit")
        async with tx(pool(req)) as c:
            cur = await c.execute(f"delete from {d.table} where id = %s returning slug", [id])
            row = await cur.fetchone()
            if not row:
                raise not_found("Conteúdo")
            await audit(c, actor(req), f"cms.{type_}.delete", d.table, id, {"slug": row["slug"]})
        return Response(status_code=204)

    @r.get(base + "/{id}/revisions", tags=tags, summary="Histórico de versões")
    async def revisions(req: Request, id: Id) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        rows = await fetch(
            pool(req),
            """select r.id, r.created_at, u.name as author, r.data->>'status' as status, coalesce(r.data->>'title', r.data->>'name') as title
                 from cms_revisions r left join users u on u.id = r.author_id
                where r.type = %s and r.entry_id = %s order by r.created_at desc, r.id desc limit 50""",
            [type_, id],
        )
        return [camel(x) for x in rows]

    @r.post(base + "/{id}/revisions/{rev}/restore", tags=tags, summary="Repõe uma versão anterior (como nova revisão)")
    async def restore(req: Request, id: int, rev: int) -> dict[str, Any]:
        require(req, "cms.edit")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute("select data from cms_revisions where id = %s and type = %s and entry_id = %s", [rev, type_, id])
            found = await cur.fetchone()
            if not found:
                raise not_found("Versão")
            old: dict[str, Any] = found["data"]
            sets = ", ".join(f"{snake(k)} = %s" for k in columns)
            values = [old[k] if old.get(k) is not None else default_for(d.fields[k]) for k in columns]
            cur = await c.execute(
                f"update {d.table} set {sets}, updated_at = now(), updated_by = %s where id = %s returning *", [*values, who.id, id]
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Conteúdo")
            e = camel(row)
            await revision(c, type_, e, who.id)
            await audit(c, who, f"cms.{type_}.restore", d.table, id, {"revision": rev})
        return e


def _register_status(r: APIRouter, base: str, tags: list[Any], type_: str, d: CmsType, action: str, status: str, summary: str) -> None:
    @r.post(f"{base}/{{id}}/{action}", tags=tags, summary=summary, name=f"{type_}_{action}")
    async def change_status(req: Request, id: Id) -> dict[str, Any]:
        require(req, "cms.edit")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                f"""update {d.table} set status = %s, published_at = case when %s = 'published' then coalesce(published_at, now()) else published_at end,
                      updated_at = now(), updated_by = %s where id = %s returning *""",
                [status, status, who.id, id],
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Conteúdo")
            await audit(c, who, f"cms.{type_}.{action}", d.table, id, {"slug": row["slug"]})
        return camel(row)


def register(r: APIRouter) -> None:
    for type_, d in CMS_TYPES.items():
        _register_type(r, type_, d)

    # Erro claro para tipos desconhecidos (em vez de 404 genérico)
    @r.api_route("/cms/{type}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    async def unknown_type() -> None:
        raise HttpError(404, "unknown_type", f"Tipo de conteúdo desconhecido. Tipos: {', '.join(CMS_TYPES)}")
