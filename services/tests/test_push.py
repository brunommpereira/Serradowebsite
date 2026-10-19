"""Notificações push (PWA): encriptação RFC 8291, subscrições, temas, eventos que geram avisos e envio."""

import json
from datetime import date, datetime, timedelta

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from serrado.db.pool import execute, fetch, fetch_one
from serrado.notify import LISBON, match_reminders
from serrado.push import allowed_endpoint, b64u, encrypt, send_pending, unb64u

ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc"


def test_encriptacao_igual_ao_exemplo_do_rfc_8291():
    """Apêndice A do RFC 8291 (chaves e salt fixos): o corpo tem de sair exatamente igual."""
    as_key = ec.derive_private_key(int.from_bytes(unb64u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), "big"), ec.SECP256R1())
    out = encrypt(
        b"When I grow up, I want to be a watermelon",
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        "BTBZMqHH6r4Tts7J_aSIgg",
        salt=unb64u("DGv6ra1nlYgDCS1FRnbzlw"),
        server_key=as_key,
    )
    assert b64u(out) == (
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    )


def test_so_servicos_de_push_conhecidos():
    assert allowed_endpoint("https://fcm.googleapis.com/fcm/send/abc")
    assert allowed_endpoint("https://jmt17.google.com/fcm/send/abc")
    assert allowed_endpoint("https://web.push.apple.com/QGx")
    assert allowed_endpoint("https://updates.push.services.mozilla.com/wpush/v2/x")
    assert not allowed_endpoint("https://www.google.com/search?q=x")
    assert not allowed_endpoint("http://fcm.googleapis.com/fcm/send/abc")
    assert not allowed_endpoint("https://fcm.googleapis.com.evil.pt/x")
    assert not allowed_endpoint("https://user@fcm.googleapis.com/x")
    assert not allowed_endpoint("https://fcm.googleapis.com:8443/x")


def device() -> tuple[ec.EllipticCurvePrivateKey, dict]:
    k = ec.generate_private_key(ec.SECP256R1())
    pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return k, {"endpoint": ENDPOINT + b64u(pub[:6]), "keys": {"p256dh": b64u(pub), "auth": b64u(b"0123456789abcdef")}}


def decrypt(body: bytes, k: ec.EllipticCurvePrivateKey, auth: bytes) -> dict:
    """O que o browser faz ao receber (para confirmar que o envio chega legível)."""
    salt, idlen = body[:16], body[20]
    as_pub = body[21 : 21 + idlen]
    shared = k.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    ua_pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    hk = lambda salt, info, n, ikm: HKDF(algorithm=hashes.SHA256(), length=n, salt=salt, info=info).derive(ikm)  # noqa: E731
    ikm = hk(auth, b"WebPush: info\x00" + ua_pub + as_pub, 32, shared)
    plain = AESGCM(hk(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)).decrypt(
        hk(salt, b"Content-Encoding: nonce\x00", 12, ikm), body[21 + idlen :], None
    )
    return json.loads(plain.rstrip(b"\x00")[:-1])


@pytest.fixture
async def clean(mw):
    await execute(mw.pool, "delete from push_subscriptions")
    await execute(mw.pool, "delete from push_sent")


async def outbox(mw) -> list[dict]:
    return await fetch(mw.pool, "select s.endpoint, o.payload from push_outbox o join push_subscriptions s on s.id = o.subscription_id order by o.id")


async def test_subscricao_temas_publicos_e_pessoais(mw, clean):
    anon = mw.client("10.9.0.1")
    anon.headers["x-requested-with"] = "XMLHttpRequest"
    key = (await anon.get("/api/v1/push/key")).json()
    assert len(unb64u(key["publicKey"])) == 65
    _, sub = device()
    # Sem sessão: os temas pessoais ficam de fora
    r = await anon.post(
        "/api/v1/push/subscribe", json={"subscription": sub, "topics": ["noticias", "jogos", "pagamentos", "gastos"], "sports": ["rugby"]}
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"topics": ["noticias", "jogos"], "sports": ["rugby"], "linked": False}
    # Endereço que não é de um serviço de push: recusado (o servidor não faz pedidos a qualquer sítio)
    bad = {**sub, "endpoint": "https://intranet.local/x"}
    assert (await anon.post("/api/v1/push/subscribe", json={"subscription": bad, "topics": ["noticias"]})).status_code == 400
    # Com sessão (tesouraria): pagamentos e pedidos de gasto ficam ligados à conta
    t = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    r = await t.post("/api/v1/push/subscribe", json={"subscription": sub, "topics": ["noticias", "pagamentos", "gastos"]})
    assert r.json() == {"topics": ["noticias", "pagamentos", "gastos"], "sports": [], "linked": True}
    st = (await t.post("/api/v1/push/status", json={"endpoint": sub["endpoint"]})).json()
    assert st["subscribed"] and st["linked"]
    # Um sócio sem permissões de gastos não recebe esse tema
    s = await mw.login("socio@exemplo.pt", "serrado1978")
    _, sub2 = device()
    assert (await s.post("/api/v1/push/subscribe", json={"subscription": sub2, "topics": ["pagamentos", "gastos"]})).json()["topics"] == [
        "pagamentos"
    ]
    # Desligar
    assert (await anon.post("/api/v1/push/unsubscribe", json={"endpoint": sub2["endpoint"]})).status_code == 204
    assert not (await anon.post("/api/v1/push/status", json={"endpoint": sub2["endpoint"]})).json()["subscribed"]


