"""Pedidos de gasto: pedido → tesoureiro do núcleo → tesoureiro da direção (pagamento), com emails e anexos."""

import base64

import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch, fetch_one

PDF = base64.b64encode(b"%PDF-1.4\n% fatura de teste\n%%EOF").decode()
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\0" * 32).decode()


def request(**extra: object) -> dict:
    return {
        "nucleo": "rugby",
        "category": "Material e equipamentos",
        "title": "Bolas de treino",
        "purpose": "10 bolas para os sub-16",
        "supplier": "Desportos Lda",
        "supplierNif": "509 999 990",
        "amount": "245.90",
        "paymentInfo": "PT50 0000 0000 0000 0000 0000 0",
        "files": [{"name": "fatura.pdf", "data": PDF}],
        **extra,
    }


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def outbox(mw) -> list[dict]:
    rows = await fetch(mw.pool, "select to_email, subject, attachments from email_outbox order by id")
    await execute(mw.pool, "delete from email_outbox")
    return rows


async def test_fluxo_completo_com_emails(mw, mail_on):
    await execute(mw.pool, "delete from email_outbox")
    direcao = await mw.login("diretor@serradofc.pt", "diretor2026")
    nucleo = await mw.login("nucleo@serradofc.pt", "nucleo2026")
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    presidente = await mw.login("presidente@serradofc.pt", "presidente2026")
    treinador = await mw.login("treinador@serradofc.pt", "treinador2026")

    # 1. Pedido (só quem tem expenses.request)
    assert (await treinador.post("/api/v1/admin/expenses", json=request())).status_code == 403
    r = await direcao.post("/api/v1/admin/expenses", json=request())
    assert r.status_code == 201, r.text
    eid, num = r.json()["id"], r.json()["number"]
    assert num.endswith("/001")
    mails = await outbox(mw)
    assert [m["to_email"] for m in mails] == ["nucleo@serradofc.pt"]
    assert mails[0]["subject"] == "[PEDIDO DE GASTO] Bolas de treino – 245,90 €"
    assert mails[0]["attachments"][0]["name"] == "fatura.pdf"

    # Na lista «à espera de mim» do tesoureiro do núcleo; quem pede não pode aprovar
    todo = (await nucleo.get("/api/v1/admin/expenses?scope=todo")).json()
    assert [(e["id"], e["actions"][:1]) for e in todo] == [(eid, ["nucleo"])]
    assert (await direcao.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True})).status_code == 403
    # A tesouraria não salta o 2.º passo (o núcleo tem tesoureiro)
    assert (
        await tesouraria.post(f"/api/v1/admin/expenses/{eid}/pay", json={"paidOn": "2026-01-02", "amount": "1", "method": "numerario"})
    ).status_code == 403
    # Treinador não vê o pedido
    assert (await treinador.get(f"/api/v1/admin/expenses/{eid}")).status_code in (403, 404)

    # 2. Tesoureiro do núcleo aprova um valor menor
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True, "amount": "300"})).status_code == 400
    r = await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True, "amount": "240.00", "note": "Sem portes"})
    assert r.status_code == 200, r.text
    mails = await outbox(mw)
    assert sorted(m["to_email"] for m in mails) == ["diretor@serradofc.pt", "tesouraria@serradofc.pt"]
    assert all(m["subject"] == "RE: [PEDIDO DE GASTO] Bolas de treino – APROVADO" for m in mails)
    # Não decide duas vezes
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True})).status_code == 403

    # 3. Tesoureiro da direção paga (com comprovativo e registo contabilístico)
    pay = {
        "paidOn": "2026-01-05",
        "amount": "240.00",
        "method": "transferencia",
        "accountCode": "62",
        "docNumber": "FT 2026/123",
        "proof": {"name": "comprovativo.png", "data": PNG},
    }
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/pay", json=pay)).status_code == 403
    r = await tesouraria.post(f"/api/v1/admin/expenses/{eid}/pay", json=pay)
    assert r.status_code == 200, r.text
    mails = await outbox(mw)
    # A quem pediu, com cópia ao Presidente
    assert sorted(m["to_email"] for m in mails) == ["diretor@serradofc.pt", "presidente@serradofc.pt"]
    assert mails[0]["subject"] == "[PAGO] Bolas de treino – 240,00 €"
    assert mails[0]["attachments"][0]["name"] == "comprovativo.png"

    detail = (await presidente.get(f"/api/v1/admin/expenses/{eid}")).json()
    assert detail["status"] == "pago" and detail["paidMethod"] == "transferencia" and detail["docNumber"] == "FT 2026/123"
    assert detail["nucleoByName"] == "Tesoureiro do Rugby" and detail["finalByName"] == "Tesouraria"
    assert [e["action"] for e in detail["events"]] == ["pedido", "aprovado_nucleo", "aprovado", "pago"]
    assert {f["kind"] for f in detail["files"]} == {"fatura", "comprovativo"}
    assert "invoice" not in detail["actions"]  # o Presidente só vê

    # Fatura-recibo final enviada por quem pediu → fica marcada como recebida
    r = await direcao.post(f"/api/v1/admin/expenses/{eid}/files", json={"kind": "recibo", "name": "recibo.pdf", "data": PDF})
    assert r.status_code == 201, r.text
    row = await fetch_one(mw.pool, "select invoice_received_at from expenses where id = %s", [eid])
    assert row and row["invoice_received_at"]

    # Descarregar um anexo (quem pode ver o pedido); outros não
    fid = next(f["id"] for f in detail["files"] if f["kind"] == "fatura")
    r = await direcao.get(f"/api/v1/admin/expenses/files/{fid}")
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["cache-control"] == "private, no-store"
    assert (await treinador.get(f"/api/v1/admin/expenses/files/{fid}")).status_code == 404


