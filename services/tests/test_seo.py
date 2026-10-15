"""Sitemap dinâmico: notícias, eventos e páginas publicadas no CMS."""

import re

from serrado.db.pool import fetch
from tests.conftest import Middleware


async def test_sitemap_do_cms_so_com_conteudo_publicado(mw: Middleware) -> None:
    r = await mw.client().get("/api/v1/content/sitemap.xml")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/xml")
    locs = re.findall(r"<loc>([^<]+)</loc>", r.text)
    expected: set[str] = set()
    drafts: list[dict[str, str]] = []
    for table, prefix in (("cms_news", "/noticias/"), ("cms_events", "/eventos/"), ("cms_pages", "/paginas/")):
        expected |= {prefix + r["slug"] for r in await fetch(mw.pool, f"select slug from {table} where status = 'published'")}  # noqa: S608
        drafts += await fetch(mw.pool, f"select slug from {table} where status <> 'published'")  # noqa: S608
    assert expected, "o seed tem conteúdo publicado"
    assert {re.sub(r"^https?://[^/]+", "", u) for u in locs} == expected
    assert not any(d["slug"] and d["slug"] in r.text for d in drafts)
