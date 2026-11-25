"""Publicar no Facebook e no Instagram a partir do backoffice, contra uma Graph API falsa (em memória)."""

import io
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from PIL import Image

from serrado import social_publish
from serrado.config import FacebookConfig, config
from serrado.db.pool import execute, fetch, fetch_one
from serrado.facebook import GraphClient, sync

TOKEN = "EAAB-token-secreto-da-pagina"
CFG = FacebookConfig(page_id="1234", page_token=TOKEN, graph_version="v25.0", mode="publish", tag="")
URL = "/api/v1/admin/social-posts"


def png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (width, height), (0, 74, 142, 255)).save(out, "PNG")
    return out.getvalue()


class FakeGraph:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, str]]] = []
        self.fail_with: dict[str, Any] | None = None
        self.container_checks = 0
        self.feed: list[dict[str, Any]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()} if request.method == "POST" else dict(request.url.params)
        if form.pop("access_token", None) != TOKEN:
            return httpx.Response(400, json={"error": {"type": "OAuthException", "code": 190, "message": "Invalid OAuth access token."}})
        path = request.url.path.removeprefix("/v25.0/")
        self.calls.append((request.method, path, form))
        if request.method == "POST" and self.fail_with:
            return httpx.Response(403, json={"error": self.fail_with})
        match (request.method, path):
            case ("GET", "1234"):
                return httpx.Response(
                    200, json={"name": "Serrado Futebol Clube", "instagram_business_account": {"id": "1784", "username": "serradofc"}}
                )
            case ("POST", "1234/photos"):
                return httpx.Response(200, json={"id": "555", "post_id": "1234_555"})
            case ("POST", "1234/feed"):
                return httpx.Response(200, json={"id": "1234_556"})
            case ("GET", "1234_555"):
                return httpx.Response(200, json={"permalink_url": "https://www.facebook.com/1234/posts/555"})
            case ("GET", "1234_556"):
                return httpx.Response(200, json={"permalink_url": "https://www.facebook.com/1234/posts/556"})
            case ("POST", "1784/media"):
                return httpx.Response(200, json={"id": "c1"})
            case ("GET", "c1"):
                self.container_checks += 1
                return httpx.Response(200, json={"status_code": "FINISHED" if self.container_checks > 1 else "IN_PROGRESS"})
            case ("POST", "1784/media_publish"):
                return httpx.Response(200, json={"id": "m1"})
            case ("GET", "m1"):
                return httpx.Response(200, json={"permalink": "https://www.instagram.com/p/abc/"})
            case ("GET", "1234/posts"):
                return httpx.Response(200, json={"data": self.feed, "paging": {}})
            case ("GET", "1234/events" | "1234/video_reels" | "1234/stories"):
                return httpx.Response(200, json={"data": []})
        return httpx.Response(404, json={"error": {"message": f"unknown {path}"}})


@pytest.fixture
def graph(monkeypatch: pytest.MonkeyPatch) -> FakeGraph:
    g = FakeGraph()
    monkeypatch.setattr(social_publish, "TRANSPORT", httpx.MockTransport(g.handler))

    async def no_wait(_: float) -> None:
        return None

    monkeypatch.setattr(social_publish, "SLEEP", no_wait)
    monkeypatch.setattr(config, "facebook", CFG)
    monkeypatch.setattr(config.oauth, "public_url", "https://www.serradofc.pt")
    return g


async def media_url(pool: Any, data: bytes) -> str:
    row = await fetch_one(
        pool, "insert into cms_media (name, mime, size_bytes, data) values ('cartaz.png', 'image/png', %s, %s) returning key", [len(data), data]
    )
    assert row
    return f"/api/v1/media/{row['key']}.png"


def test_imagem_passa_a_jpeg_dentro_das_proporcoes_do_instagram():
    jpeg, w, h = social_publish.to_jpeg(png(800, 200))  # 4:1, demasiado largo
    assert jpeg[:3] == b"\xff\xd8\xff"
    assert abs(w / h - 1.91) < 0.01
    jpeg, w, h = social_publish.to_jpeg(png(400, 1000))  # demasiado alto
    assert abs(w / h - 0.8) < 0.01
    _, w, h = social_publish.to_jpeg(png(3000, 3000))
    assert (w, h) == (1440, 1440)


