"""
Regras dos pagamentos: o que cada conta pode pagar, criação do pagamento no Stripe,
eventos do Stripe (pago, à espera do Multibanco, falhado, expirado), mensalidades
mensais e emissão das faturas-recibo no Moloni ON.

Os valores vêm sempre da base de dados (nunca do browser) e cada passo do recibo fica
registado antes do seguinte, para que uma nova tentativa nunca emita dois documentos.
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from ..backend.core import Actor, audit
from ..config import PaymentsConfig
from ..db.pool import Conn, Pool, Row, fetch, fetch_one
from ..validation import is_valid_nif
from ..web import HttpError
from .moloni import Line, MoloniClient, MoloniError
from .stripe import StripeClient, StripeError

log = logging.getLogger("serrado.payments")

MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
SPORTS = {
    "futsal": "Escola de Futsal",
    "rugby": "Escola de Rugby",
    "atletismo": "Atletismo",
    "formacao": "Formação",
    "escola-de-desporto": "Escola de Desporto",
}
METHOD_LABELS = {"card": "Cartão", "mb_way": "MB WAY", "multibanco": "Multibanco"}
# Para onde o Stripe devolve a pessoa (na Área de Atletas, já no separador dos pagamentos)
RETURN_PATHS = {"/area-socio": "/area-socio?", "/area-atletas": "/area-atletas?separador=recibos&"}
SYSTEM = Actor()

# Um item fica bloqueado enquanto houver um pagamento em curso (sessão aberta recente ou referência Multibanco por pagar)
BLOCKING = """exists (select 1 from payment_items pi join payments p on p.id = pi.payment_id
                       where pi.kind = %s and pi.item_id = {id}
                         and (p.status = 'paid' or (p.status = 'open' and (p.created_at > now() - interval '2 hours' or p.method is not null))))"""


def cents(amount: float | int) -> int:
    return int(round(float(amount) * 100))


def period_label(month: date) -> str:
    return f"{MONTHS[month.month - 1]} {month.year}"


def sport_label(slug: str) -> str:
    return SPORTS.get(slug, slug.replace("-", " ").capitalize())


# ------------------------------------------------------------------ mensalidades
async def generate_fees(db: Pool | Conn, month: date) -> int:
    """Cria a mensalidade do mês para cada atleta das modalidades com valor ativo (vence a dia 8). Repetir não duplica."""
    month = month.replace(day=1)
    rows = await fetch(
        db,
        """insert into athlete_fees (athlete_id, sport_slug, month, period, amount, due_date)
           select a.id, a.sport_slug, %s::date, %s, f.amount, (%s::date + interval '7 days')::date
             from athletes a join fee_plans f on f.sport_slug = a.sport_slug and f.active
           on conflict (athlete_id, sport_slug, month) do nothing
           returning id""",
        [month.isoformat(), period_label(month), month.isoformat()],
    )
    return len(rows)


# ------------------------------------------------------------------ o que a conta pode pagar
async def charges(db: Pool, user_id: str) -> dict[str, Any]:
    quotas = await fetch(
        db,
        f"""select q.id, q.period, q.amount, q.due_date as "dueDate", m.member_number as "memberNumber",
                  case when q.due_date < current_date then 'Em atraso' else 'Pendente' end as status,
                  {BLOCKING.format(id="q.id")} as "inProgress"
             from quotas q join members m on m.member_number = q.member_number
            where m.user_id = %s and q.paid_at is null
            order by q.due_date""",
        ["quota", user_id],
    )
    fees = await fetch(
        db,
        f"""select f.id, f.athlete_id as "athleteId", a.name as "athleteName", f.sport_slug as sport, f.period, f.amount, f.due_date as "dueDate",
                  case when f.due_date < current_date then 'Em atraso' else 'Pendente' end as status,
                  {BLOCKING.format(id="f.id")} as "inProgress"
             from athlete_fees f join athletes a on a.id = f.athlete_id
            where f.paid_at is null and f.athlete_id in (select athlete_id from athlete_access where user_id = %s)
            order by f.due_date, a.name""",
        ["fee", user_id],
    )
    for f in fees:
        f["sportLabel"] = sport_label(f["sport"])
    payments = await fetch(
        db,
        """select p.id, p.created_at as "createdAt", p.paid_at as "paidAt", p.amount, p.status, p.method, p.receipt_number as "receiptNumber",
                  p.receipt_status as "receiptStatus", (p.receipt_pdf is not null) as "hasReceipt",
                  coalesce((select json_agg(i.description order by i.kind, i.item_id) from payment_items i where i.payment_id = p.id), '[]') as items
             from payments p where p.user_id = %s and (p.status <> 'expired') order by p.created_at desc limit 30""",
        [user_id],
    )
    for p in payments:
        p["methodLabel"] = METHOD_LABELS.get(p["method"] or "", None)
    nif = await fetch_one(
        db,
        """select a.tax_number from athlete_access aa join athletes a on a.id = aa.athlete_id
            where aa.user_id = %s and a.tax_number is not null order by (aa.role = 'atleta') desc limit 1""",
        [user_id],
    )
    return {"quotas": quotas, "fees": fees, "payments": payments, "suggestedNif": nif["tax_number"] if nif else None}


@dataclass
class Item:
    kind: str
    item_id: int
    amount: float
    description: str
    sport: str | None = None


async def _load_items(c: Conn, user_id: str, items: list[tuple[str, int]]) -> list[Item]:
    out: list[Item] = []
    for kind, item_id in items:
        if kind == "quota":
            cur = await c.execute(
                f"""select q.id, q.amount, q.period, q.member_number, {BLOCKING.format(id="q.id")} as blocked
                      from quotas q join members m on m.member_number = q.member_number
                     where q.id = %s and m.user_id = %s and q.paid_at is null for update of q""",
                ["quota", item_id, user_id],
            )
            row = await cur.fetchone()
            if row:
                out.append(Item("quota", row["id"], row["amount"], f"Quota {row['period']} — sócio n.º {row['member_number']}", None))
        else:
            cur = await c.execute(
                f"""select f.id, f.amount, f.period, f.sport_slug, a.name, {BLOCKING.format(id="f.id")} as blocked
                      from athlete_fees f join athletes a on a.id = f.athlete_id
                     where f.id = %s and f.paid_at is null
                       and f.athlete_id in (select athlete_id from athlete_access where user_id = %s) for update of f""",
                ["fee", item_id, user_id],
            )
            row = await cur.fetchone()
            if row:
                out.append(
                    Item(
                        "fee",
                        row["id"],
                        row["amount"],
                        f"Mensalidade {sport_label(row['sport_slug'])} {row['period']} — {row['name']}",
                        row["sport_slug"],
                    )
                )
        if not row or row["blocked"]:
            raise HttpError(409, "not_payable", "Um dos valores já foi pago, está a ser pago ou não pertence a esta conta. Atualiza a página.")
    return out


async def create_payment(
    pool: Pool, stripe: StripeClient, cfg: PaymentsConfig, *, user_id: str, items: list[tuple[str, int]], nif: str, site_url: str, return_path: str
) -> str:
    """Cria o pagamento e a sessão do Stripe Checkout; devolve o endereço para onde o browser vai."""
    if not cfg.enabled:
        raise HttpError(503, "payments_disabled", "Os pagamentos online ainda não estão disponíveis")
    if not is_valid_nif(nif):
        raise HttpError(400, "invalid_nif", "NIF inválido")
    back = RETURN_PATHS.get(return_path, RETURN_PATHS["/area-socio"])
    if len(set(items)) != len(items):
        raise HttpError(400, "validation", "items: repetidos")
    user = await fetch_one(pool, "select name, email from users where id = %s and not disabled", [user_id])
    if not user:
        raise HttpError(401, "unauthenticated", "Sessão necessária")
    async with pool.connection() as c:
        loaded = await _load_items(c, user_id, items)
        total = round(sum(float(i.amount) for i in loaded), 2)
        cur = await c.execute(
            "insert into payments (user_id, amount, payer_name, payer_email, payer_nif) values (%s, %s, %s, %s, %s) returning id",
            [user_id, total, user["name"], user["email"], nif],
        )
        payment = await cur.fetchone()
        assert payment is not None
        payment_id = str(payment["id"])
        for i in loaded:
            await c.execute(
                "insert into payment_items (payment_id, kind, item_id, amount, description, sport_slug) values (%s, %s, %s, %s, %s, %s)",
                [payment_id, i.kind, i.item_id, i.amount, i.description, i.sport],
            )
        await audit(c, Actor(id=user_id), "payments.create", "payments", payment_id, {"items": len(loaded), "amount": total})
    try:
        session = await stripe.create_checkout_session(
            payment_id=payment_id,
            lines=[(i.description, cents(i.amount)) for i in loaded],
            email=user["email"],
            success_url=f"{site_url}{back}pagamento=ok",
            cancel_url=f"{site_url}{back}pagamento=cancelado",
            expires_at=int(time.time()) + 3600,
        )
    except StripeError as e:
        log.error("stripe: sessão recusada: %s", e)
        await fetch(pool, "update payments set status = 'expired' where id = %s", [payment_id])
        raise HttpError(502, "payment_provider", "O serviço de pagamentos não respondeu. Tenta outra vez daqui a pouco.") from None
    await fetch(pool, "update payments set stripe_session_id = %s where id = %s", [session["id"], payment_id])
    return str(session["url"])


# ------------------------------------------------------------------ eventos do Stripe
async def _mark_paid(c: Conn, cfg: PaymentsConfig, payment: Row, payment_intent: str | None, method: str | None) -> None:
    await c.execute(
        """update payments set status = 'paid', paid_at = now(), stripe_payment_intent = coalesce(%s, stripe_payment_intent),
             method = coalesce(%s, method), receipt_status = %s where id = %s""",
        [payment_intent, method, "pending" if cfg.receipts_enabled else "none", payment["id"]],
    )
    label = METHOD_LABELS.get(method or payment.get("method") or "", "Online")
    await c.execute(
        "update quotas set paid_at = current_date, payment_method = %s where id in (select item_id from payment_items where payment_id = %s and kind = 'quota')",
        [label, payment["id"]],
    )
    await c.execute(
        "update athlete_fees set paid_at = current_date, payment_method = %s where id in (select item_id from payment_items where payment_id = %s and kind = 'fee')",
        [label, payment["id"]],
    )
    await audit(c, SYSTEM, "payments.paid", "payments", str(payment["id"]), {"amount": payment["amount"], "method": method})


async def handle_event(pool: Pool, stripe: StripeClient | None, cfg: PaymentsConfig, event: dict[str, Any]) -> str:
    """Aplica um evento do Stripe (idempotente: o mesmo evento duas vezes não muda nada)."""
    kind = str(event.get("type", ""))
    obj = (event.get("data") or {}).get("object") or {}
    if not kind.startswith("checkout.session.") or obj.get("object") != "checkout.session":
        return "ignorado"
    payment_id = (obj.get("metadata") or {}).get("payment_id") or obj.get("client_reference_id")
    if not payment_id:
        return "sem pagamento"
    async with pool.connection() as c:
        cur = await c.execute("select * from payments where id::text = %s for update", [str(payment_id)])
        payment = await cur.fetchone()
        if not payment or payment["stripe_session_id"] != obj.get("id"):
            return "desconhecido"
        if obj.get("currency") != "eur" or obj.get("amount_total") != cents(payment["amount"]):
            log.error("stripe: valor diferente no pagamento %s", payment_id)
            await audit(c, SYSTEM, "payments.mismatch", "payments", str(payment_id), {"amount_total": obj.get("amount_total")})
            return "valor diferente"
        if payment["status"] != "open":
            return "já tratado"
        pi = obj.get("payment_intent") if isinstance(obj.get("payment_intent"), str) else None
        method = None
        if pi and stripe and kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            try:
                method = await stripe.payment_method_type(pi)
            except StripeError as e:
                log.warning("stripe: método do pagamento %s desconhecido: %s", payment_id, e)
        if kind == "checkout.session.async_payment_succeeded" or (kind == "checkout.session.completed" and obj.get("payment_status") == "paid"):
            await _mark_paid(c, cfg, payment, pi, method)
            return "pago"
        if kind == "checkout.session.completed":
            # Multibanco: referência gerada, à espera do pagamento (os itens ficam bloqueados)
            await c.execute("update payments set method = %s, stripe_payment_intent = %s where id = %s", [method or "multibanco", pi, payment["id"]])
            return "à espera"
        if kind in ("checkout.session.async_payment_failed", "checkout.session.expired"):
            status = "failed" if kind.endswith("failed") else "expired"
            await c.execute("update payments set status = %s where id = %s", [status, payment["id"]])
            await audit(c, SYSTEM, f"payments.{status}", "payments", str(payment["id"]), {})
            return status
    return "ignorado"


# ------------------------------------------------------------------ recibos (Moloni ON)
@dataclass
class ReceiptSummary:
    issued: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


async def _issue_one(pool: Pool, cfg: PaymentsConfig, moloni: MoloniClient, p: Row) -> None:
    pid = p["id"]
    if not p["moloni_customer_id"]:
        customer = await moloni.customer_for(vat=p["payer_nif"], name=p["payer_name"], email=p["payer_email"])
        await fetch(pool, "update payments set moloni_customer_id = %s where id = %s", [customer, pid])
        p["moloni_customer_id"] = customer
    if not p["moloni_document_id"]:
        items = await fetch(
            pool, "select kind, item_id, amount, description, sport_slug from payment_items where payment_id = %s order by kind, item_id", [pid]
        )
        lines = []
        for i in items:
            product = cfg.moloni_products.get("quota" if i["kind"] == "quota" else (i["sport_slug"] or "")) or cfg.moloni_products.get(i["kind"])
            if not product:
                raise MoloniError(f"sem artigo do Moloni para «{i['sport_slug'] or i['kind']}» (MOLONI_PRODUCTS)")
            lines.append(Line(product_id=product, description=i["description"], price=float(i["amount"])))
        doc = await moloni.create_invoice_receipt(
            customer_id=p["moloni_customer_id"],
            lines=lines,
            payment_method_id=cfg.moloni_payment_methods.get(p["method"] or ""),
            date=str(p["paid_at"]),
            reference=f"Stripe {str(pid)[:8]}",
        )
        # Registado logo: uma nova tentativa nunca cria um segundo documento
        async with pool.connection() as c:
            await c.execute("update payments set moloni_document_id = %s, receipt_number = %s where id = %s", [doc.document_id, doc.number, pid])
            await c.execute(
                "update quotas set receipt_number = %s where id in (select item_id from payment_items where payment_id = %s and kind = 'quota')",
                [doc.number, pid],
            )
            await c.execute(
                "update athlete_fees set receipt_number = %s where id in (select item_id from payment_items where payment_id = %s and kind = 'fee')",
                [doc.number, pid],
            )
            await audit(c, SYSTEM, "payments.receipt", "payments", str(pid), {"number": doc.number})
        p["moloni_document_id"] = doc.document_id
    if not p["receipt_emailed_at"]:
        await moloni.send_mail(p["moloni_document_id"], name=p["payer_name"], email=p["payer_email"])
        await fetch(pool, "update payments set receipt_emailed_at = now() where id = %s", [pid])
    if not p["has_pdf"]:
        _filename, pdf = await moloni.pdf(p["moloni_document_id"])
        await fetch(pool, "update payments set receipt_pdf = %s where id = %s", [pdf, pid])
    await fetch(pool, "update payments set receipt_status = 'issued', receipt_error = null where id = %s", [pid])


async def issue_receipts(pool: Pool, cfg: PaymentsConfig, moloni: MoloniClient, limit: int = 20) -> ReceiptSummary:
    """Emite as faturas-recibo em falta (com novas tentativas espaçadas: 10, 20, 30… minutos, até 6)."""
    summary = ReceiptSummary()
    if not cfg.receipts_enabled:
        return summary
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(7301979) as ok")).fetchone()
        if not got or not got["ok"]:
            return summary
        try:
            todo = await fetch(
                pool,
                """select id, payer_name, payer_email, payer_nif, method, paid_at, moloni_customer_id, moloni_document_id, receipt_emailed_at,
                          (receipt_pdf is not null) as has_pdf, receipt_attempts
                     from payments
                    where status = 'paid' and (receipt_status = 'pending'
                       or (receipt_status = 'failed' and receipt_attempts < 6 and receipt_tried_at < now() - receipt_attempts * interval '10 minutes'))
                    order by paid_at limit %s""",
                [limit],
            )
            for p in todo:
                try:
                    await _issue_one(pool, cfg, moloni, p)
                    summary.issued += 1
                except Exception as e:  # qualquer falha fica registada e é tentada mais tarde
                    summary.failed += 1
                    summary.errors.append(f"{str(p['id'])[:8]}: {e}")
                    log.warning("moloni: recibo do pagamento %s falhou: %s", p["id"], e)
                    await fetch(
                        pool,
                        """update payments set receipt_status = 'failed', receipt_attempts = receipt_attempts + 1, receipt_tried_at = now(),
                             receipt_error = %s where id = %s""",
                        [str(e)[:500], p["id"]],
                    )
        finally:
            await lock.execute("select pg_advisory_unlock(7301979)")
    return summary


__all__ = ["charges", "create_payment", "generate_fees", "handle_event", "issue_receipts", "period_label"]
