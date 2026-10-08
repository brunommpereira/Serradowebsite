"""Cliente mínimo da API do Stripe (Checkout Sessions, PaymentIntents) e verificação dos webhooks."""

import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import PaymentsConfig

API = "https://api.stripe.com/v1"


class StripeError(Exception):
    pass


class StripeClient:
    def __init__(self, cfg: PaymentsConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.cfg = cfg
        self.http = httpx.AsyncClient(
            transport=transport,
            timeout=20.0,
            headers={"authorization": f"Bearer {cfg.stripe_secret_key}", "stripe-version": cfg.stripe_api_version},
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        data: list[tuple[str, str]] | None = None,
        params: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        headers = {"idempotency-key": idempotency_key} if idempotency_key else {}
        content = None
        if data is not None:
            # Formulário com chaves repetidas (payment_method_types[]) e aninhadas, como a API do Stripe espera
            content = urlencode(data).encode()
            headers["content-type"] = "application/x-www-form-urlencoded"
        try:
            res = await self.http.request(method, API + path, content=content, params=params, headers=headers)
        except httpx.HTTPError as e:
            raise StripeError(f"sem ligação ao Stripe ({type(e).__name__})") from None
        body = res.json() if res.content else {}
        if res.status_code >= 400:
            err = body.get("error", {}) if isinstance(body, dict) else {}
            raise StripeError(f"{res.status_code} {err.get('type', 'erro')}: {err.get('message', 'pedido recusado')}")
        return body  # type: ignore[no-any-return]

    async def create_checkout_session(
        self, *, payment_id: str, lines: list[tuple[str, int]], email: str, success_url: str, cancel_url: str, expires_at: int
    ) -> dict[str, Any]:
        """Sessão do Stripe Checkout com os valores (em cêntimos) vindos da base de dados."""
        data: list[tuple[str, str]] = [
            ("mode", "payment"),
            ("locale", "pt"),
            ("customer_email", email),
            ("client_reference_id", payment_id),
            ("metadata[payment_id]", payment_id),
            ("payment_intent_data[metadata][payment_id]", payment_id),
            ("payment_intent_data[description]", "Serrado FC — " + ", ".join(name for name, _ in lines)[:300]),
            ("success_url", success_url),
            ("cancel_url", cancel_url),
            ("expires_at", str(expires_at)),
        ]
        for m in self.cfg.methods:
            data.append(("payment_method_types[]", m))
        for i, (name, cents) in enumerate(lines):
            data += [
                (f"line_items[{i}][quantity]", "1"),
                (f"line_items[{i}][price_data][currency]", "eur"),
                (f"line_items[{i}][price_data][unit_amount]", str(cents)),
                (f"line_items[{i}][price_data][product_data][name]", name[:250]),
            ]
        return await self._request("POST", "/checkout/sessions", data=data, idempotency_key=f"checkout-{payment_id}")

    async def payment_method_type(self, payment_intent_id: str) -> str | None:
        """Método usado (card, mb_way, multibanco), lido da última cobrança do PaymentIntent."""
        pi = await self._request("GET", f"/payment_intents/{payment_intent_id}", params={"expand[]": "latest_charge"})
        charge = pi.get("latest_charge")
        details = charge.get("payment_method_details", {}) if isinstance(charge, dict) else {}
        kind = details.get("type")
        return str(kind) if kind else None


def verify_webhook(payload: bytes, signature_header: str, secret: str, tolerance: int = 300, now: float | None = None) -> dict[str, Any]:
    """
    Confirma que o evento veio do Stripe: HMAC-SHA256 de «{t}.{corpo}» com o segredo do webhook,
    numa janela de 5 minutos (evita repetições de eventos antigos). Devolve o evento.
    """
    items = [part.split("=", 1) for part in signature_header.split(",") if "=" in part]
    timestamps = [v for k, v in items if k.strip() == "t"]
    signatures = [v for k, v in items if k.strip() == "v1"]
    if not timestamps or not signatures or not timestamps[0].isdigit():
        raise StripeError("assinatura em falta")
    t = int(timestamps[0])
    if abs((now or time.time()) - t) > tolerance:
        raise StripeError("assinatura fora do prazo")
    expected = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s.strip()) for s in signatures):
        raise StripeError("assinatura inválida")
    event = json.loads(payload)
    if not isinstance(event, dict):
        raise StripeError("evento inválido")
    return event


def sign_webhook(payload: bytes, secret: str, timestamp: int | None = None) -> str:
    """Cabeçalho Stripe-Signature para um corpo (usado nos testes e em ferramentas locais)."""
    t = int(timestamp if timestamp is not None else time.time())
    sig = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"
