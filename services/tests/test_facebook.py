"""Página de Facebook → notícias e eventos do site, contra uma Graph API falsa (em memória)."""

import base64
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from serrado.config import FacebookConfig
from serrado.db.pool import Pool, execute, fetch, fetch_one
from serrado.facebook import GraphClient, sync
from tests.conftest import XHR, asgi_client, build_stack, fresh_database

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
TOKEN = "EAAB-token-secreto-da-pagina"
CFG = FacebookConfig(page_id="1234", page_token=TOKEN, graph_version="v25.0", mode="publish", tag="")


class FakeGraph:
    def __init__(self) -> None:
        self.posts: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.events_error = False
        self.reels: list[dict[str, Any]] = []
        self.stories: list[dict[str, Any]] = []
        self.media: dict[str, dict[str, Any]] = {}
        self.requests: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(str(request.url))
        if request.url.host == "scontent.fbcdn.net":
            return httpx.Response(200, content=PNG)
        if request.url.params.get("access_token") != TOKEN:
            return httpx.Response(400, json={"error": {"type": "OAuthException", "code": 190, "message": "Invalid OAuth access token."}})
        path = request.url.path
        if path == "/v25.0/1234/posts":
            return httpx.Response(200, json={"data": self.posts, "paging": {}})
        if path == "/v25.0/1234/events":
            if self.events_error:
                return httpx.Response(
                    403, json={"error": {"type": "OAuthException", "code": 10, "message": "Requires pages_read_engagement permission"}}
                )
            return httpx.Response(200, json={"data": self.events})
        if path == "/v25.0/1234/video_reels":
            return httpx.Response(200, json={"data": self.reels})
        if path == "/v25.0/1234/stories":
            return httpx.Response(200, json={"data": self.stories})
        if path.removeprefix("/v25.0/") in self.media:
            return httpx.Response(200, json=self.media[path.removeprefix("/v25.0/")])
        if path == "/v25.0/1234":
            return httpx.Response(200, json={"id": "1234", "name": "Serrado Futebol Clube"})
        return httpx.Response(404, json={"error": {"message": "unknown"}})


def post(pid: str, message: str, updated: str = "2026-10-01T10:00:00+0000", **extra: Any) -> dict[str, Any]:
    return {
        "id": f"1234_{pid}",
        "message": message,
        "created_time": "2026-10-01T09:00:00+0000",
        "updated_time": updated,
        "permalink_url": f"https://www.facebook.com/1234/posts/{pid}",
        "status_type": "added_photos",
        **extra,
    }


@pytest.fixture(scope="module")
async def pool() -> AsyncIterator[Pool]:
    p = await fresh_database("facebook")
    yield p
    await p.close()


@pytest.fixture
def graph() -> FakeGraph:
    return FakeGraph()


def client(graph: FakeGraph) -> GraphClient:
    return GraphClient(CFG, transport=httpx.MockTransport(graph.handler))


async def news_by_title(pool: Pool, title: str) -> dict[str, Any] | None:
    return await fetch_one(pool, "select * from cms_news where title = %s", [title])


async def test_publicacoes_passam_a_noticias_publicadas_com_imagem(pool, graph):
    graph.posts = [
        post(
            "101",
            "Grande vitória dos Sub-11 no torneio de Almada! Parabéns a todos. #futsal\n\nObrigado aos pais.",
            full_picture="https://scontent.fbcdn.net/foto.jpg",
        ),
        post("102", "Partilha de outra página", status_type="shared_story"),
        {"id": "1234_103", "created_time": "2026-10-01T09:00:00+0000", "status_type": "added_photos"},  # só foto, sem texto
    ]
    s = await sync(pool, CFG, client(graph))
    assert (s.news_created, s.skipped, s.errors) == (1, 2, [])
    n = await news_by_title(pool, "Grande vitória dos Sub-11 no torneio de Almada!")
    assert n
    assert n["status"] == "published" and n["category"] == "Futsal"
    assert n["summary"] == "Parabéns a todos. Obrigado aos pais."
    assert n["published_at"].startswith("2026-10-01T09:00")
    assert n["slug"] == "grande-vitoria-dos-sub-11-no-torneio-de-almada-101"
    assert 'href="https://www.facebook.com/1234/posts/101"' in n["body"] and "Ver no Facebook" in n["body"]
    assert n["cover_url"].startswith("/api/v1/media/") and n["cover_url"].endswith(".png")
    media = await fetch_one(pool, "select mime, size_bytes from cms_media where name = 'facebook-1234_101.jpg'")
    assert media == {"mime": "image/png", "size_bytes": len(PNG)}
    assert await fetch_one(pool, "select count(*)::int as n from audit_log where action = 'cms.news.create' and details->>'via' = 'facebook'") == {
        "n": 1
    }


