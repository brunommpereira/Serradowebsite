"""
Pagamentos online, de ponta a ponta: middleware → backend → Stripe falso (Checkout, webhooks
assinados) → Moloni ON falso (cliente, fatura-recibo, email, PDF).
"""

import json
import time
import urllib.parse
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from serrado.backend.app import build_backend
from serrado.config import PaymentsConfig, config
from serrado.db.pool import Pool, execute, fetch, fetch_one
from serrado.middleware.app import build_middleware
from serrado.middleware.backend_client import BackendClient
from serrado.payments.moloni import MoloniClient
from serrado.payments.service import issue_receipts
from serrado.payments.stripe import StripeClient, sign_webhook
from tests.conftest import XHR, Middleware, fresh_database

WHSEC = "whsec_test_segredo"
PDF = b"%PDF-1.7 recibo de teste"
CFG = PaymentsConfig(
    stripe_secret_key="sk_test_123",
    stripe_webhook_secret=WHSEC,
    stripe_api_version="2025-10-29.clover",
    methods=["card", "mb_way", "multibanco"],
    moloni_api_key="apik:abc:def",
    moloni_company_id=5,
    moloni_document_set_id=9,
    moloni_products={"quota": 101, "futsal": 202},
    moloni_payment_methods={"card": 1, "mb_way": 2, "multibanco": 3},
    moloni_country_id=1,
    moloni_language_id=1,
)


class FakeStripe:
    def __init__(self) -> None:
        self.sessions: list[dict[str, Any]] = []
        self.method = "mb_way"

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer sk_test_123"
        if request.method == "POST" and request.url.path == "/v1/checkout/sessions":
            form = urllib.parse.parse_qsl(request.content.decode())
            sid = f"cs_test_{len(self.sessions) + 1}"
            self.sessions.append({"id": sid, "form": form, "idempotency": request.headers.get("idempotency-key")})
            return httpx.Response(200, json={"id": sid, "object": "checkout.session", "url": f"https://checkout.stripe.com/c/pay/{sid}"})
        if request.method == "GET" and request.url.path.startswith("/v1/payment_intents/"):
            return httpx.Response(200, json={"id": "pi_1", "latest_charge": {"payment_method_details": {"type": self.method}}})
        return httpx.Response(404, json={"error": {"type": "invalid_request_error", "message": "no"}})


class FakeMoloni:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail_mail_once = False
        self.token_tries = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "media.test":
            assert request.url.params["jwt"] == "tok"
            return httpx.Response(200, content=PDF)
        assert request.headers["authorization"] == "Bearer apik:abc:def"
        body = json.loads(request.content)
        q, v = body["query"], body["variables"]
        op = next(
            name
            for name in (
                "customerCreate",
                "customers",
                "invoiceReceiptCreate",
                "invoiceReceiptSendMail",
                "invoiceReceiptGetPDFToken",
                "invoiceReceiptGetPDF",
            )
            if name + "(" in q
        )
        self.calls.append((op, v))
        if op == "customers":
            return httpx.Response(200, json={"data": {"customers": {"errors": [], "data": []}}})
        if op == "customerCreate":
            return httpx.Response(200, json={"data": {"customerCreate": {"errors": [], "data": {"customerId": 77}}}})
        if op == "invoiceReceiptCreate":
            return httpx.Response(
                200, json={"data": {"invoiceReceiptCreate": {"errors": [], "data": {"documentId": 1234, "number": 12, "documentSetName": "FR 2026"}}}}
            )
        if op == "invoiceReceiptSendMail":
            if self.fail_mail_once:
                self.fail_mail_once = False
                return httpx.Response(200, json={"errors": [{"message": "Serviço de email indisponível"}]})
            return httpx.Response(200, json={"data": {"invoiceReceiptSendMail": True}})
        if op == "invoiceReceiptGetPDF":
            return httpx.Response(200, json={"data": {"invoiceReceiptGetPDF": True}})
        self.token_tries += 1
        if self.token_tries == 1:  # o PDF ainda está a ser gerado
            return httpx.Response(200, json={"data": {"invoiceReceiptGetPDFToken": {"errors": [{"field": "pdf", "msg": "not ready"}], "data": None}}})
        return httpx.Response(
            200,
            json={
                "data": {"invoiceReceiptGetPDFToken": {"errors": [], "data": {"token": "tok", "path": "/privateassets/x.pdf", "filename": "FR.pdf"}}}
            },
        )


