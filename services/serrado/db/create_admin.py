"""
Cria uma conta de administração, ou repõe a password e o papel de admin de uma conta que já exista.

    python -m serrado.db.create_admin <email> "<nome>"

A password vem de ADMIN_PASSWORD (12 caracteres ou mais). Sem ela, é gerada e mostrada uma única vez.
"""

import asyncio
import os
import re
import secrets
import sys

from ..password import hash_password
from .pool import Jsonb, Pool, create_pool, tx


async def create_admin(pool: Pool, email: str, name: str, password: str) -> str:
    email = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError(f"Email inválido: {email}")
    if not name.strip():
        raise ValueError("Falta o nome")
    if len(password) < 12:
        raise ValueError("A password tem de ter pelo menos 12 caracteres")
    pw_hash = await hash_password(password)
    async with tx(pool) as c:
        cur = await c.execute(
            """insert into users (email, name, password_hash) values (%s, %s, %s)
               on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, disabled = false
               returning id""",
            [email, name.strip(), pw_hash],
        )
        row = await cur.fetchone()
        assert row is not None
        user_id: str = row["id"]
        await c.execute("insert into user_roles values (%s, 'admin') on conflict do nothing", [user_id])
        await c.execute(
            "insert into audit_log (actor_id, action, entity, entity_id, details) values (null, 'users.create_admin', 'users', %s, %s)",
            [user_id, Jsonb({"via": "cli", "email": email})],
        )
    return user_id


async def _main(email: str, name: str) -> None:
    generated = not os.environ.get("ADMIN_PASSWORD")
    password = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(12)
    pool = create_pool()
    await pool.open()
    try:
        await create_admin(pool, email, name, password)
        print(f"✔ conta de administração: {email.strip().lower()}")
        if generated:
            print(f"  password (guarda-a já, não volta a ser mostrada): {password}")
    finally:
        await pool.close()


if __name__ == "__main__":
    if len(sys.argv) != 3 or not sys.argv[1] or not sys.argv[2]:
        print('Uso: python -m serrado.db.create_admin <email> "<nome>"', file=sys.stderr)
        sys.exit(1)
    try:
        asyncio.run(_main(sys.argv[1], sys.argv[2]))
    except ValueError as e:
        print(f"✘ {e}", file=sys.stderr)
        sys.exit(1)
