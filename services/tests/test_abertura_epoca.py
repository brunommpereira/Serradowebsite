"""A abertura da época passou para domingo, 22 de novembro: evento, notícia e cartaz com a nova data (migrações 030 e 031)."""

from pathlib import Path

from serrado.db.pool import fetch, fetch_one

MIGRATIONS = Path(__file__).parents[1] / "serrado/db/migrations"
SQL = (MIGRATIONS / "030_abertura_epoca_22_novembro.sql").read_text()
SQL_031 = (MIGRATIONS / "031_abertura_epoca_cartaz_evento.sql").read_text()
CARTAZ = (
    '<img src="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-pagamento.webp" alt="Cartaz da abertura da época do Serrado FC: '
    'sábado, 7 de novembro, no Fresh Bar.">'
    '<p><a href="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-pagamento-a4.pdf">Descarrega o cartaz em A4</a></p>'
)


async def test_abertura_da_epoca_passou_para_22_de_novembro(mw):
    # Como ficaram no site depois das migrações 025 a 028 (o seed dos testes apaga-os)
    await fetch(
        mw.pool,
        """insert into cms_events (slug, title, kind, summary, body, starts_at, location, price, registration_required, payment_info, status, published_at)
           values ('abertura-da-epoca', 'Abertura da época no Fresh: treino, corrida e churrasco', 'Convívio',
                   'Sábado, 7 de novembro: treino e corridas às 10h30 e churrasco com bebidas a partir das 12h no Fresh Bar. 20 € por pessoa, tudo incluído.',
                   %s, '2026-11-07 10:30', 'Fresh Bar', 20, true, 'O pagamento faz-se no dia, no Fresh.', 'published', now()) returning id""",
        ["<p><strong>20 € por pessoa, tudo incluído</strong> (treino, churrasco e bebidas), pago no dia, no Fresh.</p>" + CARTAZ],
    )
    await fetch(
        mw.pool,
        """insert into cms_news (slug, title, category, summary, body, author, status, published_at)
           values ('abertura-da-epoca-no-fresh', 'Abertura da época: treino, corrida e churrasco no Fresh a 7 de novembro', 'Eventos',
                   'No sábado, 7 de novembro, damos início à época do Serrado FC com todas as modalidades.', %s, 'Comunicação Serrado FC', 'published', now())
           returning id""",
        ["<p>No <strong>sábado, 7 de novembro</strong>, o Serrado FC junta atletas.</p><p>O pagamento faz-se no dia, no Fresh.</p>" + CARTAZ],
    )
    async with mw.pool.connection() as c:
        await c.execute(SQL)

    ev = await fetch_one(mw.pool, "select starts_at::text as starts, summary, body from cms_events where slug = 'abertura-da-epoca'")
    assert ev and ev["starts"] == "2026-11-22 10:30:00"
    assert ev["summary"].startswith("Domingo, 22 de novembro:")
    assert "7 de novembro" not in ev["summary"] + ev["body"]
    assert "cartaz-abertura-epoca-22nov.webp" in ev["body"] and "cartaz-abertura-epoca-22nov-a4.pdf" in ev["body"]
    assert "pago no dia, no Fresh" in ev["body"]

    news = await fetch_one(mw.pool, "select title, summary, body from cms_news where slug = 'abertura-da-epoca-no-fresh'")
    assert news and news["title"].endswith("no Fresh a 22 de novembro")
    assert news["summary"].startswith("No domingo, 22 de novembro,")
    assert "<strong>domingo, 22 de novembro</strong>" in news["body"]
    assert "7 de novembro" not in news["title"] + news["summary"] + news["body"]
    assert "cartaz-abertura-epoca-22nov.webp" in news["body"] and "O pagamento faz-se no dia, no Fresh." in news["body"]

    # Correr outra vez não volta a mudar a data
    async with mw.pool.connection() as c:
        await c.execute(SQL)
    again = await fetch_one(mw.pool, "select starts_at::text as starts from cms_events where slug = 'abertura-da-epoca'")
    assert again and again["starts"] == "2026-11-22 10:30:00"


async def test_cartaz_do_evento_mudado_a_mao_no_backoffice(mw):
    # A data e o resumo já tinham sido mudados à mão: a 030 não toca no evento, a 031 troca o cartaz no texto
    await fetch(
        mw.pool,
        """insert into cms_events (slug, title, kind, summary, body, starts_at, location, price, status, published_at)
           values ('abertura-da-epoca', 'Abertura da época', 'Convívio', 'Domingo, 22 de novembro: treino e churrasco.', %s,
                   '2026-11-22 10:30', 'Fresh Bar', 20, 'published', now())
           on conflict (slug) do update set body = excluded.body, summary = excluded.summary, starts_at = excluded.starts_at
           returning id""",
        [CARTAZ],
    )
    async with mw.pool.connection() as c:
        await c.execute(SQL)
        await c.execute(SQL_031)
    ev = await fetch_one(mw.pool, "select starts_at::text as starts, body from cms_events where slug = 'abertura-da-epoca'")
    assert ev and ev["starts"] == "2026-11-22 10:30:00"
    assert "7 de novembro" not in ev["body"] and "domingo, 22 de novembro" in ev["body"]
    assert "cartaz-abertura-epoca-22nov.webp" in ev["body"] and "cartaz-abertura-epoca-22nov-a4.pdf" in ev["body"]
