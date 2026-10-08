"""
Entrada com Google / Microsoft (OpenID Connect): fluxo authorization code com PKCE (S256),
state e nonce. O id_token é validado aqui (assinatura pelas chaves públicas do fornecedor,
emissor, audiência, validade e nonce) antes de se perguntar ao backend de quem é a conta.
"""

import base64
import hashlib
import hmac
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import jwt

from ..config import config

ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"]


class OAuthError(Exception):
    pass


@dataclass
class ExternalIdentity:
    """Identidade devolvida por um fornecedor, já validada."""

    subject: str
    email: str | None
    email_verified: bool


@dataclass
class OAuthStart:
    url: str
    state: str
    nonce: str
    verifier: str


@dataclass
class Checks:
    state: str
    nonce: str
    verifier: str


class OAuthProvider(Protocol):
    id: str
    name: str

    async def start(self) -> OAuthStart: ...

    async def finish(self, callback_url: str, checks: Checks) -> ExternalIdentity: ...


@dataclass(frozen=True)
class ProviderDef:
    name: str
    issuer: str
    # Se o email do token é de confiança para ligar à conta do clube
    email_verified: Callable[[dict[str, Any]], bool]


PROVIDERS: dict[str, ProviderDef] = {
    "google": ProviderDef("Google", "https://accounts.google.com", lambda c: c.get("email_verified") is True),
    # Só contas pessoais (Outlook, Hotmail, Live): a Microsoft verifica o email destas contas.
    # As contas de empresa (Entra ID) ficam de fora, porque o email delas é definido pelo
    # administrador da empresa e não é verificado (falha conhecida como «nOAuth»).
    "microsoft": ProviderDef(
        "Microsoft", "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0", lambda c: isinstance(c.get("email"), str)
    ),
}


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class OidcProvider:
    """Fornecedor OpenID Connect (descoberta, autorização, troca do código e validação do id_token)."""

    def __init__(
        self,
        id: str,
        name: str,
        *,
        issuer: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        email_verified: Callable[[dict[str, Any]], bool],
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.id = id
        self.name = name
        self.issuer = issuer
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.email_verified = email_verified
        self.http = httpx.AsyncClient(transport=transport, timeout=10.0, follow_redirects=False)
        self._meta: dict[str, Any] | None = None
        self._jwks: dict[str, Any] | None = None

    def _check_url(self, url: str) -> str:
        # Só HTTPS; HTTP apenas fora de produção (fornecedor falso local nos testes)
        if not url.startswith("https://") and (config.production or not url.startswith("http://")):
            raise OAuthError(f"endereço não seguro: {url}")
        return url

    async def _get_json(self, url: str) -> dict[str, Any]:
        res = await self.http.get(self._check_url(url), headers={"accept": "application/json"})
        res.raise_for_status()
        data = res.json()
        if not isinstance(data, dict):
            raise OAuthError("resposta inválida")
        return data

    async def metadata(self) -> dict[str, Any]:
        """Descoberta (.well-known/openid-configuration) feita uma vez; repete se falhar."""
        if self._meta is None:
            meta = await self._get_json(self.issuer.rstrip("/") + "/.well-known/openid-configuration")
            if meta.get("issuer") != self.issuer:
                raise OAuthError("o emissor da descoberta não corresponde")
            for key in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
                self._check_url(str(meta.get(key, "")))
            self._meta = meta
        return self._meta

    async def start(self) -> OAuthStart:
        meta = await self.metadata()
        verifier = _b64url(secrets.token_bytes(32))
        state = _b64url(secrets.token_bytes(32))
        nonce = _b64url(secrets.token_bytes(32))
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": "openid email profile",
            "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()),
            "code_challenge_method": "S256",
            "state": state,
            "nonce": nonce,
            "prompt": "select_account",
        }
        return OAuthStart(url=f"{meta['authorization_endpoint']}?{urlencode(params)}", state=state, nonce=nonce, verifier=verifier)

    async def _signing_key(self, kid: str | None, refresh: bool = False) -> jwt.PyJWK:
        meta = await self.metadata()
        if self._jwks is None or refresh:
            self._jwks = await self._get_json(meta["jwks_uri"])
        keys = [k for k in self._jwks.get("keys", []) if isinstance(k, dict) and k.get("use", "sig") == "sig"]
        for k in keys:
            if kid is None or k.get("kid") == kid:
                return jwt.PyJWK.from_dict(k)
        if not refresh:
            return await self._signing_key(kid, refresh=True)  # chaves rodadas pelo fornecedor
        raise OAuthError("chave de assinatura desconhecida")

    async def finish(self, callback_url: str, checks: Checks) -> ExternalIdentity:
        meta = await self.metadata()
        params = {k: v[0] for k, v in parse_qs(urlsplit(callback_url).query).items()}
        if not hmac.compare_digest(params.get("state", ""), checks.state):
            raise OAuthError("state diferente do pedido")
        # RFC 9207: o fornecedor indica quem respondeu (evita misturar fornecedores)
        if "iss" in params and params["iss"] != self.issuer:
            raise OAuthError("emissor da resposta inesperado")
        if meta.get("authorization_response_iss_parameter_supported") and "iss" not in params:
            raise OAuthError("falta o emissor na resposta")
        code = params.get("code")
        if not code:
            raise OAuthError("falta o código de autorização")

        form = {"grant_type": "authorization_code", "code": code, "redirect_uri": self.redirect_uri, "code_verifier": checks.verifier}
        methods = meta.get("token_endpoint_auth_methods_supported") or ["client_secret_basic"]
        extra: dict[str, Any] = {}
        if "client_secret_post" in methods:
            form |= {"client_id": self.client_id, "client_secret": self.client_secret}
        else:
            extra["auth"] = httpx.BasicAuth(self.client_id, self.client_secret)
        res = await self.http.post(self._check_url(meta["token_endpoint"]), data=form, headers={"accept": "application/json"}, **extra)
        if res.status_code != 200:
            raise OAuthError(f"troca do código recusada ({res.status_code})")
        id_token = res.json().get("id_token")
        if not isinstance(id_token, str):
            raise OAuthError("resposta sem id_token")

        header = jwt.get_unverified_header(id_token)
        alg = header.get("alg")
        if alg not in ALGORITHMS:
            raise OAuthError(f"algoritmo não aceite: {alg}")
        key = await self._signing_key(header.get("kid"))
        claims: dict[str, Any] = jwt.decode(
            id_token,
            key=key.key,
            algorithms=[alg],
            audience=self.client_id,
            issuer=self.issuer,
            leeway=60,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
        if not hmac.compare_digest(str(claims.get("nonce", "")), checks.nonce):
            raise OAuthError("nonce diferente do pedido")
        aud = claims.get("aud")
        if isinstance(aud, list) and len(aud) > 1 and claims.get("azp") != self.client_id:
            raise OAuthError("azp inválido")
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise OAuthError("id_token sem «sub»")
        email = claims["email"].strip().lower() if isinstance(claims.get("email"), str) else None
        return ExternalIdentity(subject=subject, email=email, email_verified=bool(email) and self.email_verified(claims))


def callback_url(provider: str) -> str:
    return f"{config.oauth.public_url}/api/v1/auth/oauth/{provider}/callback"


def configured_providers() -> dict[str, OAuthProvider]:
    """Fornecedores configurados (com CLIENT_ID, CLIENT_SECRET e PUBLIC_URL)."""
    out: dict[str, OAuthProvider] = {}
    if not config.oauth.public_url:
        return out
    for pid, d in PROVIDERS.items():
        creds = getattr(config.oauth, pid)
        if creds.client_id and creds.client_secret:
            out[pid] = OidcProvider(
                pid,
                d.name,
                issuer=d.issuer,
                client_id=creds.client_id,
                client_secret=creds.client_secret,
                redirect_uri=callback_url(pid),
                email_verified=d.email_verified,
            )
    return out