async def test_o_site_mostra_a_noticia_importada(pool):
    async with asgi_client(build_stack(pool)) as c:
        news = (await c.get("/api/v1/content/news")).json()
    n = next(x for x in news if x["slug"] == "grande-vitoria-dos-sub-11-no-torneio-de-almada-101")
    assert n["publicationDate"] == "2026-10-01"
    assert n["bodyHtml"].startswith("<p>Grande vitória")


async def test_nao_duplica_e_atualiza_quando_muda_no_facebook(pool, graph):
    graph.posts = [post("101", "Grande vitória dos Sub-11 no torneio de Almada! Parabéns a todos. #futsal\n\nObrigado aos pais e aos treinadores.")]
    s = await sync(pool, CFG, client(graph))
    assert (s.news_created, s.news_updated) == (0, 0), "mesma updated_time: nada a fazer"
    graph.posts[0]["updated_time"] = "2026-10-02T10:00:00+0000"
    s = await sync(pool, CFG, client(graph))
    assert (s.news_created, s.news_updated) == (0, 1)
    n = await news_by_title(pool, "Grande vitória dos Sub-11 no torneio de Almada!")
    assert n and "treinadores" in n["summary"]
    assert await fetch_one(pool, "select count(*)::int as n from cms_news where slug like 'grande-vitoria%%'") == {"n": 1}


async def test_edicao_feita_no_site_ganha_ao_facebook(pool, graph):
    await execute(
        pool, "update cms_news set title = 'Título revisto pela equipa', updated_at = now() + interval '1 minute' where slug like 'grande-vitoria%%'"
    )
    graph.posts = [post("101", "Texto novo no Facebook. #futsal", updated="2026-10-03T10:00:00+0000")]
    s = await sync(pool, CFG, client(graph))
    assert s.news_updated == 0
    assert await news_by_title(pool, "Título revisto pela equipa")


async def test_eventos_com_hora_de_portugal_local_e_tipo(pool, graph):
    graph.events = [
        {
            "id": "555001",
            "name": "Corrida de São Martinho",
            "description": "Inscrições no secretariado.\n\nT-shirt para todos.",
            "start_time": "2026-11-08T09:30:00+0000",  # inverno: Lisboa = UTC
            "end_time": "2026-11-08T12:00:00+0000",
            "place": {"name": "Pavilhão do Serrado"},
            "cover": {"source": "https://scontent.fbcdn.net/capa.jpg"},
            "updated_time": "2026-10-01T10:00:00+0000",
        },
        {
            "id": "555002",
            "name": "Torneio de verão",
            "start_time": "2027-06-20T09:00:00+0000",
            "updated_time": "2026-10-01T10:00:00+0000",
        },  # verão: UTC+1
        {"id": "555003", "name": "Evento cancelado", "start_time": "2026-12-01T10:00:00+0000", "is_canceled": True},
    ]
    s = await sync(pool, CFG, client(graph))
    assert (s.events_created, s.errors) == (2, [])
    rows = {
        r["title"]: r
        for r in await fetch(pool, "select * from cms_events where title in ('Corrida de São Martinho', 'Torneio de verão', 'Evento cancelado')")
    }
    assert set(rows) == {"Corrida de São Martinho", "Torneio de verão"}
    corrida = rows["Corrida de São Martinho"]
    assert (corrida["starts_at"], corrida["end_time"], corrida["location"], corrida["kind"], corrida["status"]) == (
        "2026-11-08T09:30",
        "12:00",
        "Pavilhão do Serrado",
        "Corrida",
        "published",
    )
    assert corrida["cover_url"].startswith("/api/v1/media/")
    verao = rows["Torneio de verão"]
    assert (verao["starts_at"], verao["location"], verao["kind"]) == ("2027-06-20T10:00", "A anunciar", "Torneio")


