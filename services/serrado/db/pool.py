"""Ligação ao PostgreSQL (psycopg 3, pool assíncrono) e conversões de tipos para a API."""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import UTC
from decimal import Decimal
from typing import Any

from psycopg import AsyncConnection
from psycopg.adapt import Loader
from psycopg.rows import dict_row
from psycopg.types.datetime import TimestamptzLoader
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from ..config import config

Row = dict[str, Any]
Conn = AsyncConnection[Row]


class DateText(Loader):
    """DATE como texto «AAAA-MM-DD» (sem conversões de fuso horário)."""

    def load(self, data: Any) -> str:
        return bytes(data).decode()


class TimestampText(Loader):
    """timestamp sem fuso → «AAAA-MM-DDTHH:MM» (hora local do evento)."""

    def load(self, data: Any) -> str:
        return bytes(data).decode().replace(" ", "T")[:16]


class TimestamptzIso(TimestamptzLoader):
    """timestamptz → ISO 8601 em UTC com milissegundos («2026-10-01T10:00:00.000Z»)."""

    def load(self, data: Any) -> str:  # type: ignore[override]
        dt = super().load(data).astimezone(UTC)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


class NumericNumber(Loader):
    """NUMERIC → número (inteiro quando não tem casas decimais)."""

    def load(self, data: Any) -> int | float:
        d = Decimal(bytes(data).decode())
        return int(d) if d == d.to_integral_value() else float(d)


class UuidText(Loader):
    def load(self, data: Any) -> str:
        return bytes(data).decode()


def register_types(conn: AsyncConnection[Any]) -> None:
    for name, loader in (
        ("date", DateText),
        ("timestamp", TimestampText),
        ("timestamptz", TimestamptzIso),
        ("numeric", NumericNumber),
        ("uuid", UuidText),
    ):
        conn.adapters.register_loader(name, loader)


async def _configure(conn: AsyncConnection[Any]) -> None:
    register_types(conn)


async def _reset(conn: AsyncConnection[Any]) -> None:
    """Ao voltar ao pool: as ligações usadas para locks ficam em autocommit; a seguinte tem de ser transacional."""
    if conn.autocommit:
        await conn.set_autocommit(False)


def create_pool(url: str | None = None, *, min_size: int = 1, max_size: int = 10) -> AsyncConnectionPool[Conn]:
    """Pool de ligações (abrir com `await pool.open()`). Sessões na hora de Portugal (current_date, now()) e datas em ISO."""
    return AsyncConnectionPool(
        url or config.database_url,
        min_size=min_size,
        max_size=max_size,
        open=False,
        configure=_configure,
        reset=_reset,
        kwargs={"row_factory": dict_row, "options": "-c timezone=Europe/Lisbon -c datestyle=ISO"},
    )


type Pool = AsyncConnectionPool[Conn]


@asynccontextmanager
async def tx(pool: AsyncConnectionPool[Any]) -> AsyncIterator[Conn]:
    """Uma transação (commit no fim; rollback se houver erro)."""
    async with pool.connection() as c:
        yield c


async def fetch(db: AsyncConnectionPool[Any] | Conn, sql: str, params: Sequence[Any] | None = None) -> list[Row]:
    if isinstance(db, AsyncConnectionPool):
        async with db.connection() as c:
            cur = await c.execute(sql, params)
            return await cur.fetchall() if cur.description else []
    cur = await db.execute(sql, params)
    return await cur.fetchall() if cur.description else []


async def fetch_one(db: AsyncConnectionPool[Any] | Conn, sql: str, params: Sequence[Any] | None = None) -> Row | None:
    rows = await fetch(db, sql, params)
    return rows[0] if rows else None


async def execute(db: AsyncConnectionPool[Any] | Conn, sql: str, params: Sequence[Any] | None = None) -> int:
    """Corre uma escrita e devolve o n.º de linhas afetadas."""
    if isinstance(db, AsyncConnectionPool):
        async with db.connection() as c:
            cur = await c.execute(sql, params)
            return cur.rowcount
    cur = await db.execute(sql, params)
    return cur.rowcount


__all__ = ["Conn", "Jsonb", "Pool", "Row", "create_pool", "execute", "fetch", "fetch_one", "register_types", "tx"]