async def test_ninguem_aprova_o_proprio_pedido(mw, mail_on):
    await execute(mw.pool, "delete from email_outbox")
    nucleo = await mw.login("nucleo@serradofc.pt", "nucleo2026")
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    admin = await mw.login("admin@serradofc.pt", "admin2026")

    # O tesoureiro do Rugby pede para o Rugby: é o único do núcleo → o 2.º passo passa para a tesouraria
    r = await nucleo.post("/api/v1/admin/expenses", json=request(title="Fita adesiva", amount="12.5", files=[]))
    eid = r.json()["id"]
    mails = await outbox(mw)
    assert [m["to_email"] for m in mails] == ["tesouraria@serradofc.pt"]
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True})).status_code == 403
    assert (await tesouraria.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True})).status_code == 200
    # Quem fez o 2.º passo não faz o 3.º
    pay = {"paidOn": "2026-01-05", "amount": "12.50", "method": "numerario"}
    assert (await tesouraria.post(f"/api/v1/admin/expenses/{eid}/pay", json=pay)).status_code == 403
    assert (await tesouraria.post(f"/api/v1/admin/expenses/{eid}/final", json={"approve": True})).status_code == 403
    # Outra pessoa com expenses.pay (aqui o admin) faz a aprovação final e depois paga
    assert (await admin.post(f"/api/v1/admin/expenses/{eid}/final", json={"approve": True})).status_code == 200
    assert (await admin.post(f"/api/v1/admin/expenses/{eid}/pay", json=pay)).status_code == 200


async def test_rejeitar_e_anular(mw, mail_on):
    await execute(mw.pool, "delete from email_outbox")
    direcao = await mw.login("diretor@serradofc.pt", "diretor2026")
    nucleo = await mw.login("nucleo@serradofc.pt", "nucleo2026")

    eid = (await direcao.post("/api/v1/admin/expenses", json=request(files=[]))).json()["id"]
    await outbox(mw)
    # Rejeitar exige motivo
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": False})).status_code == 400
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": False, "note": "Já temos bolas"})).status_code == 200
    mails = await outbox(mw)
    assert [(m["to_email"], m["subject"]) for m in mails] == [("diretor@serradofc.pt", "RE: [PEDIDO DE GASTO] Bolas de treino – REJEITADO")]

    # Anular o próprio pedido antes da decisão
    eid2 = (await direcao.post("/api/v1/admin/expenses", json=request(files=[]))).json()["id"]
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid2}/cancel")).status_code == 403
    assert (await direcao.post(f"/api/v1/admin/expenses/{eid2}/cancel")).status_code == 200
    assert (await fetch_one(mw.pool, "select status from expenses where id = %s", [eid2]) or {})["status"] == "anulado"


async def test_validacoes_e_nucleos(mw):
    direcao = await mw.login("diretor@serradofc.pt", "diretor2026")
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    # Ficheiro que não é PDF/imagem, categoria desconhecida, valor negativo
    bad = base64.b64encode(b"MZ\x90\x00 executavel").decode()
    assert (await direcao.post("/api/v1/admin/expenses", json=request(files=[{"name": "x.exe", "data": bad}]))).status_code == 415
    assert (await direcao.post("/api/v1/admin/expenses", json=request(category="Festa"))).status_code == 400
    assert (await direcao.post("/api/v1/admin/expenses", json=request(amount="-5"))).status_code == 400

    # Núcleos: só a tesouraria (ou quem gere utilizadores) define os tesoureiros
    assert (await direcao.get("/api/v1/admin/expenses-approvers")).status_code == 403
    data = (await tesouraria.get("/api/v1/admin/expenses-approvers")).json()
    rugby = next(n for n in data["nucleos"] if n["key"] == "rugby")
    assert [a["email"] for a in rugby["approvers"]] == ["nucleo@serradofc.pt"]
    uid = next(c["id"] for c in data["candidates"] if c["email"] == "nucleo@serradofc.pt")
    assert (await tesouraria.put("/api/v1/admin/expenses-approvers/futsal", json={"userIds": [uid]})).status_code == 200
    meta = (await (await mw.login("nucleo@serradofc.pt", "nucleo2026")).get("/api/v1/admin/expenses/meta")).json()
    assert sorted(meta["myNucleos"]) == ["atletismo", "futsal", "rugby"]
