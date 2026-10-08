"""Configuração por variáveis de ambiente (com valores de desenvolvimento)."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

env = os.environ
PRODUCTION = env.get("NODE_ENV") == "production" or env.get("APP_ENV") == "production"


def required(name: str, dev_default: str, min_length: int = 0) -> str:
    value = env.get(name, "")
    if PRODUCTION:
        if not value:
            raise RuntimeError(f"Falta a variável de ambiente {name}")
        if len(value) < min_length:
            raise RuntimeError(f"{name} tem de ter pelo menos {min_length} caracteres")
    return value or dev_default


def _trust_proxy() -> str:
    """«true» em Docker/dev; no servidor, «loopback» (o Caddy, que já resolve o IP real, incluindo atrás da Cloudflare)."""
    return env.get("TRUST_PROXY", "true")


def _same_site() -> Literal["strict", "lax", "none"]:
    v = env.get("SESSION_SAMESITE", "")
    return v if v in ("strict", "lax", "none") else "strict"  # type: ignore[return-value]


def _read_version() -> str:
    """Versão instalada (ficheiro REVISION do artefacto de deploy); o deploy confirma que é esta que responde."""
    try:
        return (Path(__file__).resolve().parents[2] / "REVISION").read_text().strip() or "dev"
    except OSError:
        return "dev"


@dataclass
class OAuthCredentials:
    client_id: str
    client_secret: str


@dataclass
class OAuthConfig:
    """
    Entrada com Google / Microsoft (OpenID Connect). Cada fornecedor fica ativo quando tem
    CLIENT_ID e CLIENT_SECRET e há PUBLIC_URL (o endereço do site, onde corre a API em /api).
    """

    # Ex.: https://www.serradofc.pt — o endereço de retorno é {PUBLIC_URL}/api/v1/auth/oauth/{fornecedor}/callback
    public_url: str
    # Onde está o front, para onde a pessoa volta depois de entrar (omissão: PUBLIC_URL)
    site_url: str
    google: OAuthCredentials
    microsoft: OAuthCredentials


@dataclass
class Config:
    production: bool
    database_url: str
    # Segredo partilhado middleware → backend
    service_token: str
    # Segredo de assinatura das sessões (JWT)
    jwt_secret: str
    backend_url: str
    # Endereço onde os serviços escutam: 0.0.0.0 em Docker; 127.0.0.1 no servidor (só o Caddy lhes chega)
    host: str
    # Proxies em que o middleware confia para o IP do cliente (X-Forwarded-For)
    trust_proxy: str
    backend_port: int
    middleware_port: int
    # Origens do front autorizadas (CORS)
    cors_origins: list[str]
    session_hours: float
    # SameSite do cookie de sessão. «strict» (omissão): site e API no mesmo domínio (VPS).
    # Só com o site e a API em domínios diferentes é preciso «none» (e HTTPS).
    session_same_site: Literal["strict", "lax", "none"]
    # Pedidos por minuto e por IP em toda a API pública (o login e o carregamento de imagens têm limites próprios)
    rate_limit_max: int
    version: str
    oauth: OAuthConfig = field(repr=False)


config = Config(
    production=PRODUCTION,
    database_url=required("DATABASE_URL", "postgresql://serrado:serrado@localhost:5432/serrado"),
    service_token=required("SERVICE_TOKEN", "dev-service-token-change-me", 32),
    jwt_secret=required("JWT_SECRET", "dev-jwt-secret-change-me-please-32chars", 32),
    backend_url=env.get("BACKEND_URL", "http://localhost:4100"),
    host=env.get("HOST", "0.0.0.0"),  # noqa: S104 — em Docker escuta em todas as interfaces; no servidor é 127.0.0.1
    trust_proxy=_trust_proxy(),
    backend_port=int(env.get("BACKEND_PORT", "4100")),
    middleware_port=int(env.get("MIDDLEWARE_PORT", "4000")),
    cors_origins=[s.strip() for s in env.get("CORS_ORIGINS", "http://localhost:4200,https://brunommpereira.github.io").split(",")],
    session_hours=float(env.get("SESSION_HOURS", "8")),
    session_same_site=_same_site(),
    rate_limit_max=int(env.get("RATE_LIMIT_MAX", "300")),
    version=_read_version(),
    oauth=OAuthConfig(
        public_url=env.get("PUBLIC_URL", "").rstrip("/"),
        site_url=env.get("SITE_URL", env.get("PUBLIC_URL", "")).rstrip("/"),
        google=OAuthCredentials(env.get("GOOGLE_CLIENT_ID", ""), env.get("GOOGLE_CLIENT_SECRET", "")),
        microsoft=OAuthCredentials(env.get("MICROSOFT_CLIENT_ID", ""), env.get("MICROSOFT_CLIENT_SECRET", "")),
    ),
)

ROLES = ("admin", "editor", "secretaria", "treinador")
