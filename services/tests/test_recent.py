"""Novas entradas: o que chegou pelo site nos últimos dias, filtrado pelas permissões de quem vê."""

from serrado.db.pool import execute, fetch_one
from tests.conftest import XHR


async def test_novas_entradas_por_permissao(mw):
    c = mw.client("10.10.0.1")
    c.headers.update(XHR)
    r = await c.post(
        "/api/v1/interest",
        json={
            "sport": "futsal",
            "childName": "Lead Facebook Exemplo",
            "guardianName": "Mãe Exemplo",
            "email": "lead@exemplo.pt",
            "phone": "912345678",
            "consent": True,
        },
    )
    assert r.status_code == 201, r.text
    await execute(
        mw.pool,
        "insert into users (email, name, password_hash) values ('conta.nova@exemplo.pt', 'Conta Nova Sem Ficha', 'x') on conflict do nothing",
    )
    row = await fetch_one(
        mw.pool,
        "insert into athletes (code, name, birth_date, sport_slug, category) values ('SFC-9901', 'Atleta Novo Exemplo', '2012-03-04', 'futsal', 'Sub-15') returning id",
    )
    assert row
    await execute(mw.pool, "update athletes set created_at = now() - interval '60 days' where code <> 'SFC-9901'")

    # Público: sem acesso
    assert (await c.get("/api/v1/admin/recent-entries")).status_code == 401

    # Admin vê tudo: pré-inscrição (por tratar), ficha nova e conta sem ficha
    adm = await mw.login("admin@serradofc.pt", "admin2026")
    items = (await adm.get("/api/v1/admin/recent-entries", params={"days": 7})).json()
    by = {(i["type"], i["name"]): i for i in items}
    assert by[("pre-inscricao", "Lead Facebook Exemplo")]["attention"] is True
    assert by[("atleta", "Atleta Novo Exemplo")]["link"] == "/admin/atletas?q=SFC-9901"
    conta = by[("conta", "Conta Nova Sem Ficha")]
    assert conta["attention"] is True and conta["status"].startswith("Sem ficha")
    assert [i["at"] for i in items] == sorted((i["at"] for i in items), reverse=True)

    # Treinador (athletes.view) só vê as fichas
    tr = await mw.login("treinador@serradofc.pt", "treinador2026")
    types = {i["type"] for i in (await tr.get("/api/v1/admin/recent-entries")).json()}
    assert types == {"atleta"}

    # Atletas: filtro «Novos» (30 dias), mais recentes primeiro
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    novos = (await sec.get("/api/v1/admin/athletes", params={"pending": "new"})).json()
    assert [a["code"] for a in novos] == ["SFC-9901"] and novos[0]["createdAt"]
