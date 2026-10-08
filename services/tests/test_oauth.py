"""
Entrada com Google/Microsoft, de ponta a ponta: middleware real contra um fornecedor
OpenID Connect falso (em memória) que assina id_tokens RS256 e confirma o PKCE.
"""

import base64
import hashlib
import json
import secrets
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from serrado.config import config
from serrado.db.pool import execute, fetch_one
from serrado.middleware.oauth import OidcProvider, callback_url
from serrado.middleware.routes.auth import sign_value
from tests.conftest import XHR, Middleware, build_stack, fresh_database

CLIENT_ID = "serrado-test"
CLIENT_SECRET = "segredo-de-teste"
SITE = "https://site.test"
ISSUER = "https://idp.test"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KID = "k1"


class FakeIdp:
    """Fornecedor OIDC falso: descoberta, chaves públicas e troca do código (com PKCE)."""

    def __init__(self) -> None:
        self.codes: dict[str, dict[str, Any]] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/.well-known/openid-configuration":
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/authorize",
                    "token_endpoint": f"{ISSUER}/token",
                    "jwks_uri": f"{ISSUER}/jwks",
                    "response_types_supported": ["code"],
                    "subject_types_supported": ["public"],
                    "id_token_signing_alg_values_supported": ["RS256"],
                    "code_challenge_methods_supported": ["S256"],
                    "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
                },
            )
        if path == "/jwks":
            jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key()))
            return httpx.Response(200, json={"keys": [{**jwk, "kid": KID, "alg": "RS256", "use": "sig"}]})
        if path == "/token" and request.method == "POST":
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            if form.get("client_id") != CLIENT_ID or form.get("client_secret") != CLIENT_SECRET:
                return httpx.Response(401, json={"error": "invalid_client"})
            pending = self.codes.pop(form.get("code", ""), None)
            if not pending:
                return httpx.Response(400, json={"error": "invalid_grant"})
            if form.get("redirect_uri") != pending["redirect_uri"]:
                return httpx.Response(400, json={"error": "invalid_grant", "error_description": "redirect_uri"})
            challenge = base64.urlsafe_b64encode(hashlib.sha256(form.get("code_verifier", "").encode()).digest()).rstrip(b"=").decode()
            if challenge != pending["challenge"]:
                return httpx.Response(400, json={"error": "invalid_grant", "error_description": "pkce"})
            now = int(__import__("time").time())
            claims = {"iss": ISSUER, "aud": CLIENT_ID, "iat": now, "exp": now + 300, "nonce": pending["nonce"], **pending["claims"]}
            token = jwt.encode(claims, pending.get("key", KEY), algorithm="RS256", headers={"kid": KID})
            return httpx.Response(200, json={"access_token": "at", "token_type": "Bearer", "expires_in": 300, "id_token": token})
        return httpx.Response(404, json={})


IDP = FakeIdp()


@pytest.fixture(scope="module")
async def mw() -> AsyncIterator[Middleware]:
    config.oauth.public_url = SITE
    config.oauth.site_url = SITE
    pool = await fresh_database("oauth")
    google = OidcProvider(
        "google",
        "Google",
        issuer=ISSUER,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=callback_url("google"),
        email_verified=lambda c: c.get("email_verified") is True,
        transport=httpx.MockTransport(IDP.handler),
    )
    yield Middleware(build_stack(pool, oauth={"google": google}), pool)
    await pool.close()


async def start(mw: Middleware, voltar: str | None = None) -> dict[str, Any]:
    """Começa a entrada; devolve o cookie temporário e os parâmetros enviados ao fornecedor."""
    c = mw.client()
    r = await c.get("/api/v1/auth/oauth/google" + (f"?{urlencode({'voltar': voltar})}" if voltar else ""))
    assert r.status_code == 303, r.text
    to = urlsplit(r.headers["location"])
    params = {k: v[0] for k, v in parse_qs(to.query).items()}
    return {"client": c, "to": to, "params": params, "set_cookie": "; ".join(r.headers.get_list("set-cookie")), "cookie": c.cookies.get("sfc_oauth")}


