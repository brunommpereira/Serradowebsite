"""Cliente do backend: junta o token de serviço e o contexto do utilizador (X-Actor-Id / X-Actor-Iat) a cada pedido."""

import json
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import config


@dataclass
class Session:
    """Utilizador autenticado (vem do JWT de sessão)."""

    sub: str
    name: str
    roles: list[str] = field(default_factory=list)
    iat: int = 0  # início da sessão: o backend recusa sessões anteriores à última mudança de password


class BackendError(Exception):
    def __init__(self, status: int, body: Any) -> None:
        super().__init__(f"backend {status}")
        self.status = status
        self.body = body


class BackendClient:
    """Por omissão fala por HTTP com o backend; nos testes recebe um transporte em memória."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, base_url: str | None = None) -> None:
        self.http = httpx.AsyncClient(transport=transport, base_url=base_url or config.backend_url, timeout=10.0, trust_env=False)

    async def call(self, method: str, path: str, *, actor: Session | None = None, body: Any = None, query: dict[str, Any] | None = None) -> Any:
        qs = ""
        if query:
            clean = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in query.items() if v is not None and v != ""}
            qs = ("?" + urlencode(clean)) if clean else ""
        headers = {
            "authorization": f"Bearer {config.service_token}",
            "x-actor-id": actor.sub if actor else "",
            "x-actor-iat": str(actor.iat) if actor and actor.iat else "",
        }
        if body is not None:
            headers["content-type"] = "application/json"
        try:
            res = await self.http.request(method, "/internal/v1" + path + qs, headers=headers, content=None if body is None else json.dumps(body))
        except httpx.HTTPError:
            raise BackendError(502, {"error": "backend_unavailable", "message": "Serviço temporariamente indisponível"}) from None
        data = res.json() if res.content else None
        if res.status_code >= 400:
            raise BackendError(res.status_code, data)
        return data

    async def close(self) -> None:
        await self.http.aclose()
