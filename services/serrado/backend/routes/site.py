"""
Conteúdos do site com estrutura própria (blocos): contactos, página do clube, órgãos sociais,
documentos, sócios, modalidades, loja, jogos, provas, galeria… Cada bloco é um documento JSON.

Os campos de cada bloco estão definidos no front (o editor do backoffice é gerado a partir deles).
Aqui confirma-se a forma geral: só blocos conhecidos, só texto/números/listas, tamanhos limitados
e nenhum endereço «javascript:». O site mostra estes valores sempre como texto (nunca como HTML).
"""

import json
import math
import re
from typing import Annotated, Any

from fastapi import APIRouter, Path, Request, Response
from pydantic import BaseModel, ConfigDict

from ...db.pool import Jsonb, fetch, fetch_one, tx
from ..core import HttpError, actor, audit, camel, not_found, pool, require

SPORTS = ("atletismo", "futsal", "rugby", "formacao", "escola-de-desporto")
BLOCKS = (
    "contacts",
    "club",
    "boards",
    "documents",
    "membership",
    "community",
    "shop",
    "gallery",
    "matches",
    "athletics",
    "standings",
    "records",
    "agenda",
    *(f"sport-{s}" for s in SPORTS),
)

MAX_BYTES = 400_000
MAX_DEPTH = 4
MAX_ITEMS = 1000
MAX_STRING = 20_000
_FIELD = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,40}$")
_SCRIPT_URL = re.compile(r"^\s*(javascript|vbscript|data:text)", re.IGNORECASE)

Key = Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{1,40}$")]


def check(value: Any, path: str = "data", depth: int = 0) -> None:
    """Forma geral de um bloco (o erro indica o caminho do valor recusado)."""
    if depth > MAX_DEPTH:
        raise HttpError(400, "validation", f"{path}: demasiados níveis")
    if isinstance(value, dict):
        for k, v in value.items():
            if not _FIELD.match(k):
                raise HttpError(400, "validation", f"{path}: nome de campo inválido «{k[:40]}»")
            check(v, f"{path}.{k}", depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_ITEMS:
            raise HttpError(400, "validation", f"{path}: mais de {MAX_ITEMS} elementos")
        for i, v in enumerate(value):
            check(v, f"{path}[{i}]", depth + 1)
    elif isinstance(value, str):
        if len(value) > MAX_STRING:
            raise HttpError(400, "validation", f"{path}: texto demasiado longo")
        if _SCRIPT_URL.match(value):
            raise HttpError(400, "validation", f"{path}: endereço não permitido")
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise HttpError(400, "validation", f"{path}: número inválido")
    elif value is not None and not isinstance(value, (bool, int)):
        raise HttpError(400, "validation", f"{path}: tipo não suportado")


class BlockBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: dict[str, Any]


def known(key: str) -> None:
    if key not in BLOCKS:
        raise HttpError(404, "unknown_block", "Bloco de conteúdo desconhecido")


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Conteúdos do site"]

    @r.get("/site/blocks", tags=tags, summary="Todos os blocos editados (público: o site junta-os ao conteúdo original)")
    async def all_blocks(req: Request) -> dict[str, Any]:
        rows = await fetch(pool(req), "select key, data from site_blocks")
        return {row["key"]: row["data"] for row in rows if row["key"] in BLOCKS}

    @r.get("/site/blocks/{key}", tags=tags, summary="Um bloco, com a data e o autor da última alteração")
    async def one(req: Request, key: Key) -> dict[str, Any]:
        require(req, "cms.edit")
        known(key)
        row = await fetch_one(
            pool(req),
            "select b.data, b.updated_at, u.name as updated_by from site_blocks b left join users u on u.id = b.updated_by where key = %s",
            [key],
        )
        return {"key": key, **camel(row)} if row else {"key": key, "data": None, "updatedAt": None, "updatedBy": None}

    @r.put("/site/blocks/{key}", tags=tags, summary="Grava um bloco (fica uma versão no histórico)")
    async def save(req: Request, key: Key, body: BlockBody) -> dict[str, Any]:
        require(req, "cms.edit")
        known(key)
        check(body.data)
        if len(json.dumps(body.data, ensure_ascii=False).encode()) > MAX_BYTES:
            raise HttpError(413, "too_large", "O conteúdo é demasiado grande. Divide-o ou apaga elementos antigos.")
        who = actor(req)
        async with tx(pool(req)) as c:
            await c.execute(
                """insert into site_blocks (key, data, updated_by) values (%s, %s, %s)
                   on conflict (key) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by""",
                [key, Jsonb(body.data), who.id],
            )
            await c.execute("insert into site_block_revisions (key, data, author_id) values (%s, %s, %s)", [key, Jsonb(body.data), who.id])
            await audit(c, who, "site.block.save", "site_blocks", None, {"key": key})
        return await one(req, key)

    @r.delete("/site/blocks/{key}", tags=tags, summary="Volta ao conteúdo original (a versão atual fica no histórico)", status_code=204)
    async def reset(req: Request, key: Key) -> Response:
        require(req, "cms.edit")
        known(key)
        who = actor(req)
        async with tx(pool(req)) as c:
            await c.execute("delete from site_blocks where key = %s", [key])
            await c.execute("insert into site_block_revisions (key, data, author_id) values (%s, null, %s)", [key, who.id])
            await audit(c, who, "site.block.reset", "site_blocks", None, {"key": key})
        return Response(status_code=204)

    @r.get("/site/blocks/{key}/revisions", tags=tags, summary="Histórico de versões de um bloco")
    async def revisions(req: Request, key: Key) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        known(key)
        rows = await fetch(
            pool(req),
            """select r.id, r.created_at, u.name as author, r.data is null as original
                 from site_block_revisions r left join users u on u.id = r.author_id
                where r.key = %s order by r.created_at desc, r.id desc limit 50""",
            [key],
        )
        return [camel(x) for x in rows]

    @r.post("/site/blocks/{key}/revisions/{rev}/restore", tags=tags, summary="Repõe uma versão anterior (como nova versão)")
    async def restore(req: Request, key: Key, rev: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
        require(req, "cms.edit")
        known(key)
        row = await fetch_one(pool(req), "select data from site_block_revisions where id = %s and key = %s", [rev, key])
        if not row:
            raise not_found("Versão")
        if row["data"] is None:
            await reset(req, key)
            return await one(req, key)
        return await save(req, key, BlockBody(data=row["data"]))