async def test_evento_cancelado_no_facebook_e_arquivado(pool, graph):
    graph.events = [
        {
            "id": "555002",
            "name": "Torneio de verão",
            "start_time": "2027-06-20T09:00:00+0000",
            "is_canceled": True,
            "updated_time": "2026-10-05T10:00:00+0000",
        }
    ]
    s = await sync(pool, CFG, client(graph))
    assert s.events_archived == 1
    assert await fetch_one(pool, "select status from cms_events where title = 'Torneio de verão'") == {"status": "archived"}


async def test_sem_permissao_para_eventos_as_noticias_entram_na_mesma(pool, graph):
    graph.events_error = True
    graph.posts = [post("201", "Assembleia geral a 20 de outubro. Todos os sócios convidados.")]
    s = await sync(pool, CFG, client(graph))
    assert s.news_created == 1
    assert len(s.errors) == 1 and s.errors[0].startswith("eventos: OAuthException 10")
    assert TOKEN not in " ".join(s.errors)


async def test_token_invalido_erro_claro_sem_mostrar_o_token(pool, graph):
    s = await sync(
        pool,
        replace(CFG, page_token="token-errado"),
        GraphClient(replace(CFG, page_token="token-errado"), transport=httpx.MockTransport(graph.handler)),
    )
    assert s.news_created == 0
    assert s.errors[0].startswith("publicações: OAuthException 190")
    assert "token-errado" not in " ".join(s.errors)


async def test_modo_rascunho_e_filtro_por_hashtag(pool, graph):
    cfg = replace(CFG, mode="draft", tag="site")
    graph.posts = [post("301", "Treino aberto no sábado. #site"), post("302", "Só para o Facebook.")]
    s = await sync(pool, cfg, GraphClient(cfg, transport=httpx.MockTransport(graph.handler)))
    assert (s.news_created, s.skipped) == (1, 1)
    n = await fetch_one(pool, "select status, published_at from cms_news where slug like 'treino-aberto%%'")
    assert n == {"status": "draft", "published_at": None}
    assert await fetch_one(pool, "select 1 as x from cms_news where title like 'Só para o Facebook%%'") is None


async def test_check_mostra_o_nome_da_pagina(graph):
    from serrado.facebook import check

    assert await check(CFG, client(graph)) == "Serrado Futebol Clube"


async def test_reels_entram_com_miniatura_e_aparecem_no_site(pool, graph):
    graph.reels = [
        {
            "id": "880001",
            "description": "Golo do ano nos Sub-13! #futsal",
            "created_time": "2026-10-05T18:00:00+0000",
            "updated_time": "2026-10-05T18:00:00+0000",
            "permalink_url": "/reel/880001/",
            "length": 21.5,
            "thumbnails": {"data": [{"uri": "https://scontent.fbcdn.net/a.jpg"}, {"uri": "https://scontent.fbcdn.net/b.jpg", "is_preferred": True}]},
        },
        {"id": "880002", "created_time": "2026-10-04T18:00:00+0000", "permalink_url": "/reel/880002/"},  # sem miniatura: não aparece
    ]
    s = await sync(pool, CFG, client(graph))
    assert (s.reels_created, s.errors) == (2, [])
    assert "https://scontent.fbcdn.net/b.jpg" in graph.requests
    async with asgi_client(build_stack(pool)) as c:
        reels = (await c.get("/api/v1/content/social?kind=reel")).json()
    assert [r["caption"] for r in reels] == ["Golo do ano nos Sub-13! #futsal"]
    r = reels[0]
    assert r["permalink"] == "https://www.facebook.com/reel/880001/" and r["durationSeconds"] == 21.5
    assert r["thumbUrl"].startswith("/api/v1/media/")
    # Repetir não duplica; mudar a legenda no Facebook atualiza
    graph.reels[0] |= {"description": "Golo do ano!", "updated_time": "2026-10-06T10:00:00+0000"}
    s = await sync(pool, CFG, client(graph))
    assert (s.reels_created, s.reels_updated) == (0, 1)
    assert await fetch_one(pool, "select caption from social_items where external_id = '880001'") == {"caption": "Golo do ano!"}


