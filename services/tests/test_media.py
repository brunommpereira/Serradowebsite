"""Biblioteca de imagens e texto rico (HTML) nos conteúdos."""

import base64

import pytest

from serrado.db.pool import fetch
from serrado.html import sanitize_body, to_html

# PNG 1×1 transparente
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
EDITOR = {"email": "editor@serradofc.pt", "roles": "editor"}
TREINADOR = {"email": "treinador@serradofc.pt", "roles": "treinador"}


@pytest.fixture(scope="module")
def call(backend_env):
    return backend_env[1]


@pytest.fixture(scope="module")
def pool(backend_env):
    return backend_env[0]


@pytest.fixture(scope="module")
def state():
    return {}


async def test_o_editor_carrega_uma_imagem_o_tipo_vem_do_conteudo(call, state):
    r = await call("POST", "/cms/media", EDITOR, {"name": "equipa<script>.jpg", "data": PNG, "alt": " Equipa sub-11 ", "width": 1, "height": 1})
    assert r.status_code == 201
    m = r.json()
    assert m["mime"] == "image/png"
    assert m["name"] == "equipascript.jpg"
    assert m["alt"] == "Equipa sub-11"
    assert m["uploadedByName"] == "Equipa de Comunicação"
    assert "data" not in m
    state.update(id=m["id"], key=m["key"])


async def test_recusa_ficheiros_que_nao_sao_imagens_e_quem_nao_e_editor(call):
    svg = base64.b64encode(b'<svg onload="alert(1)"></svg>').decode()
    assert (await call("POST", "/cms/media", EDITOR, {"name": "x.svg", "data": svg})).status_code == 415
    assert (await call("POST", "/cms/media", TREINADOR, {"name": "a.png", "data": PNG})).status_code == 403
    assert (await call("GET", "/cms/media", TREINADOR)).status_code == 403


async def test_lista_pesquisa_e_altera_o_texto_alternativo(call, state):
    assert len((await call("GET", "/cms/media?q=sub-11", EDITOR)).json()) == 1
    p = await call("PATCH", f"/cms/media/{state['id']}", EDITOR, {"alt": "Equipa de sub-11 em 2026"})
    assert p.json()["alt"] == "Equipa de sub-11 em 2026"


async def test_o_conteudo_publico_so_se_obtem_pela_chave_aleatoria(call, state):
    r = await call("GET", f"/media/{state['key']}")
    assert r.status_code == 200
    assert r.json() == {"mime": "image/png", "data": PNG}
    assert (await call("GET", "/media/00000000-0000-0000-0000-000000000000")).status_code == 404
    assert (await call("GET", "/media/1")).status_code == 400


async def test_nao_se_apaga_uma_imagem_em_uso(call, pool, state):
    news = await call(
        "POST",
        "/cms/news",
        EDITOR,
        {"slug": "com-imagem", "title": "Com imagem", "category": "Clube", "body": f'<p>Olá</p><img src="/api/v1/media/{state["key"]}.png" alt="x">'},
    )
    assert news.status_code == 201
    deleted = await call("DELETE", f"/cms/media/{state['id']}", EDITOR)
    assert deleted.status_code == 409
    assert "Com imagem" in deleted.json()["message"]
    assert [u["title"] for u in (await call("GET", f"/cms/media/{state['id']}/usage", EDITOR)).json()] == ["Com imagem"]
    await call("DELETE", f"/cms/news/{news.json()['id']}", EDITOR)
    assert (await call("DELETE", f"/cms/media/{state['id']}", EDITOR)).status_code == 204
    rows = await fetch(pool, "select action from audit_log where entity = 'cms_media' order by id")
    assert [r["action"] for r in rows] == ["cms.media.upload", "cms.media.update", "cms.media.delete"]


async def test_imagens_grandes_sao_recusadas(call):
    big = base64.b64encode(b"\x89PNG\r\n\x1a\n" + bytes(5 * 1024 * 1024)).decode()
    assert (await call("POST", "/cms/media", EDITOR, {"name": "grande.png", "data": big})).status_code == 413


# ---------------------------------------------------------------- texto rico
async def test_o_html_do_editor_e_limpo_antes_de_ser_gravado(call):
    r = await call(
        "POST",
        "/cms/news",
        EDITOR,
        {
            "slug": "html-limpo",
            "title": "HTML",
            "category": "Clube",
            "body": '<h1>Título</h1><p onclick="x()" style="color:red">Olá <b>mundo</b><script>alert(1)</script></p>'
            '<a href="javascript:alert(1)">mau</a><a href="https://serradofc.pt" target="_blank">bom</a>'
            '<img src="javascript:alert(1)"><img src="http://inseguro.pt/a.png"><img src="/api/v1/media/abc.webp" alt="ok"><iframe src="https://x"></iframe>',
        },
    )
    assert r.status_code == 201
    assert r.json()["body"] == (
        '<h2>Título</h2><p>Olá <strong>mundo</strong></p><a rel="noopener noreferrer">mau</a>'
        '<a href="https://serradofc.pt" target="_blank" rel="noopener noreferrer">bom</a><img src="/api/v1/media/abc.webp" alt="ok">'
    )


async def test_a_capa_so_aceita_imagens_da_biblioteca_ou_https(call):
    base = {"slug": "capa", "title": "Capa", "category": "Clube"}
    assert (await call("POST", "/cms/news", EDITOR, {**base, "coverUrl": "javascript:alert(1)"})).status_code == 400
    assert (await call("POST", "/cms/news", EDITOR, {**base, "coverUrl": "/api/v1/media/abc.webp"})).status_code == 201


def test_o_texto_simples_antigo_mantem_se_e_passa_a_paragrafos():
    old = "Primeiro parágrafo <com> sinais.\n\nSegundo\ncom quebra."
    assert sanitize_body(old) == old
    assert to_html(old) == "<p>Primeiro parágrafo &lt;com&gt; sinais.</p><p>Segundo<br>com quebra.</p>"
    assert to_html("<p>Já é HTML</p>") == "<p>Já é HTML</p>"


def test_ligacoes_relativas_ao_protocolo_sao_removidas():
    assert sanitize_body('<p><a href="//evil.example">x</a></p>') == '<p><a rel="noopener noreferrer">x</a></p>'