async def test_sem_facebook_ligado_nao_deixa_publicar(mw, monkeypatch):
    monkeypatch.setattr(config, "facebook", FacebookConfig(page_id="", page_token="", graph_version="v25.0", mode="publish", tag=""))
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await ed.get(f"{URL}/status")).json()["configured"] is False
    r = await ed.post(URL, json={"networks": ["facebook"], "caption": "Olá"})
    assert r.status_code == 409


async def test_publicar_agora_no_facebook_e_no_instagram(mw, graph):
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    st = (await ed.get(f"{URL}/status")).json()
    assert st == {"configured": True, "page": "Serrado Futebol Clube", "instagram": "serradofc", "error": None}

    news = await fetch_one(
        mw.pool,
        """insert into cms_news (slug, title, category, summary, body, author, status, published_at)
           values ('obrigado-teste', 'Obrigado, Teste', 'Clube', 'Resumo', '<p>x</p>', 'Teste', 'published', now()) returning id""",
    )
    assert news
    image = await media_url(mw.pool, png(1080, 1350))
    body = {
        "networks": ["facebook", "instagram"],
        "caption": "Obrigado, Teste! 💙💛 #SerradoFC",
        "link": "https://www.serradofc.pt/noticias/obrigado-teste",
        "imageUrl": image,
        "newsId": news["id"],
    }
    r = await ed.post(URL, json=body)
    assert r.status_code == 200, r.text
    ids = [p["id"] for p in r.json()]
    rows = await fetch(mw.pool, "select network, status, external_id, permalink, error from social_posts where id = any(%s) order by network", [ids])
    assert rows == [
        {
            "network": "facebook",
            "status": "published",
            "external_id": "1234_555",
            "permalink": "https://www.facebook.com/1234/posts/555",
            "error": None,
        },
        {"network": "instagram", "status": "published", "external_id": "m1", "permalink": "https://www.instagram.com/p/abc/", "error": None},
    ]
    photo = next(f for m, p, f in graph.calls if (m, p) == ("POST", "1234/photos"))
    assert photo["url"].startswith("https://www.serradofc.pt/api/v1/media/") and photo["url"].endswith(".jpg")
    assert photo["message"].endswith("\n\nhttps://www.serradofc.pt/noticias/obrigado-teste")
    ig = next(f for m, p, f in graph.calls if (m, p) == ("POST", "1784/media"))
    assert ig["image_url"] == photo["url"], "a mesma imagem JPEG serve as duas redes"
    assert ig["caption"] == body["caption"]
    assert graph.container_checks == 2, "esperou que o Instagram preparasse a imagem"
    jpeg = await fetch_one(mw.pool, "select mime from cms_media where key = %s::uuid", [photo["url"].rsplit("/", 1)[1].removesuffix(".jpg")])
    assert jpeg == {"mime": "image/jpeg"}

    # A sincronização com o Facebook não importa a publicação outra vez como notícia nova
    graph.feed = [
        {
            "id": "1234_555",
            "message": body["caption"],
            "created_time": "2026-11-25T18:00:00+0000",
            "updated_time": "2026-11-25T18:00:00+0000",
            "status_type": "added_photos",
        }
    ]
    before = await fetch_one(mw.pool, "select count(*)::int as n from cms_news")
    s = await sync(mw.pool, CFG, GraphClient(CFG, transport=httpx.MockTransport(graph.handler)))
    assert s.news_created == 0 and s.news_updated == 0
    assert await fetch_one(mw.pool, "select count(*)::int as n from cms_news") == before
    assert await fetch_one(mw.pool, "select title from cms_news where id = %s", [news["id"]]) == {"title": "Obrigado, Teste"}

    listed = (await ed.get(URL)).json()
    assert {p["newsTitle"] for p in listed if p["id"] in ids} == {"Obrigado, Teste"}


