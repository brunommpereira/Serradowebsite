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
class FacebookConfig:
    """Página de Facebook do clube: publicações → notícias e eventos → eventos (serrado.facebook)."""

    page_id: str
    # Token de longa duração da PÁGINA (pages_read_engagement); só existe no servidor
    page_token: str
    graph_version: str
    # «publish»: entra logo no site; «draft»: fica em rascunho para a equipa rever
    mode: Literal["publish", "draft"]
    # Opcional: só importa publicações com esta hashtag (ex.: #site); vazio = todas
    tag: str


def _pairs(value: str) -> dict[str, int]:
    """«quota:12,futsal:34» → {"quota": 12, "futsal": 34} (ignora entradas mal formadas)."""
    out: dict[str, int] = {}
    for item in value.split(","):
        key, _, num = item.strip().partition(":")
        if key and num.strip().isdigit():
            out[key.strip()] = int(num)
    return out


@dataclass
class PaymentsConfig:
    """Pagamentos online (Stripe) e faturas-recibo (Moloni ON). Só ficam ativos com as chaves definidas."""

    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_api_version: str
    # Métodos no Stripe Checkout (cartão, MB WAY e Multibanco)
    methods: list[str]
    moloni_api_key: str
    moloni_company_id: int
    moloni_document_set_id: int
    # Artigo do Moloni por tipo: «quota» e uma entrada por modalidade das escolas (futsal, rugby…)
    moloni_products: dict[str, int]
    # Método de pagamento do Moloni para cada método do Stripe
    moloni_payment_methods: dict[str, int]
    moloni_country_id: int
    moloni_language_id: int

    @property
    def enabled(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)

    @property
    def receipts_enabled(self) -> bool:
        return bool(self.moloni_api_key and self.moloni_company_id and self.moloni_document_set_id)


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
    facebook: FacebookConfig = field(repr=False)
    payments: PaymentsConfig = field(repr=False)


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
    facebook=FacebookConfig(
        page_id=env.get("FACEBOOK_PAGE_ID", ""),
        page_token=env.get("FACEBOOK_PAGE_TOKEN", ""),
        graph_version=env.get("FACEBOOK_GRAPH_VERSION", "v25.0"),
        mode="draft" if env.get("FACEBOOK_SYNC_MODE") == "draft" else "publish",
        tag=env.get("FACEBOOK_SYNC_TAG", "").strip().lstrip("#").lower(),
    ),
    payments=PaymentsConfig(
        stripe_secret_key=env.get("STRIPE_SECRET_KEY", ""),
        stripe_webhook_secret=env.get("STRIPE_WEBHOOK_SECRET", ""),
        stripe_api_version=env.get("STRIPE_API_VERSION", "2025-10-29.clover"),
        methods=[m.strip() for m in env.get("PAYMENT_METHODS", "card,mb_way,multibanco").split(",") if m.strip()],
        moloni_api_key=env.get("MOLONI_API_KEY", ""),
        moloni_company_id=int(env.get("MOLONI_COMPANY_ID", "0") or 0),
        moloni_document_set_id=int(env.get("MOLONI_DOCUMENT_SET_ID", "0") or 0),
        moloni_products=_pairs(env.get("MOLONI_PRODUCTS", "")),
        moloni_payment_methods=_pairs(env.get("MOLONI_PAYMENT_METHODS", "")),
        moloni_country_id=int(env.get("MOLONI_COUNTRY_ID", "1") or 1),
        moloni_language_id=int(env.get("MOLONI_LANGUAGE_ID", "1") or 1),
    ),
)

ROLES = ("admin", "editor", "secretaria", "treinador")