async def test_noticia_jogos_e_envio(mw, clean):
    anon = mw.client("10.9.0.2")
    anon.headers["x-requested-with"] = "XMLHttpRequest"
    k_rugby, rugby = device()
    _, futsal = device()
    await anon.post("/api/v1/push/subscribe", json={"subscription": rugby, "topics": ["noticias", "jogos"], "sports": ["rugby"]})
    await anon.post("/api/v1/push/subscribe", json={"subscription": futsal, "topics": ["jogos"], "sports": ["futsal"]})
    editor = await mw.login("editor@serradofc.pt", "editor2026")
    await execute(mw.pool, "delete from push_outbox")

    # Notícia publicada pela primeira vez → quem segue «noticias»; voltar a publicar não repete
    news = (
        await editor.post(
            "/api/v1/admin/cms/news",
            json={"slug": "vitoria-no-torneio", "title": "Vitória no torneio", "summary": "Resumo", "body": "Texto", "category": "Clube"},
        )
    ).json()
    assert (await editor.post(f"/api/v1/admin/cms/news/{news['id']}/publish")).status_code == 200
    await editor.post(f"/api/v1/admin/cms/news/{news['id']}/unpublish")
    await editor.post(f"/api/v1/admin/cms/news/{news['id']}/publish")
    rows = await outbox(mw)
    assert [(r["endpoint"], r["payload"]["notification"]["body"]) for r in rows] == [(rugby["endpoint"], "Vitória no torneio")]
    assert rows[0]["payload"]["notification"]["data"]["onActionClick"]["default"]["url"] == f"/noticias/{news['slug']}"
    await execute(mw.pool, "delete from push_outbox")

    # Resultado de um jogo de rugby → só quem segue o rugby (uma vez)
    match = {"sportSlug": "rugby", "team": "Sub-16", "opponent": "CR Exemplo", "date": "2026-10-10T10:00", "venue": "Campo", "homeAway": "casa",
             "competition": "Regional", "season": "2026/27", "status": "agendado", "scoreHome": None, "scoreAway": None}  # fmt: skip
    await editor.put("/api/v1/admin/site/blocks/matches", json={"data": {"items": [match]}})
    assert await outbox(mw) == []
    done = {**match, "status": "terminado", "scoreHome": 24, "scoreAway": 12}
    assert (await editor.put("/api/v1/admin/site/blocks/matches", json={"data": {"items": [done]}})).status_code == 200
    await editor.put("/api/v1/admin/site/blocks/matches", json={"data": {"items": [done]}})
    rows = await outbox(mw)
    assert [(r["endpoint"], r["payload"]["notification"]["body"]) for r in rows] == [(rugby["endpoint"], "Serrado FC Sub-16 24–12 CR Exemplo")]

    # Envio: entregue (201) sai da fila e chega legível; desaparecido (410) apaga a subscrição
    seen: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["content-encoding"] == "aes128gcm" and req.headers["authorization"].startswith("vapid t=")
        seen.append(decrypt(req.content, k_rugby, b"0123456789abcdef"))
        return httpx.Response(201)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        s = await send_pending(mw.pool, http)
    assert (s.sent, s.failed) == (1, 0) and seen[0]["notification"]["title"] == "Resultado · Rugby"
    assert await outbox(mw) == []

    await anon.post("/api/v1/push/subscribe", json={"subscription": futsal, "topics": ["jogos"], "sports": []})
    await editor.put("/api/v1/admin/site/blocks/matches", json={"data": {"items": [{**done, "scoreAway": 13}]}})  # resultado corrigido
    assert len(await outbox(mw)) == 2
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(410 if "futsal" not in req.url.path else 201))) as http:
        s = await send_pending(mw.pool, http)
    assert s.removed >= 1
    assert not await fetch_one(mw.pool, "select 1 as x from push_subscriptions where endpoint = %s", [rugby["endpoint"]])