async def test_historias_so_aparecem_24_horas_e_saem_ao_fim_de_7_dias(pool, graph):
    now = int(datetime.now(UTC).timestamp())
    graph.stories = [
        {
            "post_id": "990001",
            "status": "PUBLISHED",
            "creation_time": str(now - 3600),
            "media_type": "photo",
            "media_id": "77001",
            "url": "https://www.facebook.com/stories/1234/990001",
        },
        {"post_id": "990002", "status": "PUBLISHED", "creation_time": str(now - 7200), "media_type": "video", "media_id": "77002"},
        {"post_id": "990003", "status": "ARCHIVED", "creation_time": str(now - 600), "media_type": "photo", "media_id": "77001"},
    ]
    graph.media = {
        "77001": {
            "images": [
                {"source": "https://scontent.fbcdn.net/grande.jpg", "width": 2048},
                {"source": "https://scontent.fbcdn.net/media.jpg", "width": 1080},
            ]
        },
        "77002": {"picture": "https://scontent.fbcdn.net/video-thumb.jpg"},
    }
    s = await sync(pool, CFG, client(graph))
    assert (s.stories_created, s.errors) == (2, [])
    assert "https://scontent.fbcdn.net/media.jpg" in graph.requests and "https://scontent.fbcdn.net/grande.jpg" not in graph.requests
    async with asgi_client(build_stack(pool)) as c:
        stories = (await c.get("/api/v1/content/social?kind=story")).json()
    assert [(x["mediaType"], x["permalink"]) for x in stories] == [("photo", "https://www.facebook.com/stories/1234/990001"), ("video", None)]
    # Passadas 24 h deixa de se ver; ao fim de 7 dias sai da base de dados com a miniatura
    await execute(
        pool, "update social_items set posted_at = now() - interval '2 days', expires_at = now() - interval '1 day' where external_id = '990001'"
    )
    await execute(pool, "update social_items set posted_at = now() - interval '8 days' where external_id = '990002'")
    media_id = (await fetch_one(pool, "select thumb_media_id from social_items where external_id = '990002'"))["thumb_media_id"]
    graph.stories = []
    s = await sync(pool, CFG, client(graph))
    assert s.stories_removed == 1
    assert await fetch_one(pool, "select 1 from cms_media where id = %s", [media_id]) is None
    async with asgi_client(build_stack(pool)) as c:
        assert (await c.get("/api/v1/content/social?kind=story")).json() == []


async def test_backoffice_esconde_um_reel(pool):
    async with asgi_client(build_stack(pool)) as c:
        c.headers.update(XHR)
        login = await c.post("/api/v1/auth/login", json={"login": "editor@serradofc.pt", "password": "editor2026"})
        assert login.status_code == 200, login.text
        items = (await c.get("/api/v1/admin/social")).json()
        reel = next(x for x in items if x["caption"] == "Golo do ano!")
        assert reel["hidden"] is False
        assert (await c.patch(f"/api/v1/admin/social/{reel['id']}", json={"hidden": True})).json()["hidden"] is True
        assert [r for r in (await c.get("/api/v1/content/social?kind=reel")).json() if r["id"] == reel["id"]] == []
    assert await fetch_one(pool, "select count(*)::int as n from audit_log where action = 'social.hide'") == {"n": 1}


async def test_modo_rascunho_reels_entram_escondidos(pool, graph):
    graph.reels = [
        {"id": "880009", "created_time": "2026-10-07T18:00:00+0000", "permalink_url": "/reel/880009/", "picture": "https://scontent.fbcdn.net/p.jpg"}
    ]
    await sync(pool, replace(CFG, mode="draft"), client(graph))
    assert await fetch_one(pool, "select hidden from social_items where external_id = '880009'") == {"hidden": True}
