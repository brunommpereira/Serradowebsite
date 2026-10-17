"""Estatísticas de visitas no backoffice, contra um Umami falso (o verdadeiro só é acessível dentro do servidor)."""

import json
from collections.abc import Iterator
from dataclasses import replace

import httpx
import pytest

from serrado import config as config_module
from serrado.backend.routes import stats
from tests.conftest import Middleware

SITE = "59e56efe-b981-4211-ba5f-7037a7f9a39c"


class FakeUmami:
    def __init__(self) -> None:
        self.logins = 0
        self.expire_next = False
        self.paths: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/estatisticas/")
        self.paths.append(path)
        if path == "api/auth/login":
            body = json.loads(request.content)
            if body != {"username": "admin", "password": "segredo"}:
                return httpx.Response(401, json={"error": "incorrect"})
            self.logins += 1
            return httpx.Response(200, json={"token": f"tok{self.logins}"})
        if request.headers.get("authorization") != f"Bearer tok{self.logins}" or self.expire_next:
            self.expire_next = False
            return httpx.Response(401, json={"error": "unauthorized"})
        base = f"api/websites/{SITE}"
        if path == f"{base}/stats":
            current = int(request.url.params["startAt"]) > 1_000_000_000_000 and request.url.params["endAt"] > request.url.params["startAt"]
            return httpx.Response(200, json={"pageviews": 120, "visitors": 40, "visits": 50, "bounces": 20, "totaltime": 5000} if current else {})
        if path == f"{base}/pageviews":
            return httpx.Response(
                200,
                json={
                    "pageviews": [{"x": "2026-10-14 00:00:00", "y": 70}, {"x": "2026-10-15 00:00:00", "y": 50}],
                    "sessions": [{"x": "2026-10-14 00:00:00", "y": 25}, {"x": "2026-10-15 00:00:00", "y": 15}],
                },
            )
        if path == f"{base}/active":
            return httpx.Response(200, json={"visitors": 3})
        if path == f"{base}/metrics":
            t = request.url.params["type"]
            return httpx.Response(200, json=[{"x": {"path": "/clube", "referrer": "google.com"}.get(t, t), "y": 9}])
        return httpx.Response(404)


@pytest.fixture
def umami(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeUmami]:
    fake = FakeUmami()
    cfg = replace(config_module.config.umami, url="http://umami/estatisticas", username="admin", password="segredo", website_id=SITE)
    monkeypatch.setattr(config_module.config, "umami", cfg)
    monkeypatch.setattr(stats, "TRANSPORT", httpx.MockTransport(fake.handler))
    yield fake


async def test_admin_ve_as_estatisticas(mw: Middleware, umami: FakeUmami) -> None:
    c = await mw.login("admin@serradofc.pt", "admin2026")
    r = await c.get("/api/v1/admin/visits?period=7d")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["configured"] is True and d["period"] == "7d" and d["activeNow"] == 3
    assert d["summary"] == {"pageviews": 120, "visitors": 40, "visits": 50, "bounceRate": 40, "avgSeconds": 100}
    assert d["series"] == [{"date": "2026-10-14", "pageviews": 70, "visitors": 25}, {"date": "2026-10-15", "pageviews": 50, "visitors": 15}]
    assert d["pages"] == [{"label": "/clube", "value": 9}] and d["referrers"] == [{"label": "google.com", "value": 9}]
    assert set(d) >= {"devices", "browsers", "os", "countries", "previous"}
    # Sessão do Umami expirada: entra de novo sozinho
    umami.expire_next = True
    assert (await c.get("/api/v1/admin/visits")).status_code == 200
    assert umami.logins == 2


async def test_so_quem_tem_permissao(mw: Middleware, umami: FakeUmami) -> None:
    c = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await c.get("/api/v1/admin/visits")).status_code == 403
    assert (await mw.client().get("/api/v1/admin/visits")).status_code == 401
    assert (await c.get("/api/v1/admin/visits?period=1d")).status_code == 400


async def test_sem_umami_configurado(mw: Middleware) -> None:
    c = await mw.login("admin@serradofc.pt", "admin2026")
    assert (await c.get("/api/v1/admin/visits")).json() == {"configured": False}
    assert (await mw.client().get("/api/v1/content/analytics")).json() == {"websiteId": ""}


async def test_id_publico_do_contador(mw: Middleware, umami: FakeUmami) -> None:
    r = await mw.client().get("/api/v1/content/analytics")
    assert r.json() == {"websiteId": SITE}
    assert "segredo" not in r.text


async def test_filtros_de_atletas_sem_email_e_sem_conta(mw: Middleware) -> None:
    from serrado.db.pool import execute

    await execute(mw.pool, "insert into athletes (code, name, sport_slug, email) values ('SFC-0950', 'Sem Email', 'atletismo', '  ')")
    await execute(mw.pool, "insert into athletes (code, name, sport_slug, email) values ('SFC-0951', 'Sem Conta', 'futsal', 'sem.conta@exemplo.pt')")
    c = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    sem_email = (await c.get("/api/v1/admin/athletes?pending=email")).json()
    assert [a["name"] for a in sem_email] == ["Sem Email"]
    assert sem_email[0]["hasEmail"] is False
    sem_conta = {a["name"] for a in (await c.get("/api/v1/admin/athletes?pending=account")).json()}
    assert sem_conta == {"Sem Email", "Sem Conta"}
    todos = {a["name"]: a for a in (await c.get("/api/v1/admin/athletes")).json()}
    assert todos["Rita Exemplo"]["hasEmail"] is True and todos["Rita Exemplo"]["accounts"] == 1
