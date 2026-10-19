"""
Notificações push (Web Push) para a app instalável (PWA).

- Encriptação do conteúdo: RFC 8291 (aes128gcm), com a chave do browser (p256dh) e o segredo (auth).
- Identificação do servidor: VAPID (RFC 8292), um JWT ES256 com a chave guardada em push_keys
  (criada no primeiro uso; a pública é a que o browser recebe ao subscrever).
- Envio: fila push_outbox, esvaziada pelo backend em segundo plano (com novas tentativas). Subscrições
  que o serviço de push dá como desaparecidas (404/410) são apagadas.

Os temas públicos (notícias, eventos, jogos) não precisam de conta; os pessoais (pagamentos, pedidos de
gasto) só chegam aos dispositivos ligados à conta.
"""

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .config import config
from .db.pool import Conn, Jsonb, Pool, execute, fetch, fetch_one

log = logging.getLogger("serrado.push")

PUBLIC_TOPICS = ("noticias", "eventos", "jogos")
PERSONAL_TOPICS = ("pagamentos", "gastos")
TOPICS = PUBLIC_TOPICS + PERSONAL_TOPICS
SPORTS = ("atletismo", "futsal", "rugby", "formacao", "escola-de-desporto")
# Só se envia para os serviços de push dos browsers (o endereço vem do browser: evita pedidos a outros sítios)
PUSH_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")
MAX_ATTEMPTS = 6
LOCK = 7301981
TTL = 4 * 24 * 3600  # o serviço de push guarda a notificação até 4 dias se o dispositivo estiver desligado


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def allowed_endpoint(url: str) -> bool:
    u = urlsplit(url)
    host = (u.hostname or "").lower()
    if u.scheme != "https" or u.username or u.port not in (None, 443):
        return False
    # O Chrome recente usa servidores próprios do FCM (ex.: jmt17.google.com/fcm/send/…)
    return any(host == h or host.endswith("." + h) for h in PUSH_HOSTS) or (host.endswith(".google.com") and u.path.startswith("/fcm/"))


