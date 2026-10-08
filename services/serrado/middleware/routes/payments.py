"""Pagamentos online: quotas e mensalidades (Stripe), recibos (Moloni ON) e o webhook do Stripe."""

import base64
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Path, Query, Request, Response

from ..deps import backend
from ..session import session, staff

PaymentId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
JsonObject = Annotated[dict[str, Any], Body()]


def _pdf(out: dict[str, str]) -> Response:
    return Response(
        content=base64.b64decode(out["data"]),
        media_type="application/pdf",
        headers={
            "content-disposition": f'attachment; filename="{out["filename"]}"',
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
        },
    )


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Pagamentos"]

    @r.get("/me/charges", tags=tags, summary="Quotas e mensalidades por pagar, e os pagamentos feitos (com recibo)")
    async def charges(req: Request) -> Any:
        s = await session(req)
        return await backend(req).call("GET", "/charges", actor=s)

    @r.post("/me/payments", tags=tags, summary="Pagar: devolve o endereço do Stripe Checkout (cartão, MB WAY ou Multibanco)", status_code=201)
    async def pay(req: Request, body: JsonObject) -> Any:
        s = await session(req)
        return await backend(req).call("POST", "/payments", actor=s, body=body)

    @r.get("/me/payments/{id}/receipt", tags=tags, summary="Fatura-recibo em PDF")
    async def receipt(req: Request, id: PaymentId) -> Response:
        s = await session(req)
        return _pdf(await backend(req).call("GET", f"/payments/{id}/receipt", actor=s))

    @r.post("/payments/stripe/webhook", tags=tags, summary="Webhook do Stripe (assinado; sem sessão)", include_in_schema=False)
    async def stripe_webhook(req: Request) -> Any:
        # O corpo vai tal como chegou: a assinatura é feita sobre os bytes originais
        payload = (await req.body()).decode("utf-8", errors="strict")
        return await backend(req).call(
            "POST", "/payments/stripe-webhook", body={"payload": payload, "signature": req.headers.get("stripe-signature", "")}
        )

    # ------------------------------------------------------------- backoffice (secretaria)
    office: list[str | Any] = ["Backoffice · Pagamentos"]

    @r.get("/admin/fee-plans", tags=office, summary="Valor mensal por modalidade")
    async def plans(req: Request) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("GET", "/fee-plans", actor=s)

    @r.put("/admin/fee-plans/{sport}", tags=office, summary="Definir o valor mensal de uma modalidade")
    async def set_plan(req: Request, sport: Annotated[str, Path(pattern=r"^[a-z0-9-]{1,40}$")], body: JsonObject) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("PUT", f"/fee-plans/{sport}", actor=s, body=body)

    @r.post("/admin/fees/generate", tags=office, summary="Gerar as mensalidades de um mês")
    async def generate(req: Request, body: JsonObject) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("POST", "/fees/generate", actor=s, body=body)

    @r.get("/admin/fees", tags=office, summary="Mensalidades de um mês")
    async def fees(req: Request, month: Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("GET", "/fees", actor=s, query={"month": month})

    @r.get("/admin/payments", tags=office, summary="Pagamentos online e recibos")
    async def payments(req: Request, status: Literal["open", "paid", "failed", "expired"] | None = None) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("GET", "/payments", actor=s, query={"status": status})

    @r.post("/admin/payments/{id}/retry-receipt", tags=office, summary="Voltar a tentar o recibo")
    async def retry(req: Request, id: PaymentId) -> Any:
        s = await staff(req, "secretaria")
        return await backend(req).call("POST", f"/payments/{id}/retry-receipt", actor=s)

    @r.get("/admin/payments/{id}/receipt", tags=office, summary="Fatura-recibo em PDF")
    async def admin_receipt(req: Request, id: PaymentId) -> Response:
        s = await staff(req, "secretaria")
        return _pdf(await backend(req).call("GET", f"/payments/{id}/receipt", actor=s))
