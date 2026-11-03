"""Jantar de Natal (migração 032): evento gratuito com inscrição e notícia com o cartaz."""

from pathlib import Path

from serrado.db.pool import fetch_one
from tests.conftest import XHR

SQL = (Path(__file__).parents[1] / "serrado/db/migrations/032_jantar_de_natal.sql").read_text()


async def test_jantar_de_natal_publicado_e_aceita_inscricoes_gratuitas(mw):
    # O seed dos testes apaga os conteúdos criados pelas migrações: volta a aplicar esta
    async with mw.pool.connection() as c:
        await c.execute(SQL)
        await c.execute(SQL)  # segunda vez não duplica nada
    ev = await fetch_one(
        mw.pool,
        "select starts_at::text as starts, location, price, registration_required, status from cms_events where slug = 'jantar-de-natal'",
    )
    assert ev and (ev["starts"], ev["location"], float(ev["price"]), ev["registration_required"], ev["status"]) == (
        "2026-11-07 20:00:00",
        "Fresh Bar",
        0.0,
        True,
        "published",
    )
    news = await fetch_one(mw.pool, "select title, body from cms_news where slug = 'jantar-de-natal-2026'")
    assert news and "7 de novembro" in news["title"] and "cartaz-jantar-natal.webp" in news["body"]

    page = (await mw.client().get("/api/v1/content/events/jantar-de-natal")).json()
    page = page.get("data", page)
    assert page["date"] == "2026-11-07T20:00" and page["price"] == 0 and page["registrationRequired"] is True

    # Inscrição gratuita: valor 0, sem dados de pagamento
    c = mw.client()
    out = await c.post(
        "/api/v1/events/jantar-de-natal/registrations",
        json={
            "name": "Joana Exemplo",
            "email": "joana@exemplo.pt",
            "phone": "912 345 678",
            "people": 4,
            "isMember": False,
            "sport": "futsal",
            "notes": "",
            "consent": True,
            "consentImage": False,
            "website": "",
        },
        headers=XHR,
    )
    assert out.status_code == 201, out.text
    assert (out.json()["people"], out.json()["amount"]) == (4, 0.0)
