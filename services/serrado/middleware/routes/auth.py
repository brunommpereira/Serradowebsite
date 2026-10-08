"""Sessão: entrar (password ou Google/Microsoft) e sair. O token vai só num cookie httpOnly."""

import base64
import hashlib
import hmac
import json
import re
from typing import Annotated, Any
from urllib.parse import urlencode, urljoin, urlsplit

from fastapi import APIRouter, Path, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from ...config import config
from ...web import error, log
from ..backend_client import BackendError
from ..oauth import Checks, OAuthProvider, callback_url
from ..session import SESSION_COOKIE, sign_session

OAUTH_COOKIE = "sfc_oauth"  # temporário (10 min): state, nonce e PKCE da entrada com Google/Microsoft
OAUTH_PATH = "/api/v1/auth/oauth"
_SAFE_RETURN = re.compile(r"^/(?![/\\])[^\s\\]*$")


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


def _secure() -> bool:
    return config.production or config.session_same_site == "none"


def start_session(resp: Response, profile: dict[str, Any]) -> None:
    token = sign_session(profile["id"], profile["name"], profile.get("roles", []))
    # O token só vai no cookie httpOnly: nunca fica acessível ao JavaScript da página
    resp.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(config.session_hours * 3600),
        path="/",
        httponly=True,
        secure=_secure(),
        samesite=config.session_same_site.capitalize(),  # type: ignore[arg-type]
    )


# ---------- cookie assinado (HMAC-SHA256 com uma chave derivada do JWT_SECRET) ----------
def _cookie_key() -> bytes:
    return hmac.new(config.jwt_secret.encode(), b"sfc-oauth-cookie", hashlib.sha256).digest()


def sign_value(data: dict[str, str]) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode()).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(hmac.new(_cookie_key(), raw.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{raw}.{sig}"


def unsign_value(value: str | None) -> dict[str, str] | None:
    if not value or "." not in value:
        return None
    raw, sig = value.rsplit(".", 1)
    expected = base64.urlsafe_b64encode(hmac.new(_cookie_key(), raw.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    except ValueError:
        return None
    if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ("p", "s", "n", "v", "r")):
        return None
    return data


def safe_return(path: str | None) -> str:
    """Destino depois de entrar: só caminhos internos do site (nunca outro domínio)."""
    return path if path and _SAFE_RETURN.match(path) else "/entrar"


def back_to_site(path: str, err: str | None = None) -> RedirectResponse:
    """Volta ao site: /entrar com o resultado, ou o destino pedido. Só caminhos do próprio site."""
    site = config.oauth.site_url + "/"
    url = urljoin(site, path)
    if urlsplit(url).netloc != urlsplit(site).netloc or urlsplit(url).scheme != urlsplit(site).scheme:
        url = urljoin(site, "/entrar")
    if err:
        url += ("&" if "?" in url else "?") + urlencode({"erro": err})
    return RedirectResponse(url, status_code=303)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Sessão"]

    @r.post("/auth/login", tags=tags, summary="Entrar (email ou n.º de sócio). Define o cookie de sessão httpOnly.")
    async def login(req: Request, body: Credentials, resp: Response) -> Any:
        profile = await req.app.state.backend.call("POST", "/auth/verify", body=body.model_dump())
        start_session(resp, profile)
        return profile

    @r.post("/auth/logout", tags=tags, summary="Terminar sessão")
    async def logout(resp: Response) -> dict[str, bool]:
        resp.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=_secure(), samesite=config.session_same_site.capitalize())  # type: ignore[arg-type]
        return {"ok": True}

    # ---------- Entrar com Google / Microsoft (OpenID Connect) ----------

    @r.get("/auth/providers", tags=tags, summary="Fornecedores de entrada ativos (Google, Microsoft…)")
    async def providers(req: Request) -> list[dict[str, str]]:
        return [{"id": p.id, "name": p.name} for p in req.app.state.oauth.values()]

    ProviderId = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,32}$")]

    @r.get("/auth/oauth/{provider}", tags=tags, summary="Começar a entrada com um fornecedor externo (redireciona para o fornecedor)")
    async def oauth_start(req: Request, provider: ProviderId, voltar: Annotated[str | None, Query(max_length=200)] = None) -> Response:
        p: OAuthProvider | None = req.app.state.oauth.get(provider)
        if not p:
            return error(404, "not_found", "Fornecedor de entrada não disponível")
        back = safe_return(voltar)
        try:
            start = await p.start()
        except Exception:
            log.warning("oauth: descoberta falhou (%s)", p.id, exc_info=True)
            return back_to_site("/entrar", "indisponivel")
        resp = RedirectResponse(start.url, status_code=303)
        # SameSite=Lax: o cookie tem de acompanhar o regresso do fornecedor (navegação vinda de outro site)
        resp.set_cookie(
            OAUTH_COOKIE,
            sign_value({"p": p.id, "s": start.state, "n": start.nonce, "v": start.verifier, "r": back}),
            max_age=600,
            path=OAUTH_PATH,
            httponly=True,
            secure=_secure(),
            samesite="lax",
        )
        return resp

    @r.get("/auth/oauth/{provider}/callback", tags=tags, summary="Regresso do fornecedor: valida e inicia a sessão")
    async def oauth_callback(req: Request, provider: ProviderId) -> Response:
        pending = unsign_value(req.cookies.get(OAUTH_COOKIE))
        p: OAuthProvider | None = req.app.state.oauth.get(provider)

        def done(resp: Response) -> Response:
            resp.delete_cookie(OAUTH_COOKIE, path=OAUTH_PATH, httponly=True, secure=_secure(), samesite="lax")
            return resp

        if not p or not pending or pending["p"] != provider:
            return done(back_to_site("/entrar", "expirou"))
        query = req.url.query
        if "error" in req.query_params:
            return done(back_to_site("/entrar", "cancelado"))  # a pessoa cancelou no fornecedor
        try:
            identity = await p.finish(
                callback_url(provider) + ("?" + query if query else ""), Checks(state=pending["s"], nonce=pending["n"], verifier=pending["v"])
            )
        except Exception:
            log.warning("oauth: validação falhou (%s)", provider, exc_info=True)
            return done(back_to_site("/entrar", "falhou"))
        try:
            profile = await req.app.state.backend.call(
                "POST",
                "/auth/oauth",
                body={"provider": provider, "subject": identity.subject, "email": identity.email, "emailVerified": identity.email_verified},
            )
        except BackendError as e:
            if e.status == 403:
                return done(back_to_site("/entrar", "sem-conta"))
            if e.status == 409:
                return done(back_to_site("/entrar", "outra-conta"))
            log.error("oauth: erro ao iniciar sessão (%s): %s", provider, e.status)
            return done(back_to_site("/entrar", "falhou"))
        resp = back_to_site(pending["r"])
        start_session(resp, profile)
        return done(resp)