STRIPE = FakeStripe()
MOLONI = FakeMoloni()


@pytest.fixture(scope="module")
async def env() -> AsyncIterator[tuple[Middleware, Pool]]:
    old = config.payments
    config.payments = CFG
    config.oauth.site_url = "https://site.test"
    pool = await fresh_database("payments")
    backend = build_backend(pool)
    backend.state.stripe = StripeClient(CFG, transport=httpx.MockTransport(STRIPE.handler))
    mw = build_middleware(backend_client=BackendClient(transport=httpx.ASGITransport(app=backend), base_url="http://backend"))
    yield Middleware(mw, pool), pool
    config.payments = old
    await pool.close()


def moloni() -> MoloniClient:
    return MoloniClient(CFG, transport=httpx.MockTransport(MOLONI.handler), media_url="https://media.test")


async def webhook(m: Middleware, event: dict[str, Any], *, secret: str = WHSEC, timestamp: int | None = None) -> httpx.Response:
    raw = json.dumps(event).encode()
    return await m.client().post("/api/v1/payments/stripe/webhook", content=raw, headers={"stripe-signature": sign_webhook(raw, secret, timestamp)})


def session_event(kind: str, payment: dict[str, Any], **obj: Any) -> dict[str, Any]:
    base = {
        "id": payment["stripe_session_id"],
        "object": "checkout.session",
        "metadata": {"payment_id": str(payment["id"])},
        "currency": "eur",
        "amount_total": int(round(float(payment["amount"]) * 100)),
        "payment_intent": "pi_1",
        "payment_status": "paid",
    }
    return {"id": f"evt_{time.time_ns()}", "type": kind, "data": {"object": {**base, **obj}}}


async def last_payment(pool: Pool) -> dict[str, Any]:
    row = await fetch_one(pool, "select * from payments order by created_at desc limit 1")
    assert row
    return row


async def test_mensalidades_por_modalidade_e_o_que_cada_conta_pode_pagar(env):
    m, pool = env
    sec = await m.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await sec.put("/api/v1/admin/fee-plans/futsal", json={"amount": 25, "active": True})).status_code == 200
    gen = await sec.post("/api/v1/admin/fees/generate", json={"month": "2026-11"})
    assert gen.json() == {"month": "2026-11", "created": 1, "quotas": 0}  # só o Tomás joga futsal; sem planos de quota
    assert (await sec.post("/api/v1/admin/fees/generate", json={"month": "2026-11"})).json()["created"] == 0, "não duplica"
    fees = (await sec.get("/api/v1/admin/fees?month=2026-11")).json()
    assert [(f["athleteName"], f["amount"], f["dueDate"], f["period"]) for f in fees] == [("Tomás Exemplo", 25, "2026-11-08", "Novembro 2026")]

    socio = await m.login("socio@exemplo.pt", "serrado1978")
    c = (await socio.get("/api/v1/me/charges")).json()
    assert c["enabled"] is True
    assert [q["period"] for q in c["quotas"]] == ["Novembro 2026"]
    assert [(f["athleteName"], f["sportLabel"]) for f in c["fees"]] == [("Tomás Exemplo", "Escola de Futsal")]
    assert c["suggestedNif"] == "258369140"
    joao = await m.login("joao@exemplo.pt", "atleta2026")
    assert (await joao.get("/api/v1/me/charges")).json()["fees"] == []
    editor = await m.login("editor@serradofc.pt", "editor2026")
    assert (await editor.put("/api/v1/admin/fee-plans/rugby", json={"amount": 20})).status_code == 403


