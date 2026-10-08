"""Pagamentos online (Stripe) e faturas-recibo (Moloni ON): API interna."""

import base64
import json
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from ...config import config
from ...db.pool import fetch, fetch_one, tx
from ...payments import service
from ...payments.stripe import StripeClient, StripeError, verify_webhook
from ..core import HttpError, actor, audit, not_found, pool, require_role, require_user

PaymentId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
Sport = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,40}$")]


class PayItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["quota", "fee"]
    id: int = Field(ge=1)


class PayBody(BaseModel):
    """Só se escolhe o QUE pagar; os valores vêm da base de dados."""

    model_config = ConfigDict(extra="forbid")
    items: Annotated[list[PayItem], Field(min_length=1, max_length=24)]
    nif: str = Field(pattern=r"^\d{9}$")
    returnPath: str = Field(default="/area-socio", max_length=40)


class WebhookBody(BaseModel):
    payload: str = Field(max_length=500_000)
    signature: str = Field(max_length=2000)


class FeePlan(BaseModel):
    amount: float = Field(gt=0, lt=1000)
    active: bool = True


class Generate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


def stripe_client(req: Request) -> StripeClient:
    client: StripeClient | None = getattr(req.app.state, "stripe", None)
    return client or StripeClient(config.payments)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Pagamentos"]
    office: list[str | Any] = ["Backoffice · Pagamentos"]

    @r.get("/charges", tags=tags, summary="O que a conta pode pagar (quotas e mensalidades) e os pagamentos feitos")
    async def charges(req: Request) -> dict[str, Any]:
        out = await service.charges(pool(req), require_user(req))
        return {"enabled": config.payments.enabled, **out}

    @r.post("/payments", tags=tags, summary="Começa um pagamento: devolve o endereço do Stripe Checkout", status_code=201)
    async def create(req: Request, body: PayBody) -> dict[str, str]:
        url = await service.create_payment(
            pool(req),
            stripe_client(req),
            config.payments,
            user_id=require_user(req),
            items=[(i.kind, i.id) for i in body.items],
            nif=body.nif,
            site_url=config.oauth.site_url,
            return_path=body.returnPath,
        )
        return {"url": url}

    @r.post("/payments/stripe-webhook", tags=tags, summary="Evento do Stripe (corpo original + assinatura), reencaminhado pelo middleware")
    async def webhook(req: Request, body: WebhookBody) -> dict[str, str]:
        if not config.payments.enabled:
            raise HttpError(503, "payments_disabled", "Pagamentos desligados")
        try:
            event = verify_webhook(body.payload.encode(), body.signature, config.payments.stripe_webhook_secret)
        except (StripeError, json.JSONDecodeError) as e:
            raise HttpError(400, "invalid_signature", str(e)) from None
        result = await service.handle_event(pool(req), stripe_client(req), config.payments, event)
        return {"result": result}

    @r.get("/payments/{id}/receipt", tags=tags, summary="PDF da fatura-recibo (quem pagou, a secretaria ou admin)")
    async def receipt(req: Request, id: PaymentId) -> dict[str, str]:
        row = await fetch_one(pool(req), "select user_id, receipt_number, receipt_pdf from payments where id = %s", [id])
        who = actor(req)
        if not row or not row["receipt_pdf"] or (row["user_id"] != who.id and not any(x in ("admin", "secretaria") for x in who.roles)):
            raise not_found("Recibo")
        name = f"recibo-{(row['receipt_number'] or id).replace('/', '-').replace(' ', '-')}.pdf"
        return {"filename": name, "data": base64.b64encode(row["receipt_pdf"]).decode()}

    # ------------------------------------------------------------- backoffice (secretaria)
    @r.get("/fee-plans", tags=office, summary="Valor mensal por modalidade")
    async def fee_plans(req: Request) -> list[dict[str, Any]]:
        require_role(req, "secretaria")
        return await fetch(pool(req), 'select sport_slug as "sport", amount, active, updated_at as "updatedAt" from fee_plans order by sport_slug')

    @r.put("/fee-plans/{sport}", tags=office, summary="Define o valor mensal de uma modalidade")
    async def set_fee_plan(req: Request, sport: Sport, body: FeePlan) -> dict[str, Any]:
        require_role(req, "secretaria")
        async with tx(pool(req)) as c:
            await c.execute(
                """insert into fee_plans (sport_slug, amount, active) values (%s, %s, %s)
                   on conflict (sport_slug) do update set amount = excluded.amount, active = excluded.active, updated_at = now()""",
                [sport, body.amount, body.active],
            )
            await audit(c, actor(req), "fees.plan", "fee_plans", sport, {"amount": body.amount, "active": body.active})
        return {"sport": sport, "amount": body.amount, "active": body.active}

    @r.post("/fees/generate", tags=office, summary="Gera as mensalidades de um mês (não duplica)")
    async def generate(req: Request, body: Generate) -> dict[str, Any]:
        require_role(req, "secretaria")
        month = date.fromisoformat(body.month + "-01")
        async with tx(pool(req)) as c:
            created = await service.generate_fees(c, month)
            await audit(c, actor(req), "fees.generate", "athlete_fees", None, {"month": body.month, "created": created})
        return {"month": body.month, "created": created}

    @r.get("/fees", tags=office, summary="Mensalidades de um mês")
    async def fees(req: Request, month: Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]) -> list[dict[str, Any]]:
        require_role(req, "secretaria")
        return await fetch(
            pool(req),
            """select f.id, a.name as "athleteName", a.code as "athleteCode", f.sport_slug as sport, f.period, f.amount, f.due_date as "dueDate",
                      f.paid_at as "paidAt", f.payment_method as "paymentMethod", f.receipt_number as "receiptNumber"
                 from athlete_fees f join athletes a on a.id = f.athlete_id where f.month = %s::date order by f.sport_slug, a.name""",
            [month + "-01"],
        )

    @r.get("/payments", tags=office, summary="Pagamentos online e estado dos recibos")
    async def payments(req: Request, status: Literal["open", "paid", "failed", "expired"] | None = None) -> list[dict[str, Any]]:
        require_role(req, "secretaria")
        return await fetch(
            pool(req),
            """select p.id, p.created_at as "createdAt", p.paid_at as "paidAt", p.amount, p.status, p.method, p.payer_name as "payerName",
                      p.payer_nif as "payerNif", p.receipt_number as "receiptNumber", p.receipt_status as "receiptStatus", p.receipt_error as "receiptError",
                      p.receipt_attempts as "receiptAttempts", (p.receipt_pdf is not null) as "hasReceipt",
                      coalesce((select json_agg(i.description order by i.kind, i.item_id) from payment_items i where i.payment_id = p.id), '[]') as items
                 from payments p where (%s::text is null or p.status = %s) order by p.created_at desc limit 200""",
            [status, status],
        )

    @r.post("/payments/{id}/retry-receipt", tags=office, summary="Volta a tentar emitir o recibo (continua de onde parou)")
    async def retry(req: Request, id: PaymentId) -> dict[str, Any]:
        require_role(req, "secretaria")
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "update payments set receipt_status = 'pending', receipt_attempts = 0, receipt_error = null where id = %s and status = 'paid' and receipt_status <> 'issued' returning id",
                [id],
            )
            if not await cur.fetchone():
                raise not_found("Pagamento com recibo por emitir")
            await audit(c, actor(req), "payments.receipt_retry", "payments", id, {})
        return {"id": id, "receiptStatus": "pending"}
