"""Base de dados de teste: criada do zero (migrações + seed) para cada ficheiro de testes."""

import os
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg
import pytest

from serrado.config import config
from serrado.db.migrate import migrate
from serrado.db.pool import Pool, create_pool
from serrado.db.seed import seed

BASE = os.environ.get("TEST_DATABASE_URL", "postgresql://serrado:serrado@localhost:5432/serrado_test")


async def fresh_database(suffix: str) -> Pool:
    parts = urlsplit(BASE)
    name = f"{parts.path.lstrip('/')}_{suffix}"
    admin = await psycopg.AsyncConnection.connect(urlunsplit(parts._replace(path="/postgres")), autocommit=True)
    try:
        await admin.execute(f"drop database if exists {name} with (force)")
        await admin.execute(f"create database {name}")
    finally:
        await admin.close()
    pool = create_pool(urlunsplit(parts._replace(path="/" + name)), max_size=5)
    await pool.open()
    await migrate(pool, lambda _m: None)
    await seed(pool, lambda _m: None)
    return pool


def asgi_client(app: Any, client_ip: str = "127.0.0.1", base_url: str = "http://test") -> httpx.AsyncClient:
    """Cliente HTTP em memória (sem rede) para uma app ASGI."""
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(client_ip, 50000)), base_url=base_url)


class BackendCaller:
    """Pedidos ao backend como se viessem do middleware, em nome de um utilizador."""

    def __init__(self, client: httpx.AsyncClient, users: dict[str, str]) -> None:
        self.client = client
        self.users = users

    async def __call__(self, method: str, url: str, as_: dict[str, str] | None = None, json: Any = None) -> httpx.Response:
        as_ = as_ or {}
        headers = {
            "authorization": f"Bearer {config.service_token}",
            "x-actor-id": self.users[as_["email"]] if as_.get("email") else "",
            "x-actor-roles": as_.get("roles", ""),
        }
        return await self.client.request(method, "/internal/v1" + url, headers=headers, json=json)


@pytest.fixture(scope="module")
async def backend_env(request: pytest.FixtureRequest) -> AsyncIterator[tuple[Pool, BackendCaller]]:
    from serrado.backend.app import build_backend

    pool = await fresh_database(request.module.__name__.split(".")[-1].removeprefix("test_"))
    async with pool.connection() as c:
        users = {r["email"]: r["id"] for r in await (await c.execute("select id, email from users")).fetchall()}
    app = build_backend(pool)
    async with asgi_client(app) as client:
        yield pool, BackendCaller(client, users)
    await pool.close()


class Middleware:
    """Middleware real a falar com o backend real em memória (sem rede)."""

    def __init__(self, app: Any, pool: Pool) -> None:
        self.app = app
        self.pool = pool
        self._ip = 0

    def client(self, ip: str | None = None) -> httpx.AsyncClient:
        if ip is None:
            self._ip += 1
            ip = f"10.1.{self._ip // 250}.{self._ip % 250 + 1}"
        return asgi_client(self.app, ip)

    async def login(self, user: str, password: str) -> httpx.AsyncClient:
        """Novo cliente (IP diferente por login: o rate limit é por IP) com a sessão iniciada."""
        c = self.client()
        r = await c.post("/api/v1/auth/login", json={"login": user, "password": password}, headers=XHR)
        assert r.status_code == 200, r.text
        c.headers.update(XHR)
        return c


XHR = {"x-requested-with": "XMLHttpRequest"}


def build_stack(pool: Pool, **kwargs: Any) -> Any:
    from serrado.backend.app import build_backend
    from serrado.middleware.app import build_middleware
    from serrado.middleware.backend_client import BackendClient

    backend_app = build_backend(pool)
    client = BackendClient(transport=httpx.ASGITransport(app=backend_app), base_url="http://backend")
    return build_middleware(backend_client=client, **kwargs)


@pytest.fixture(scope="module")
async def mw(request: pytest.FixtureRequest) -> AsyncIterator[Middleware]:
    pool = await fresh_database(request.module.__name__.split(".")[-1].removeprefix("test_"))
    app = build_stack(pool)
    yield Middleware(app, pool)
    await pool.close()