async def test_pagar_cria_sessao_no_stripe_com_valores_da_base_de_dados(env):
    m, pool = env
    socio = await m.login("socio@exemplo.pt", "serrado1978")
    c = (await socio.get("/api/v1/me/charges")).json()
    quota, fee = c["quotas"][0], c["fees"][0]
    items = [{"kind": "quota", "id": quota["id"]}, {"kind": "fee", "id": fee["id"]}]

    assert (await socio.post("/api/v1/me/payments", json={"items": items, "nif": "123456788"})).json()["error"] == "invalid_nif"
    anon = m.client()
    anon.cookies = socio.cookies
    sem_csrf = await anon.post("/api/v1/me/payments", json={"items": items, "nif": "258369140"})
    assert sem_csrf.status_code == 403
    joao = await m.login("joao@exemplo.pt", "atleta2026")
    assert (await joao.post("/api/v1/me/payments", json={"items": items, "nif": "214365875"})).status_code == 409, "não paga o que não é seu"

    r = await socio.post("/api/v1/me/payments", json={"items": items, "nif": "258369140", "returnPath": "/area-atletas", "amount": 1})
    assert r.status_code == 400, "campos extra (como um valor vindo do browser) são recusados"
    r = await socio.post("/api/v1/me/payments", json={"items": items, "nif": "258369140", "returnPath": "/area-atletas"})
    assert r.status_code == 201, r.text
    assert r.json()["url"] == f"https://checkout.stripe.com/c/pay/{STRIPE.sessions[-1]['id']}"
    form = STRIPE.sessions[-1]["form"]
    values = dict(form)
    assert [v for k, v in form if k == "payment_method_types[]"] == ["card", "mb_way", "multibanco"]
    amounts = sorted(int(v) for k, v in form if k.endswith("[unit_amount]"))
    assert amounts == [2000, 2500], "quota 20 € + mensalidade 25 €, da base de dados"
    assert values["customer_email"] == "socio@exemplo.pt" and values["mode"] == "payment" and values["locale"] == "pt"
    assert values["success_url"] == "https://site.test/area-atletas?separador=recibos&pagamento=ok"
    payment = await last_payment(pool)
    assert STRIPE.sessions[-1]["idempotency"] == f"checkout-{payment['id']}"
    assert (payment["amount"], payment["payer_nif"], payment["status"]) == (45, "258369140", "open")

    again = await socio.post("/api/v1/me/payments", json={"items": items[:1], "nif": "258369140"})
    assert again.status_code == 409, "um item a ser pago não entra noutro pagamento"
    assert all(x["inProgress"] for x in (await socio.get("/api/v1/me/charges")).json()["quotas"])


async def test_webhook_so_aceita_eventos_assinados_e_recentes(env):
    m, pool = env
    p = await last_payment(pool)
    ev = session_event("checkout.session.completed", p)
    assert (await webhook(m, ev, secret="whsec_outro")).status_code == 400
    assert (await webhook(m, ev, timestamp=int(time.time()) - 3600)).status_code == 400
    raw = json.dumps(ev).encode()
    adulterado = await m.client().post(
        "/api/v1/payments/stripe/webhook", content=raw.replace(b'"paid"', b'"PAID"'), headers={"stripe-signature": sign_webhook(raw, WHSEC)}
    )
    assert adulterado.status_code == 400
    assert (await last_payment(pool))["status"] == "open"


async def test_valor_diferente_nao_marca_como_pago(env):
    m, pool = env
    p = await last_payment(pool)
    r = await webhook(m, session_event("checkout.session.completed", p, amount_total=100))
    assert r.json() == {"result": "valor diferente"}
    assert (await last_payment(pool))["status"] == "open"


async def test_pagamento_mb_way_marca_quota_e_mensalidade_como_pagas(env):
    m, pool = env
    p = await last_payment(pool)
    r = await webhook(m, session_event("checkout.session.completed", p))
    assert r.json() == {"result": "pago"}
    p = await last_payment(pool)
    assert (p["status"], p["method"], p["receipt_status"]) == ("paid", "mb_way", "pending")
    quota = await fetch_one(pool, "select paid_at is not null as paid, payment_method from quotas where period = 'Novembro 2026'")
    assert quota == {"paid": True, "payment_method": "MB WAY"}
    assert (await fetch_one(pool, "select payment_method from athlete_fees"))["payment_method"] == "MB WAY"  # type: ignore[index]
    assert (await webhook(m, session_event("checkout.session.completed", p))).json() == {"result": "já tratado"}, (
        "o mesmo evento duas vezes não muda nada"
    )


