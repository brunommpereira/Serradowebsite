"""
Estatísticas de visitas no backoffice. Os números vêm do Umami instalado no servidor, que não está
acessível na internet (só o script do contador e o envio das visitas): o backend pede-os por dentro,
com a conta do Umami guardada em /etc/serrado/serrado.env.
"""

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Query, Request

from ...config import UmamiConfig, config
from ..core import HttpError, require

log = logging.getLogger("serrado.stats")
LISBON = ZoneInfo("Europe/Lisbon")
Period = Literal["7d", "30d", "90d", "12m"]
DAYS = {"7d": 7, "30d": 30, "90d": 90, "12m": 365}
# Nos testes: um Umami falso (httpx.MockTransport)
TRANSPORT: httpx.AsyncBaseTransport | None = None
LISTS = {"pages": "path", "referrers": "referrer", "devices": "device", "browsers": "browser", "os": "os", "countries": "country"}


class UmamiClient:
    """Pedidos à API do Umami (127.0.0.1), com o token da sessão guardado em memória."""

    def __init__(self, cfg: UmamiConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.cfg = cfg
        self.http = httpx.AsyncClient(base_url=cfg.url + "/", transport=transport, timeout=10.0, trust_env=False)
        self.token: str | None = None
        self.lock = asyncio.Lock()

    async def _login(self) -> str:
        res = await self.http.post("api/auth/login", json={"username": self.cfg.username, "password": self.cfg.password})
        if res.status_code != 200:
            raise HttpError(
                502, "stats_auth", "O servidor de estatísticas recusou a conta configurada (volta a correr «Actions → Estatísticas (Umami)»)"
            )
        self.token = str(res.json()["token"])
        return self.token

    async def get(self, path: str, params: dict[str, Any]) -> Any:
        for attempt in range(2):
            async with self.lock:
                token = self.token or await self._login()
            try:
                res = await self.http.get(path, params=params, headers={"authorization": f"Bearer {token}"})
            except httpx.HTTPError:
                raise HttpError(503, "stats_unavailable", "O servidor de estatísticas não está a responder") from None
            if res.status_code == 401 and attempt == 0:
                self.token = None  # sessão expirada: entra de novo
                continue
            if res.status_code != 200:
                raise HttpError(502, "stats_error", f"O servidor de estatísticas respondeu {res.status_code}")
            return res.json()
        raise HttpError(502, "stats_auth", "Sem sessão no servidor de estatísticas")


def _client(req: Request) -> UmamiClient:
    state = req.app.state
    client: UmamiClient | None = getattr(state, "umami", None)
    if client is None or client.cfg is not config.umami:
        client = UmamiClient(config.umami, TRANSPORT)
        state.umami = client
    return client


def _summary(s: dict[str, Any]) -> dict[str, Any]:
    visits = int(s.get("visits") or 0)
    return {
        "pageviews": int(s.get("pageviews") or 0),
        "visitors": int(s.get("visitors") or 0),
        "visits": visits,
        # Visitas com uma só página, e tempo médio por visita (segundos)
        "bounceRate": round(100 * int(s.get("bounces") or 0) / visits) if visits else 0,
        "avgSeconds": round(int(s.get("totaltime") or 0) / visits) if visits else 0,
    }


def register(r: APIRouter) -> None:
    @r.get("/visits", tags=["Estatísticas"], summary="Visitas ao site (Umami): resumo, evolução e listas de topo")
    async def stats(req: Request, period: Annotated[Period, Query()] = "30d") -> dict[str, Any]:
        require(req, "stats.view")
        if not config.umami.enabled:
            return {"configured": False}
        days = DAYS[period]
        now = datetime.now(UTC)
        start = (now.astimezone(LISBON) - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        rng = {"startAt": int(start.timestamp() * 1000), "endAt": int(time.time() * 1000)}
        # O período anterior, com a mesma duração, para comparar
        prev = {"startAt": rng["startAt"] - (rng["endAt"] - rng["startAt"]), "endAt": rng["startAt"]}
        unit = "month" if period == "12m" else "day"
        client = _client(req)
        site = config.umami.website_id
        base = f"api/websites/{site}"
        current, previous, series, active, *lists = await asyncio.gather(
            client.get(f"{base}/stats", rng),
            client.get(f"{base}/stats", prev),
            client.get(f"{base}/pageviews", {**rng, "unit": unit, "timezone": "Europe/Lisbon"}),
            client.get(f"{base}/active", {}),
            *(client.get(f"{base}/metrics", {**rng, "type": t, "limit": 10}) for t in LISTS.values()),
        )
        visitors = {str(x["x"])[:10]: int(x["y"]) for x in series.get("sessions", [])}
        return {
            "configured": True,
            "period": period,
            "unit": unit,
            "from": start.date().isoformat(),
            "summary": _summary(current),
            "previous": _summary(previous),
            "activeNow": int((active or {}).get("visitors") or 0),
            "series": [
                {"date": str(x["x"])[:10], "pageviews": int(x["y"]), "visitors": visitors.get(str(x["x"])[:10], 0)}
                for x in series.get("pageviews", [])
            ],
            **{key: [{"label": str(x.get("x") or ""), "value": int(x.get("y") or 0)} for x in rows] for key, rows in zip(LISTS, lists, strict=True)},
        }
