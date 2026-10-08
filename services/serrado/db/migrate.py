"""Aplica as migrações em serrado/db/migrations por ordem (cada uma numa transação).

python -m serrado.db.migrate
"""

import asyncio
from collections.abc import Callable
from pathlib import Path

from .pool import Pool, create_pool, execute, fetch, tx

MIGRATIONS = Path(__file__).parent / "migrations"


async def migrate(pool: Pool, log: Callable[[str], None] = print) -> None:
    await execute(pool, "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())")
    done = {r["name"] for r in await fetch(pool, "select name from schema_migrations")}
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name in done:
            continue
        async with tx(pool) as c:
            await c.execute(f.read_text(encoding="utf-8").encode())  # bytes: várias instruções sem parâmetros
            await c.execute("insert into schema_migrations (name) values (%s)", [f.name])
        log(f"✔ {f.name}")


async def _main() -> None:
    pool = create_pool()
    await pool.open()
    try:
        await migrate(pool)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_main())