async def test_recibo_no_moloni_email_e_pdf_no_site(env):
    m, pool = env
    s = await issue_receipts(pool, CFG, moloni())
    assert (s.issued, s.errors) == (1, [])
    ops = [op for op, _ in MOLONI.calls]
    assert ops == [
        "customers",
        "customerCreate",
        "invoiceReceiptCreate",
        "invoiceReceiptSendMail",
        "invoiceReceiptGetPDF",
        "invoiceReceiptGetPDFToken",
        "invoiceReceiptGetPDFToken",
    ]
    created = dict(MOLONI.calls)["customerCreate"]["data"]
    assert (created["vat"], created["email"], created["name"]) == ("258369140", "socio@exemplo.pt", "Sócio Demonstração")
    doc = dict(MOLONI.calls)["invoiceReceiptCreate"]
    assert doc["companyId"] == 5
    data = doc["data"]
    assert (data["documentSetId"], data["customerId"], data["status"]) == (9, 77, 1)
    assert sorted((x["productId"], x["price"]) for x in data["products"]) == [(101, 20.0), (202, 25.0)]
    assert data["payments"][0]["paymentMethodId"] == 2 and data["payments"][0]["value"] == 45.0
    mail = dict(MOLONI.calls)["invoiceReceiptSendMail"]
    assert mail["documents"] == [1234] and mail["mailData"]["to"]["email"] == "socio@exemplo.pt" and mail["mailData"]["attachment"] is True

    p = await last_payment(pool)
    assert (p["receipt_status"], p["receipt_number"], p["moloni_document_id"], bytes(p["receipt_pdf"])) == ("issued", "FR 2026/12", 1234, PDF)
    assert (await fetch_one(pool, "select receipt_number from quotas where period = 'Novembro 2026'")) == {"receipt_number": "FR 2026/12"}

    socio = await m.login("socio@exemplo.pt", "serrado1978")
    hist = (await socio.get("/api/v1/me/charges")).json()["payments"]
    assert (hist[0]["receiptNumber"], hist[0]["hasReceipt"], hist[0]["methodLabel"]) == ("FR 2026/12", True, "MB WAY")
    pdf = await socio.get(f"/api/v1/me/payments/{p['id']}/receipt")
    assert pdf.status_code == 200 and pdf.content == PDF
    assert pdf.headers["content-type"] == "application/pdf" and "attachment" in pdf.headers["content-disposition"]
    assert "no-store" in pdf.headers["cache-control"]
    joao = await m.login("joao@exemplo.pt", "atleta2026")
    assert (await joao.get(f"/api/v1/me/payments/{p['id']}/receipt")).status_code == 404
    sec = await m.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await sec.get(f"/api/v1/admin/payments/{p['id']}/receipt")).content == PDF
    assert (await issue_receipts(pool, CFG, moloni())).issued == 0, "nada mais por emitir"


async def test_multibanco_fica_a_espera_e_so_depois_fica_pago(env):
    m, pool = env
    await execute(pool, "insert into quotas (member_number, period, amount, due_date) values ('00482', 'Dezembro 2026', 20, '2026-12-08')")
    socio = await m.login("socio@exemplo.pt", "serrado1978")
    quota = next(q for q in (await socio.get("/api/v1/me/charges")).json()["quotas"] if q["period"] == "Dezembro 2026")
    assert (await socio.post("/api/v1/me/payments", json={"items": [{"kind": "quota", "id": quota["id"]}], "nif": "258369140"})).status_code == 201
    p = await last_payment(pool)
    STRIPE.method = "multibanco"
    assert (await webhook(m, session_event("checkout.session.completed", p, payment_status="unpaid"))).json() == {"result": "à espera"}
    await execute(pool, "update payments set created_at = now() - interval '3 days' where id = %s", [p["id"]])
    assert (await socio.post("/api/v1/me/payments", json={"items": [{"kind": "quota", "id": quota["id"]}], "nif": "258369140"})).status_code == 409, (
        "com uma referência Multibanco por pagar, o item continua bloqueado"
    )
    assert (await webhook(m, session_event("checkout.session.async_payment_succeeded", p))).json() == {"result": "pago"}
    assert (await fetch_one(pool, "select method from payments where id = %s", [p["id"]])) == {"method": "multibanco"}
    assert (await fetch_one(pool, "select payment_method from quotas where id = %s", [quota["id"]])) == {"payment_method": "Multibanco"}