async def test_agendar_cancelar_e_validacoes(mw, graph):
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    later = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    r = await ed.post(URL, json={"networks": ["facebook"], "caption": "Amanhã há jogo!", "scheduledAt": later})
    assert r.status_code == 200, r.text
    post = r.json()[0]
    assert post["status"] == "scheduled"
    assert not [c for c in graph.calls if c[0] == "POST"], "agendada: ainda não sai"
    s = await social_publish.dispatch(mw.pool)
    assert s.published == 0, "ainda não chegou à hora"

    assert (await ed.post(f"{URL}/{post['id']}/cancel")).json()["status"] == "cancelled"
    assert (await ed.post(f"{URL}/{post['id']}/cancel")).status_code == 409

    bad = [
        {"networks": ["instagram"], "caption": "Sem imagem"},
        {"networks": ["facebook", "facebook"], "caption": "Repetida"},
        {"networks": ["facebook"], "caption": "Link sem https", "link": "http://x.pt"},
        {"networks": ["facebook"], "caption": "No passado", "scheduledAt": "2020-01-01T10:00:00+00:00"},
        {"networks": ["facebook"], "caption": "Muito longe", "scheduledAt": (datetime.now(UTC) + timedelta(days=90)).isoformat()},
        {"networks": ["instagram"], "caption": " ".join(f"#t{i}" for i in range(31)), "imageUrl": "/api/v1/media/x.png"},
        {"networks": [], "caption": "Nenhuma rede"},
    ]
    for b in bad:
        assert (await ed.post(URL, json=b)).status_code in (400, 422), b

    # Sem permissão de conteúdos: recusado
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.post(URL, json={"networks": ["facebook"], "caption": "Olá"})).status_code == 403


async def test_erro_da_meta_tenta_de_novo_e_depois_fica_falhada(mw, graph):
    graph.fail_with = {"type": "OAuthException", "code": 200, "message": "Requires pages_manage_posts permission"}
    row = await fetch_one(mw.pool, "insert into social_posts (network, caption) values ('facebook', 'Texto sem imagem') returning id")
    assert row
    pid = row["id"]
    for attempt in (1, 2, 3):
        await execute(mw.pool, "update social_posts set scheduled_at = now() where id = %s and status = 'scheduled'", [pid])
        s = await social_publish.dispatch(mw.pool, ids=[pid])
        got = await fetch_one(mw.pool, "select status, attempts, error from social_posts where id = %s", [pid])
        assert got and got["attempts"] == attempt and "pages_manage_posts" in got["error"]
        assert got["status"] == ("failed" if attempt == 3 else "scheduled")
        assert TOKEN not in got["error"] and TOKEN not in str(s.errors)

    # Voltar a tentar depois de corrigir a permissão: publica sem imagem no /feed, com o link
    graph.fail_with = None
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await ed.post(f"{URL}/{pid}/retry")).json()["status"] == "scheduled"
    got = await fetch_one(mw.pool, "select status, external_id from social_posts where id = %s", [pid])
    assert got == {"status": "published", "external_id": "1234_556"}
    assert ("POST", "1234/feed", {"message": "Texto sem imagem"}) in graph.calls


async def test_interrompida_a_meio_nao_se_repete(mw, graph):
    row = await fetch_one(
        mw.pool,
        """insert into social_posts (network, caption, status, attempts, updated_at)
           values ('facebook', 'Interrompida', 'publishing', 1, now() - interval '1 hour') returning id""",
    )
    assert row
    await social_publish.dispatch(mw.pool)
    got = await fetch_one(mw.pool, "select status, error from social_posts where id = %s", [row["id"]])
    assert got and got["status"] == "failed" and "confirma" in got["error"]
    assert not [c for c in graph.calls if c[0] == "POST"]


async def test_imagem_inexistente_falha_com_mensagem_clara(mw, graph):
    row = await fetch_one(
        mw.pool,
        """insert into social_posts (network, caption, image_url, attempts)
           values ('instagram', 'Sem imagem', '/api/v1/media/00000000-0000-0000-0000-000000000000.png', 2) returning id""",
    )
    assert row
    s = await social_publish.dispatch(mw.pool, ids=[row["id"]])
    assert s.failed == 1
    got = await fetch_one(mw.pool, "select status, error from social_posts where id = %s", [row["id"]])
    assert got == {"status": "failed", "error": "a imagem escolhida já não existe na biblioteca"}
