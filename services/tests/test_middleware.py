"""Middleware (/api/v1): sessão, CSRF, rate limit, CORS, conteúdo público, áreas reservadas e backoffice."""

import base64

from serrado.db.pool import execute
from tests.conftest import XHR

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


def set_cookie(r) -> str:
    return "; ".join(r.headers.get_list("set-cookie"))


# ---------------------------------------------------------------- sessão
async def test_login_define_cookie_httponly_e_me_devolve_o_perfil(mw):
    c = mw.client()
    r = await c.post("/api/v1/auth/login", json={"login": "socio@exemplo.pt", "password": "serrado1978"}, headers=XHR)
    assert r.status_code == 200
    cookie = set_cookie(r)
    assert "sfc_session=" in cookie and "HttpOnly" in cookie and "SameSite=Strict" in cookie and "Path=/" in cookie
    assert r.json()["member"]["memberNumber"] == "00482"
    assert "token" not in r.json()  # o token nunca vai no corpo da resposta
    assert len((await c.get("/api/v1/me")).json()["athletes"]) == 2


async def test_sem_sessao_401_credenciais_erradas_401(mw):
    assert (await mw.client().get("/api/v1/me")).status_code == 401
    r = await mw.client().post("/api/v1/auth/login", json={"login": "socio@exemplo.pt", "password": "nao"}, headers=XHR)
    assert r.status_code == 401


async def test_csrf_login_sem_x_requested_with_403(mw):
    r = await mw.client().post("/api/v1/auth/login", json={"login": "socio@exemplo.pt", "password": "serrado1978"})
    assert r.status_code == 403
    assert "set-cookie" not in r.headers


async def test_csrf_escrita_com_cookie_mas_sem_x_requested_with_403(mw):
    c = await mw.login("joao@exemplo.pt", "atleta2026")
    r = await c.post("/api/v1/auth/logout", headers={"x-requested-with": ""})
    assert r.status_code == 403


async def test_logout_apaga_o_cookie(mw):
    c = await mw.login("joao@exemplo.pt", "atleta2026")
    r = await c.post("/api/v1/auth/logout")
    assert r.status_code == 200
    assert 'sfc_session=""' in set_cookie(r) or "sfc_session=;" in set_cookie(r)
    assert (await c.get("/api/v1/me")).status_code == 401


async def test_bearer_token_tambem_serve(mw):
    from serrado.middleware.session import sign_session

    joao = (await mw.login("joao@exemplo.pt", "atleta2026")).cookies.get("sfc_session")
    assert joao
    r = await mw.client().get("/api/v1/me", headers={"authorization": f"Bearer {joao}"})
    assert r.json()["email"] == "joao@exemplo.pt"
    forged = sign_session("00000000-0000-0000-0000-000000000000", "x", ["admin"]) + "x"
    assert (await mw.client().get("/api/v1/me", headers={"authorization": f"Bearer {forged}"})).status_code == 401


async def test_rate_limit_no_login(mw):
    c = mw.client("10.0.0.9")
    last = 0
    for _ in range(12):
        last = (await c.post("/api/v1/auth/login", json={"login": "x@x.pt", "password": "x"}, headers=XHR)).status_code
    assert last == 429


async def test_rate_limit_em_toda_a_api_por_ip(mw):
    c = mw.client("10.3.0.1")
    last = 0
    for _ in range(305):
        last = (await c.get("/api/v1/content/partners")).status_code
    assert last == 429
    # outro IP não é afetado
    assert (await mw.client("10.3.0.2").get("/api/v1/content/partners")).status_code == 200


async def test_ip_real_atras_de_proxy(mw):
    # TRUST_PROXY=true nos testes: o IP vem do X-Forwarded-For
    c = mw.client("127.0.0.1")
    last = 0
    for _ in range(12):
        last = (
            await c.post("/api/v1/auth/login", json={"login": "x@x.pt", "password": "x"}, headers={**XHR, "x-forwarded-for": "10.9.9.9"})
        ).status_code
    assert last == 429
    ok = await c.post("/api/v1/auth/login", json={"login": "x@x.pt", "password": "x"}, headers={**XHR, "x-forwarded-for": "10.9.9.10"})
    assert ok.status_code == 401