# ------------------------------------------------------------------ encriptação (RFC 8291)
def _hkdf(salt: bytes, info: bytes, length: int, ikm: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt(payload: bytes, p256dh: str, auth: str, *, salt: bytes | None = None, server_key: ec.EllipticCurvePrivateKey | None = None) -> bytes:
    """Corpo aes128gcm (um só registo). salt e server_key só se passam nos testes (vetor do RFC)."""
    if len(payload) > 3993:
        raise ValueError("Notificação grande demais")
    ua_public = unb64u(p256dh)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    server_key = server_key or ec.generate_private_key(ec.SECP256R1())
    as_public = server_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = server_key.exchange(ec.ECDH(), ua_key)
    ikm = _hkdf(unb64u(auth), b"WebPush: info\x00" + ua_public + as_public, 32, shared)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = _hkdf(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    body = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)  # \x02: último registo, sem enchimento
    return salt + (4096).to_bytes(4, "big") + bytes([len(as_public)]) + as_public + body


# ------------------------------------------------------------------ chaves VAPID
@dataclass
class Keys:
    private_pem: str
    public_key: str


async def keys(db: Pool | Conn) -> Keys:
    row = await fetch_one(db, "select private_pem, public_key from push_keys where id = 1")
    if not row:
        k = ec.generate_private_key(ec.SECP256R1())
        pem = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        pub = b64u(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        await execute(db, "insert into push_keys (id, private_pem, public_key) values (1, %s, %s) on conflict do nothing", [pem, pub])
        row = await fetch_one(db, "select private_pem, public_key from push_keys where id = 1")
        assert row is not None
    return Keys(str(row["private_pem"]), str(row["public_key"]))


def vapid(endpoint: str, k: Keys) -> str:
    u = urlsplit(endpoint)
    subject = config.mail.from_email or "geral@serradofc.pt"
    token = jwt.encode(
        {"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": f"mailto:{subject}"}, k.private_pem, algorithm="ES256"
    )
    return f"vapid t={token}, k={k.public_key}"


# ------------------------------------------------------------------ mensagens e fila
def message(title: str, body: str, url: str = "/", tag: str | None = None) -> dict[str, Any]:
    """Formato do service worker do Angular (ngsw): ao tocar, abre (ou foca) o site nesse endereço."""
    n: dict[str, Any] = {
        "title": title[:120],
        "body": body[:400],
        "icon": "/brand/icon-192.png",
        "badge": "/brand/badge-96.png",
        "lang": "pt-PT",
        "data": {"url": url, "onActionClick": {"default": {"operation": "navigateLastFocusedOrOpen", "url": url}}},
    }
    if tag:
        n["tag"] = tag
        n["renotify"] = True
    return {"notification": n}


async def to_topic(db: Pool | Conn, topic: str, msg: dict[str, Any], sport: str | None = None) -> int:
    """Para todos os dispositivos com este tema (e, nos jogos, com esta modalidade ou todas)."""
    rows = await fetch(
        db,
        """insert into push_outbox (subscription_id, payload)
           select id, %s from push_subscriptions
            where %s = any(topics) and (%s::text is null or cardinality(sports) = 0 or %s = any(sports))
           returning id""",
        [Jsonb(msg), topic, sport, sport],
    )
    return len(rows)


async def to_users(db: Pool | Conn, user_ids: list[str], topic: str, msg: dict[str, Any], urgency: str = "normal") -> int:
    """Para os dispositivos destas contas que aceitaram este tema."""
    ids = sorted({str(u) for u in user_ids if u})
    if not ids:
        return 0
    rows = await fetch(
        db,
        """insert into push_outbox (subscription_id, payload, urgency)
           select id, %s, %s from push_subscriptions where user_id = any(%s::uuid[]) and %s = any(topics)
           returning id""",
        [Jsonb(msg), urgency, ids, topic],
    )
    return len(rows)


async def once(db: Pool | Conn, key: str) -> bool:
    """True da primeira vez que se avisa sobre isto (ex.: «jogo:2026-10-25T18:00:AD Modelo:lembrete»)."""
    return bool(await fetch(db, "insert into push_sent (key) values (%s) on conflict do nothing returning key", [key[:300]]))


# ------------------------------------------------------------------ envio
@dataclass
class PushSummary:
    sent: int = 0
    failed: int = 0
    removed: int = 0


async def _send_one(http: httpx.AsyncClient, k: Keys, row: dict[str, Any]) -> int:
    body = encrypt(json.dumps(row["payload"], ensure_ascii=False).encode(), row["p256dh"], row["auth"])
    res = await http.post(
        row["endpoint"],
        content=body,
        headers={
            "authorization": vapid(row["endpoint"], k),
            "content-encoding": "aes128gcm",
            "content-type": "application/octet-stream",
            "ttl": str(TTL),
            "urgency": row["urgency"],
        },
    )
    return res.status_code


async def send_pending(pool: Pool, http: httpx.AsyncClient, limit: int = 300) -> PushSummary:
    """Envia a fila (novas tentativas a 1, 2, 4… minutos). Só corre um envio de cada vez."""
    s = PushSummary()
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(%s) as ok", [LOCK])).fetchone()
        if not got or not got["ok"]:
            return s
        try:
            todo = await fetch(
                pool,
                """select o.id, o.payload, o.urgency, o.attempts, s.id as sub_id, s.endpoint, s.p256dh, s.auth
                     from push_outbox o join push_subscriptions s on s.id = o.subscription_id
                    where o.attempts < %s and o.next_at <= now() order by o.id limit %s""",
                [MAX_ATTEMPTS, limit],
            )
            if not todo:
                return s
            k = await keys(pool)
            for i in range(0, len(todo), 20):
                batch = todo[i : i + 20]
                results = await asyncio.gather(*(_send_one(http, k, r) for r in batch), return_exceptions=True)
                for row, res in zip(batch, results, strict=True):
                    if isinstance(res, int) and res in (200, 201, 202):
                        s.sent += 1
                        await execute(pool, "delete from push_outbox where id = %s", [row["id"]])
                        await execute(pool, "update push_subscriptions set last_ok_at = now() where id = %s", [row["sub_id"]])
                    elif isinstance(res, int) and res in (404, 410):
                        # O dispositivo desinstalou a app ou recusou as notificações
                        s.removed += 1
                        await execute(pool, "delete from push_subscriptions where id = %s", [row["sub_id"]])
                    else:
                        s.failed += 1
                        final = isinstance(res, int) and res in (400, 403, 413)
                        error = f"HTTP {res}" if isinstance(res, int) else f"{type(res).__name__}: {res}"
                        await execute(
                            pool,
                            """update push_outbox set attempts = case when %s then %s else attempts + 1 end, error = %s,
                                      next_at = now() + (power(2, attempts) * interval '1 minute') where id = %s""",
                            [final, MAX_ATTEMPTS, error[:300], row["id"]],
                        )
                        log.warning("push: %s falhou: %s", row["id"], error)
            # Limpeza: falhados de vez há mais de 7 dias; marcas de «já avisado» com mais de 1 ano
            await execute(pool, "delete from push_outbox where attempts >= %s and created_at < now() - interval '7 days'", [MAX_ATTEMPTS])
            await execute(pool, "delete from push_sent where at < now() - interval '1 year'")
        finally:
            await lock.execute("select pg_advisory_unlock(%s)", [LOCK])
    return s


async def worker(pool: Pool, every: float = 10.0) -> None:
    """Em segundo plano no backend: esvazia a fila e, de hora a hora, lembra os jogos do dia seguinte."""
    from .notify import match_reminders

    last_reminders = 0.0
    async with httpx.AsyncClient(timeout=15.0, trust_env=False) as http:
        while True:
            try:
                if time.monotonic() - last_reminders > 3600:
                    last_reminders = time.monotonic()
                    await match_reminders(pool)
                await send_pending(pool, http)
            except asyncio.CancelledError:
                raise
            except Exception:  # nunca para: tenta de novo na volta seguinte
                log.exception("push: erro no envio")
            await asyncio.sleep(every)


__all__ = [
    "PERSONAL_TOPICS",
    "PUBLIC_TOPICS",
    "SPORTS",
    "TOPICS",
    "allowed_endpoint",
    "encrypt",
    "keys",
    "message",
    "once",
    "send_pending",
    "to_topic",
    "to_users",
    "worker",
]