async def test_sessao_expirada_ou_falhada_liberta_os_itens(env):
    m, pool = env
    await execute(pool, "insert into quotas (member_number, period, amount, due_date) values ('00482', 'Janeiro 2027', 20, '2027-01-08')")
    socio = await m.login("socio@exemplo.pt", "serrado1978")
    quota = next(q for q in (await socio.get("/api/v1/me/charges")).json()["quotas"] if q["period"] == "Janeiro 2027")
    body = {"items": [{"kind": "quota", "id": quota["id"]}], "nif": "258369140"}
    assert (await socio.post("/api/v1/me/payments", json=body)).status_code == 201
    p = await last_payment(pool)
    assert (await webhook(m, session_event("checkout.session.expired", p, payment_status="unpaid"))).json() == {"result": "expired"}
    assert (await socio.post("/api/v1/me/payments", json=body)).status_code == 201, "depois de expirar, pode pagar-se outra vez"
    p2 = await last_payment(pool)
    assert (await webhook(m, session_event("checkout.session.async_payment_failed", p2))).json() == {"result": "failed"}
    assert (await fetch_one(pool, "select paid_at from quotas where id = %s", [quota["id"]])) == {"paid_at": None}


async def test_falha_a_meio_do_recibo_nunca_emite_dois_documentos(env):
    m, pool = env
    # Pagamento de dezembro (Multibanco) ficou pago: falha o email na primeira tentativa
    MOLONI.calls.clear()
    MOLONI.token_tries = 0
    MOLONI.fail_mail_once = True
    s = await issue_receipts(pool, CFG, moloni())
    assert s.failed == 1 and "email" in s.errors[0]
    p = await fetch_one(pool, "select * from payments where receipt_status = 'failed'")
    assert p and p["moloni_document_id"] == 1234 and p["receipt_attempts"] == 1 and p["receipt_emailed_at"] is None
    sec = await m.login("tesouraria@serradofc.pt", "tesouraria2026")
    listing = (await sec.get("/api/v1/admin/payments?status=paid")).json()
    assert any(x["receiptStatus"] == "failed" and "email" in x["receiptError"] for x in listing)
    assert (await sec.post(f"/api/v1/admin/payments/{p['id']}/retry-receipt")).json()["receiptStatus"] == "pending"
    s = await issue_receipts(pool, CFG, moloni())
    assert (s.issued, s.errors) == (1, [])
    ops = [op for op, _ in MOLONI.calls]
    assert ops.count("invoiceReceiptCreate") == 1, "a nova tentativa continua de onde parou"
    assert dict(MOLONI.calls)["invoiceReceiptCreate"]["data"]["payments"][0]["paymentMethodId"] == 3
    assert (await fetch_one(pool, "select receipt_status from payments where id = %s", [p["id"]])) == {"receipt_status": "issued"}
    audit = await fetch(pool, "select action from audit_log where entity = 'payments' order by id")
    assert {"payments.create", "payments.paid", "payments.receipt", "payments.receipt_retry"} <= {a["action"] for a in audit}


async def test_sem_stripe_configurado_os_pagamentos_ficam_desligados(env):
    m, _pool = env
    config.payments = PaymentsConfig(**{**CFG.__dict__, "stripe_secret_key": "", "stripe_webhook_secret": ""})
    try:
        socio = await m.login("socio@exemplo.pt", "serrado1978")
        assert (await socio.get("/api/v1/me/charges")).json()["enabled"] is False
        r = await socio.post("/api/v1/me/payments", json={"items": [{"kind": "quota", "id": 1}], "nif": "258369140"})
        assert r.status_code == 503
        assert XHR  # (o cliente de login já envia o cabeçalho CSRF)
    finally:
        config.payments = CFG