async def test_conta_desativada_ou_papel_retirado_deixam_de_valer_logo(mw):
    c = await mw.login("treinador@serradofc.pt", "treinador2026")
    assert (await c.get("/api/v1/admin/athletes")).status_code == 200
    await execute(mw.pool, "delete from user_roles where user_id = (select id from users where email = 'treinador@serradofc.pt')")
    assert (await c.get("/api/v1/admin/athletes")).status_code == 403
    await execute(mw.pool, "update users set disabled = true where email = 'treinador@serradofc.pt'")
    assert (await c.get("/api/v1/me")).status_code == 401
    await execute(mw.pool, "update users set disabled = false where email = 'treinador@serradofc.pt'")
    await execute(mw.pool, "insert into user_roles select id, 'treinador' from users where email = 'treinador@serradofc.pt'")


async def test_cors_so_as_origens_do_site(mw):
    ok = await mw.client().options("/api/v1/me", headers={"origin": "https://brunommpereira.github.io", "access-control-request-method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://brunommpereira.github.io"
    assert ok.headers.get("access-control-allow-credentials") == "true"
    bad = await mw.client().options("/api/v1/me", headers={"origin": "https://malicioso.example", "access-control-request-method": "GET"})
    assert bad.headers.get("access-control-allow-origin") is None


async def test_pedidos_grandes_sao_recusados(mw):
    c = await mw.login("editor@serradofc.pt", "editor2026")
    r = await c.post("/api/v1/admin/cms/news", content=b'{"x":"' + b"a" * (1024 * 1024 + 10) + b'"}', headers={"content-type": "application/json"})
    assert r.status_code == 413


async def test_health(mw):
    r = await mw.client().get("/api/health")
    assert r.json() == {"ok": True, "version": "dev"}


# ---------------------------------------------------------------- conteúdo público (BFF)
async def test_noticias_no_formato_do_front_sem_rascunhos(mw):
    news = (await mw.client().get("/api/v1/content/news")).json()
    assert len(news) >= 7
    assert news[0]["bodyHtml"].startswith("<p>")
    assert len(news[0]["publicationDate"]) == 10
    assert not any(n["slug"] == "rascunho-gala-anual" for n in news)


async def test_home_agrega_noticias_eventos_e_parceiros(mw):
    home = (await mw.client().get("/api/v1/content/home")).json()
    assert len(home["news"]) == 3
    assert isinstance(home["events"], list) and isinstance(home["partners"], list)


async def test_eventos_campos_opcionais_omitidos(mw):
    events = (await mw.client().get("/api/v1/content/events")).json()
    assert events
    assert all("memberPrice" not in e or e["memberPrice"] is not None for e in events)
    assert events == sorted(events, key=lambda e: e["date"])


async def test_pagina_institucional_em_html(mw):
    page = (await mw.client().get("/api/v1/content/pages/privacidade")).json()
    assert page["title"] == "Política de Privacidade"
    assert len(page["bodyHtml"].split("<p>")) > 2
    assert (await mw.client().get("/api/v1/content/pages/nao-existe")).status_code == 404


# ---------------------------------------------------------------- áreas reservadas
async def test_atleta_nao_socio_atletas_sim_area_de_socio_nao(mw):
    c = await mw.login("joao@exemplo.pt", "atleta2026")
    assert (await c.get("/api/v1/me/athletes")).json()[0]["code"] == "SFC-0004"
    m = await c.get("/api/v1/me/member")
    assert m.status_code == 404
    assert m.json()["error"] == "not_member"


async def test_socio_quotas(mw):
    c = await mw.login("00482", "serrado1978")
    assert len((await c.get("/api/v1/me/quotas")).json()) == 3


async def test_atleta_altera_contactos_e_pede_alteracao_de_nome(mw):
    c = await mw.login("atleta@exemplo.pt", "atleta2026")
    rita = (await c.get("/api/v1/me/athletes")).json()[0]["id"]
    assert (await c.patch(f"/api/v1/athletes/{rita}", json={"phone": "912345678"})).status_code == 200
    created = await c.post(f"/api/v1/athletes/{rita}/change-requests", json={"changes": {"name": "Rita Maria Exemplo"}})
    assert created.status_code == 201
    ficha = (await c.get(f"/api/v1/athletes/{rita}")).json()
    assert ficha["phone"] == "912345678"
    assert ficha["pendingRequests"][0]["changes"] == {"name": "Rita Maria Exemplo"}
    assert (await c.get(f"/api/v1/athletes/{rita}/results")).json()[0]["race"]


# ---------------------------------------------------------------- backoffice
async def test_quem_nao_e_staff_nao_entra(mw):
    c = await mw.login("socio@exemplo.pt", "serrado1978")
    assert (await c.get("/api/v1/admin/dashboard")).status_code == 403


async def test_editor_publica_noticia_e_o_site_mostra_a_logo(mw):
    await mw.client().get("/api/v1/content/news")  # aquece a cache
    c = await mw.login("editor@serradofc.pt", "editor2026")
    created = await c.post(
        "/api/v1/admin/cms/news",
        json={
            "slug": "noticia-do-cms",
            "title": "Notícia criada no CMS",
            "category": "Clube",
            "summary": "Resumo",
            "body": "Parágrafo 1\n\nParágrafo 2",
        },
    )
    assert created.status_code == 201
    news = (await mw.client().get("/api/v1/content/news")).json()
    assert not any(n["slug"] == "noticia-do-cms" for n in news), "rascunho não aparece"
    await c.post(f"/api/v1/admin/cms/news/{created.json()['id']}/publish")
    news = (await mw.client().get("/api/v1/content/news")).json()
    n = next(x for x in news if x["slug"] == "noticia-do-cms")
    assert n["bodyHtml"] == "<p>Parágrafo 1</p><p>Parágrafo 2</p>"


async def test_editor_carrega_uma_imagem_e_o_site_serve_a_com_cache_longa(mw):
    c = await mw.login("editor@serradofc.pt", "editor2026")
    up = await c.post("/api/v1/admin/media", json={"name": "logo.png", "data": PNG, "alt": "Logótipo"})
    assert up.status_code == 201
    key, media_id = up.json()["key"], up.json()["id"]
    assert (await c.get("/api/v1/admin/media")).json()[0]["key"] == key
    img = await mw.client().get(f"/api/v1/media/{key}.png")
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert "immutable" in img.headers["cache-control"]
    assert img.headers["x-content-type-options"] == "nosniff"
    assert base64.b64encode(img.content).decode() == PNG
    # Sem sessão de staff não se carrega nada
    socio = await mw.login("socio@exemplo.pt", "serrado1978")
    assert (await socio.post("/api/v1/admin/media", json={"name": "x.png", "data": PNG})).status_code == 403
    # HTML com a imagem: limpo e servido ao site
    news = await c.post(
        "/api/v1/admin/cms/news",
        json={
            "slug": "com-foto",
            "title": "Com foto",
            "category": "Clube",
            "body": f'<p>Olá<script>x()</script></p><img src="/api/v1/media/{key}.png" alt="Logótipo">',
        },
    )
    await c.post(f"/api/v1/admin/cms/news/{news.json()['id']}/publish")
    pub = (await mw.client().get("/api/v1/content/news/com-foto")).json()
    assert pub["bodyHtml"] == f'<p>Olá</p><img src="/api/v1/media/{key}.png" alt="Logótipo">'
    assert (await c.delete(f"/api/v1/admin/media/{media_id}")).status_code == 409


async def test_editor_nao_gere_atletas_secretaria_sim(mw):
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await ed.get("/api/v1/admin/change-requests")).status_code == 403
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    dash = (await sec.get("/api/v1/admin/dashboard")).json()
    assert dash["stats"]["changeRequests"] >= 1
    assert len(dash["attention"]["requests"]) >= 1
    req_id = dash["attention"]["requests"][0]["id"]
    ok = await sec.post(f"/api/v1/admin/change-requests/{req_id}/approve", json={})
    assert ok.json()["status"] == "aprovado"
    docs = (await sec.get("/api/v1/admin/documents")).json()
    assert (await sec.post(f"/api/v1/admin/documents/{docs[0]['id']}/reject")).status_code == 400
    assert (await sec.post(f"/api/v1/admin/documents/{docs[0]['id']}/reject", json={"note": "Ilegível"})).json()["status"] == "Rejeitado"


async def test_so_admin_gere_utilizadores(mw):
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    assert (await sec.get("/api/v1/admin/users")).status_code == 403
    adm = await mw.login("admin@serradofc.pt", "admin2026")
    assert len((await adm.get("/api/v1/admin/users")).json()) >= 7