async def test_lembrete_na_vespera(mw, clean):
    anon = mw.client("10.9.0.3")
    anon.headers["x-requested-with"] = "XMLHttpRequest"
    _, sub = device()
    await anon.post("/api/v1/push/subscribe", json={"subscription": sub, "topics": ["jogos"]})
    now = datetime(2026, 11, 6, 10, 0, tzinfo=LISBON)
    tomorrow = (now.date() + timedelta(days=1)).isoformat()
    match = {
        "sportSlug": "futsal",
        "team": "Seniores",
        "opponent": "AD Modelo",
        "date": f"{tomorrow}T18:00",
        "venue": "Pavilhão Municipal",
        "homeAway": "fora",
        "status": "agendado",
    }
    await execute(mw.pool, "delete from push_outbox")
    editor = await mw.login("editor@serradofc.pt", "editor2026")
    await editor.put("/api/v1/admin/site/blocks/matches", json={"data": {"items": [match]}})
    assert await match_reminders(mw.pool, now) == 1
    assert await match_reminders(mw.pool, now) == 0  # uma vez só
    rows = await outbox(mw)
    assert rows[0]["payload"]["notification"]["body"] == "AD Modelo – Serrado FC Seniores, 18:00, Pavilhão Municipal"


async def test_pedido_de_gasto_e_aviso_manual(mw, clean):
    t = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    nucleo = await mw.login("nucleo@serradofc.pt", "nucleo2026")
    _, dev_t = device()
    _, dev_n = device()
    await t.post("/api/v1/push/subscribe", json={"subscription": dev_t, "topics": ["gastos"]})
    await nucleo.post("/api/v1/push/subscribe", json={"subscription": dev_n, "topics": ["gastos", "noticias"]})
    await execute(mw.pool, "delete from push_outbox")
    diretor = await mw.login("diretor@serradofc.pt", "diretor2026")
    r = await diretor.post(
        "/api/v1/admin/expenses", json={"nucleo": "rugby", "category": "Outros", "title": "Fita", "supplier": "Loja", "amount": "9.90"}
    )
    assert r.status_code == 201, r.text
    rows = await outbox(mw)
    # Só o tesoureiro do núcleo (é quem decide agora)
    assert [r["endpoint"] for r in rows] == [dev_n["endpoint"]]
    assert rows[0]["payload"]["notification"]["body"].startswith("[PEDIDO DE GASTO] Fita")

    # Aviso manual da comunicação para um tema
    editor = await mw.login("editor@serradofc.pt", "editor2026")
    r = await editor.post(
        "/api/v1/admin/push/broadcast",
        json={"topic": "noticias", "title": "Treino cancelado", "body": "Hoje não há treino de rugby.", "url": "/agenda"},
    )
    assert r.status_code == 200 and r.json() == {"devices": 1}
    assert (await t.post("/api/v1/admin/push/broadcast", json={"topic": "noticias", "title": "Olá", "body": "Teste", "url": "/"})).status_code == 403
    stats = (await editor.get("/api/v1/admin/push/stats")).json()
    assert stats["devices"] == 2 and stats["topics"]["gastos"] == 2


async def test_mensalidade_nova_avisa_o_encarregado(mw, clean):
    socio = await mw.login("socio@exemplo.pt", "serrado1978")  # encarregado dos atletas de demonstração
    _, dev = device()
    await socio.post("/api/v1/push/subscribe", json={"subscription": dev, "topics": ["pagamentos"]})
    await execute(mw.pool, "delete from push_outbox")
    t = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    await t.put("/api/v1/admin/fee-plans/futsal", json={"amount": 25, "active": True})
    month = date.today().replace(day=1) + timedelta(days=62)
    r = await t.post("/api/v1/admin/fees/generate", json={"month": month.strftime("%Y-%m")})
    assert r.status_code == 200, r.text
    rows = await outbox(mw)
    assert rows and all(r["endpoint"] == dev["endpoint"] for r in rows)
    assert "para pagar" in rows[0]["payload"]["notification"]["body"]
