"""
Notificações da app (PWA): o browser subscreve com os temas que quer. Os públicos (notícias, eventos,
jogos) não precisam de conta; os pessoais (pagamentos, pedidos de gasto) ficam ligados à conta com
sessão e só chegam a esses dispositivos. A equipa de comunicação pode enviar um aviso a um tema.
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...db.pool import fetch, fetch_one, tx
from ...push import PUBLIC_TOPICS, SPORTS, allowed_endpoint, keys, message, to_topic
from ..core import HttpError, actor, audit, can, pool, require

Topic = Literal["noticias", "eventos", "jogos", "pagamentos", "gastos"]
Sport = Literal["atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"]
B64 = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]+=*$")]


class SubKeys(BaseModel):
    model_config = ConfigDict(extra="ignore")
    p256dh: Annotated[B64, Field(min_length=80, max_length=100)]
    auth: Annotated[B64, Field(min_length=16, max_length=30)]


class Subscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    endpoint: str = Field(max_length=1000)
    keys: SubKeys

    @field_validator("endpoint")
    @classmethod
    def _endpoint(cls, v: str) -> str:
        if not allowed_endpoint(v):
            raise ValueError("serviço de notificações desconhecido")
        return v


class SubscribeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subscription: Subscription
    topics: list[Topic] = Field(default_factory=list, max_length=5)
    sports: list[Sport] = Field(default_factory=list, max_length=5)
    userAgent: str = Field(default="", max_length=400)


class EndpointIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(max_length=1000)


class BroadcastIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    topic: Literal["noticias", "eventos", "jogos"]
    sport: Sport | None = None
    title: str = Field(min_length=3, max_length=80)
    body: str = Field(min_length=3, max_length=240)
    url: str = Field(default="/", max_length=300, pattern=r"^/[^/\\].*$|^/$")


def allowed_topics(req: Request, wanted: list[str]) -> list[str]:
    """Os pessoais só com sessão (e os pedidos de gasto só para quem trabalha com eles)."""
    who = actor(req)
    out = []
    for t in dict.fromkeys(wanted):
        if (
            t in PUBLIC_TOPICS
            or (t == "pagamentos" and who.id)
            or (t == "gastos" and can(req, "expenses.request", "expenses.approve", "expenses.pay", "expenses.view"))
        ):
            out.append(t)
    return out


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Notificações"]

    @r.get("/push/key", tags=tags, summary="Chave pública VAPID (para o browser subscrever)")
    async def key(req: Request) -> dict[str, Any]:
        k = await keys(pool(req))
        return {"publicKey": k.public_key, "topics": [*PUBLIC_TOPICS, "pagamentos", "gastos"], "sports": list(SPORTS)}

    @r.post("/push/subscribe", tags=tags, summary="Criar ou atualizar a subscrição deste dispositivo (temas e modalidades)")
    async def subscribe(req: Request, body: SubscribeIn) -> dict[str, Any]:
        who = actor(req)
        topics = allowed_topics(req, list(body.topics))
        s = body.subscription
        async with tx(pool(req)) as c:
            if not topics:
                await c.execute("delete from push_subscriptions where endpoint = %s", [s.endpoint])
                return {"topics": [], "sports": [], "linked": False}
            await c.execute(
                """insert into push_subscriptions (endpoint, p256dh, auth, user_id, topics, sports, user_agent)
                   values (%s, %s, %s, %s, %s, %s, %s)
                   on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
                     topics = excluded.topics, sports = excluded.sports, user_agent = excluded.user_agent, updated_at = now()""",
                [s.endpoint, s.keys.p256dh, s.keys.auth, who.id, topics, list(dict.fromkeys(body.sports)), body.userAgent],
            )
        return {"topics": topics, "sports": list(dict.fromkeys(body.sports)), "linked": bool(who.id)}

    @r.post("/push/status", tags=tags, summary="Temas e modalidades deste dispositivo")
    async def status(req: Request, body: EndpointIn) -> dict[str, Any]:
        row = await fetch_one(pool(req), "select topics, sports, user_id from push_subscriptions where endpoint = %s", [body.endpoint])
        if not row:
            return {"subscribed": False, "topics": [], "sports": [], "linked": False}
        return {
            "subscribed": True,
            "topics": row["topics"],
            "sports": row["sports"],
            "linked": row["user_id"] is not None and str(row["user_id"]) == actor(req).id,
        }

    @r.post("/push/unsubscribe", tags=tags, summary="Desligar as notificações deste dispositivo", status_code=204)
    async def unsubscribe(req: Request, body: EndpointIn) -> Response:
        await fetch(pool(req), "delete from push_subscriptions where endpoint = %s returning id", [body.endpoint])
        return Response(status_code=204)

    @r.get("/push/stats", tags=tags, summary="Dispositivos com notificações, por tema (comunicação)")
    async def stats(req: Request) -> dict[str, Any]:
        require(req, "cms.edit")
        rows = await fetch(pool(req), "select t as topic, count(*)::int as n from push_subscriptions, unnest(topics) t group by t")
        total = await fetch_one(pool(req), "select count(*)::int as n from push_subscriptions")
        return {"devices": (total or {}).get("n", 0), "topics": {r["topic"]: r["n"] for r in rows}}

    @r.post("/push/broadcast", tags=tags, summary="Enviar um aviso a quem segue um tema (comunicação)")
    async def broadcast(req: Request, body: BroadcastIn) -> dict[str, int]:
        require(req, "cms.edit")
        async with tx(pool(req)) as c:
            n = await to_topic(c, body.topic, message(body.title, body.body, body.url), body.sport)
            await audit(c, actor(req), "push.broadcast", "push", None, {"topic": body.topic, "sport": body.sport, "title": body.title, "devices": n})
        if n == 0:
            raise HttpError(409, "no_devices", "Ainda ninguém ativou as notificações deste tema")
        return {"devices": n}