async def finish(mw: Middleware, s: dict[str, Any], claims: dict[str, Any], *, cookie: str | None = None, state: str | None = None) -> dict[str, Any]:
    """O fornecedor autentica a pessoa (com estas claims) e manda-a de volta ao callback."""
    code = secrets.token_urlsafe(16)
    IDP.codes[code] = {
        "nonce": s["params"]["nonce"],
        "challenge": s["params"]["code_challenge"],
        "redirect_uri": s["params"]["redirect_uri"],
        "claims": claims,
    }
    qs = urlencode({"code": code, "state": state or s["params"]["state"], "iss": ISSUER})
    c = mw.client()
    r = await c.get(f"/api/v1/auth/oauth/google/callback?{qs}", headers={"cookie": f"sfc_oauth={cookie if cookie is not None else s['cookie']}"})
    assert r.status_code == 303, r.text
    session = c.cookies.get("sfc_session")
    return {"location": r.headers["location"], "session": session, "set_cookie": "; ".join(r.headers.get_list("set-cookie"))}


async def me(mw: Middleware, session: str) -> httpx.Response:
    return await mw.client().get("/api/v1/me", headers={"cookie": f"sfc_session={session}"})


async def test_lista_os_fornecedores_ativos(mw):
    assert (await mw.client().get("/api/v1/auth/providers")).json() == [{"id": "google", "name": "Google"}]


