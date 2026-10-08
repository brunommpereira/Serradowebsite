"""
Conteúdo público inicial do site: notícias, eventos, parceiros e páginas legais.
Não cria contas nem dados pessoais e só corre com o CMS vazio, por isso é seguro em produção.

    python -m serrado.db.content
"""

import asyncio
from collections.abc import Callable

from .pool import Pool, create_pool, fetch_one, tx
from .seed import load_content, seed_cms


async def seed_public_content(pool: Pool, log: Callable[[str], None] = print) -> bool:
    row = await fetch_one(
        pool,
        "select (select count(*) from cms_news) + (select count(*) from cms_events) + (select count(*) from cms_pages) + (select count(*) from cms_partners) as n",
    )
    if row and int(row["n"]) > 0:
        log("O CMS já tem conteúdo: nada a fazer.")
        return False
    content = load_content()
    async with tx(pool) as c:
        await seed_cms(c, content, None, draft=False)
    log(f"✔ conteúdo inicial: {len(content['news'])} notícias, {len(content['events'])} eventos, {len(content['sponsors'])} parceiros, 2 páginas")
    return True


async def _main() -> None:
    pool = create_pool()
    await pool.open()
    try:
        await seed_public_content(pool)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_main())