async def test_redireciona_com_pkce_state_nonce_e_cookie_assinado(mw):
    s = await start(mw)
    p = s["params"]
    assert f"{s['to'].scheme}://{s['to'].netloc}{s['to'].path}" == f"{ISSUER}/authorize"
    assert p["client_id"] == CLIENT_ID
    assert p["redirect_uri"] == f"{SITE}/api/v1/auth/oauth/google/callback"
    assert p["code_challenge_method"] == "S256"
    assert p["scope"] == "openid email profile"
    assert p["state"] and p["nonce"]
    cookie = s["set_cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie.replace("Lax", "lax") and "Path=/api/v1/auth/oauth" in cookie and "Max-Age=600" in cookie
    assert p["state"] not in s["cookie"], "o conteúdo do cookie não é legível diretamente"
    assert "." in s["cookie"]


async def test_primeira_entrada_liga_a_conta_google_a_conta_do_clube(mw):
    s = await start(mw, "/area-socio/quotas")
    r = await finish(mw, s, {"sub": "g-socio", "email": "Socio@Exemplo.pt", "email_verified": True})
    assert r["location"] == f"{SITE}/area-socio/quotas"
    assert r["session"]
    assert "HttpOnly" in r["set_cookie"] and "SameSite=Strict" in r["set_cookie"]
    assert (await me(mw, r["session"])).json()["member"]["memberNumber"] == "00482"
    ids = (await mw.client().get("/api/v1/me/identities", headers={"cookie": f"sfc_session={r['session']}"})).json()
    assert [(i["provider"], i["email"]) for i in ids] == [("google", "socio@exemplo.pt")]


async def test_entradas_seguintes_pela_conta_google_mesmo_que_o_email_mude(mw):
    r = await finish(mw, await start(mw), {"sub": "g-socio", "email": "outro@gmail.com", "email_verified": True})
    assert r["location"] == f"{SITE}/entrar"
    assert (await me(mw, r["session"])).json()["email"] == "socio@exemplo.pt"


async def test_email_nao_verificado_ou_sem_conta_no_clube_sem_sessao(mw):
    a = await finish(mw, await start(mw), {"sub": "g-x1", "email": "joao@exemplo.pt", "email_verified": False})
    assert a["location"] == f"{SITE}/entrar?erro=sem-conta"
    assert a["session"] is None
    b = await finish(mw, await start(mw), {"sub": "g-x2", "email": "desconhecido@gmail.com", "email_verified": True})
    assert b["location"] == f"{SITE}/entrar?erro=sem-conta"
    assert b["session"] is None
    assert (await fetch_one(mw.pool, "select count(*)::int as n from users where email = 'desconhecido@gmail.com'")) == {"n": 0}


async def test_outra_conta_google_com_o_email_de_uma_conta_ja_ligada_recusa(mw):
    r = await finish(mw, await start(mw), {"sub": "g-intruso", "email": "socio@exemplo.pt", "email_verified": True})
    assert r["location"] == f"{SITE}/entrar?erro=outra-conta"
    assert r["session"] is None


async def test_state_errado_cookie_em_falta_ou_adulterado_sem_sessao(mw):
    claims = {"sub": "g-socio", "email": "socio@exemplo.pt", "email_verified": True}
    assert (await finish(mw, await start(mw), claims, state="outro"))["location"] == f"{SITE}/entrar?erro=falhou"
    assert (await finish(mw, await start(mw), claims, cookie=""))["location"] == f"{SITE}/entrar?erro=expirou"
    forged = sign_value({"p": "google", "s": "a", "n": "b", "v": "c", "r": "/"})[:-4] + "AAAA"
    r = await finish(mw, await start(mw), claims, cookie=forged)
    assert r["location"] == f"{SITE}/entrar?erro=expirou"
    assert r["session"] is None


async def test_nonce_diferente_do_pedido_sem_sessao(mw):
    r = await finish(mw, await start(mw), {"sub": "g-socio", "nonce": "outro-nonce"})
    assert r["location"] == f"{SITE}/entrar?erro=falhou"
    assert r["session"] is None


async def test_id_token_assinado_por_outra_chave_sem_sessao(mw):
    s = await start(mw)
    code = secrets.token_urlsafe(16)
    IDP.codes[code] = {
        "nonce": s["params"]["nonce"], "challenge": s["params"]["code_challenge"], "redirect_uri": s["params"]["redirect_uri"],
        "claims": {"sub": "g-socio"}, "key": rsa.generate_private_key(public_exponent=65537, key_size=2048),
    }  # fmt: skip
    c = mw.client()
    r = await c.get(
        f"/api/v1/auth/oauth/google/callback?{urlencode({'code': code, 'state': s['params']['state']})}",
        headers={"cookie": f"sfc_oauth={s['cookie']}"},
    )
    assert r.headers["location"] == f"{SITE}/entrar?erro=falhou"
    assert c.cookies.get("sfc_session") is None


async def test_destino_so_dentro_do_site(mw):
    for evil in ("//evil.example", "https://evil.example", "/\\evil.example"):
        r = await finish(mw, await start(mw, evil), {"sub": "g-socio", "email": "socio@exemplo.pt", "email_verified": True})
        assert r["location"] == f"{SITE}/entrar", evil


async def test_a_pessoa_cancela_no_fornecedor(mw):
    s = await start(mw)
    r = await mw.client().get(
        f"/api/v1/auth/oauth/google/callback?error=access_denied&state={s['params']['state']}", headers={"cookie": f"sfc_oauth={s['cookie']}"}
    )
    assert r.headers["location"] == f"{SITE}/entrar?erro=cancelado"


async def test_fornecedor_desconhecido_404(mw):
    assert (await mw.client().get("/api/v1/auth/oauth/facebook")).status_code == 404


async def test_desligar_a_conta_google_e_conta_desativada_deixa_de_entrar(mw):
    r = await finish(mw, await start(mw), {"sub": "g-socio", "email": "socio@exemplo.pt", "email_verified": True})
    deleted = await mw.client().delete("/api/v1/me/identities/google", headers={"cookie": f"sfc_session={r['session']}", **XHR})
    assert deleted.status_code == 200, deleted.text
    assert await fetch_one(mw.pool, "select count(*)::int as n from user_identities where subject = 'g-socio'") == {"n": 0}

    # Volta a ligar e depois a conta do clube é desativada
    await finish(mw, await start(mw), {"sub": "g-joao", "email": "joao@exemplo.pt", "email_verified": True})
    await execute(mw.pool, "update users set disabled = true where email = 'joao@exemplo.pt'")
    off = await finish(mw, await start(mw), {"sub": "g-joao", "email": "joao@exemplo.pt", "email_verified": True})
    assert off["location"] == f"{SITE}/entrar?erro=sem-conta"
    assert off["session"] is None
