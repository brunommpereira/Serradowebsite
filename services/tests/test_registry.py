"""Sócios e atletas no backoffice (à mão e por ficheiro), quotas por categoria e pagamentos feitos na secretaria."""

from dataclasses import replace

import httpx
import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch, fetch_one
from serrado.payments.moloni import MoloniClient
from serrado.payments.service import issue_receipts
from tests.conftest import XHR
from tests.test_payments import CFG, PDF, FakeMoloni

SEC = ("secretaria@serradofc.pt", "secretaria2026")
TES = ("tesouraria@serradofc.pt", "tesouraria2026")


async def test_secretaria_cria_socio_com_numero_seguinte_e_conta_ligada(mw):
    sec = await mw.login(*SEC)
    r = await sec.post(
        "/api/v1/admin/members",
        json={"name": "Ana Exemplo", "email": "Ana@Exemplo.pt", "taxNumber": "123456789", "phone": "912345678", "category": "Efetivo"},
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert (m["memberNumber"], m["email"], m["status"], m["accountEmail"], m["accountHasPassword"]) == (
        "01000",
        "ana@exemplo.pt",
        "Ativo",
        "ana@exemplo.pt",
        False,
    )
    # A conta criada não tem password: só entra depois do convite (ou «Esqueci-me da password»)
    no = await mw.client().post("/api/v1/auth/login", json={"login": "ana@exemplo.pt", "password": "!"}, headers=XHR)
    assert no.status_code == 401
    assert (await sec.post("/api/v1/admin/members", json={"name": "Outra", "memberNumber": "1000"})).status_code == 409
    # Como o formulário do backoffice envia: campos vazios a null
    empty = {k: None for k in ("email", "phone", "taxNumber", "birthDate", "address", "postalCode", "city", "joinedOn")}
    r2 = await sec.post("/api/v1/admin/members", json={"name": "Campos Vazios", "category": "Efetivo", "status": "Ativo", "notes": None, **empty})
    assert r2.status_code == 201, r2.text
    ath = await sec.post(
        "/api/v1/admin/athletes",
        json={"name": "Atleta Vazio", "code": None, "category": None, "guardianName": None, **{k: v for k, v in empty.items() if k != "joinedOn"}},
    )
    assert ath.status_code == 201, ath.text
    bad = await sec.post("/api/v1/admin/members", json={"name": "Nif Errado", "taxNumber": "123456788"})
    assert bad.status_code == 400 and "NIF" in bad.text
    # Alterar e pesquisar
    upd = await sec.put("/api/v1/admin/members/1000", json={"name": "Ana Exemplo Silva", "status": "Suspenso", "category": "Jovem"})
    assert (upd.json()["name"], upd.json()["status"], upd.json()["category"]) == ("Ana Exemplo Silva", "Suspenso", "Jovem")
    found = (await sec.get("/api/v1/admin/members?q=silva")).json()
    assert [x["memberNumber"] for x in found] == ["01000"]
    assert {x["memberNumber"] for x in (await sec.get("/api/v1/admin/members?q=482")).json()} == {"00482"}
    # A tesouraria vê, mas não cria; o editor nem vê
    tes = await mw.login(*TES)
    assert (await tes.get("/api/v1/admin/members")).status_code == 200
    assert (await tes.post("/api/v1/admin/members", json={"name": "Não Pode"})).status_code == 403
    editor = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await editor.get("/api/v1/admin/members")).status_code == 403
    assert {a["action"] for a in await fetch(mw.pool, "select action from audit_log where entity = 'members'")} == {
        "members.create",
        "members.update",
    }


async def test_atleta_novo_com_encarregado_e_numero_de_socio(mw):
    sec = await mw.login(*SEC)
    bad = await sec.post("/api/v1/admin/athletes", json={"name": "Sem Sócio", "memberNumber": "99999"})
    assert bad.status_code == 400 and bad.json()["error"] == "unknown_member"
    r = await sec.post(
        "/api/v1/admin/athletes",
        json={
            "name": "Beatriz Exemplo",
            "birthDate": "14/05/2015",
            "gender": "F",
            "sport": "Escola de Futsal",
            "category": "Sub-11",
            "memberNumber": "482",
            "guardianEmail": "socio@exemplo.pt",
        },
    )
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["code"].startswith("SFC-")
    row = await fetch_one(mw.pool, "select birth_date, gender, sport_slug, member_number from athletes where id = %s", [a["id"]])
    assert row == {"birth_date": "2015-05-14", "gender": "Feminino", "sport_slug": "futsal", "member_number": "00482"}
    # O sócio (encarregado) passa a vê-la na Área de Atletas
    socio = await mw.login("socio@exemplo.pt", "serrado1978")
    assert a["id"] in [x["id"] for x in (await socio.get("/api/v1/me/athletes")).json()]
    acc = (await sec.get(f"/api/v1/admin/athletes/{a['id']}/access")).json()
    assert [(x["email"], x["role"]) for x in acc] == [("socio@exemplo.pt", "encarregado")]
    # Novo co-encarregado (conta criada) e retirar
    add = await sec.post(
        f"/api/v1/admin/athletes/{a['id']}/access", json={"email": "avo@exemplo.pt", "name": "Avó Exemplo", "role": "co-encarregado"}
    )
    assert add.status_code == 201
    assert (await sec.delete(f"/api/v1/admin/athletes/{a['id']}/access/{add.json()['userId']}")).status_code == 204
    # A secretaria corrige a identificação (o trigger deixa, dentro da transação) e fica na auditoria
    upd = await sec.put(f"/api/v1/admin/athletes/{a['id']}", json={"name": "Beatriz Exemplo Costa", "birthDate": "2015-05-15"})
    assert upd.status_code == 200, upd.text
    assert (await fetch_one(mw.pool, "select name from athletes where id = %s", [a["id"]])) == {"name": "Beatriz Exemplo Costa"}
    # Quem gere atletas sem ver dados sensíveis não os grava (nem os apaga)
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    assert (
        await admin.put("/api/v1/admin/roles/treinador", json={"name": "Treinador", "permissions": ["athletes.view", "athletes.manage"]})
    ).status_code == 200
    coach = await mw.login("treinador@serradofc.pt", "treinador2026")
    assert (await coach.put(f"/api/v1/admin/athletes/{a['id']}", json={"name": "Beatriz Exemplo Costa", "taxNumber": None})).status_code == 403
    assert (await coach.put(f"/api/v1/admin/athletes/{a['id']}", json={"name": "Beatriz Exemplo Costa", "category": "Sub-13"})).status_code == 200
    imp = await coach.post("/api/v1/admin/registry/import", json={"kind": "athletes", "rows": [{"name": "Hugo Exemplo", "taxNumber": "123456789"}]})
    assert imp.status_code == 403
    assert (await admin.put("/api/v1/admin/roles/treinador", json={"name": "Treinador", "permissions": ["athletes.view"]})).status_code == 200
    # O treinador (de origem) não cria
    assert (await coach.post("/api/v1/admin/athletes", json={"name": "Não Pode"})).status_code == 403


async def test_importar_socios_valida_tudo_antes_de_gravar(mw):
    sec = await mw.login(*SEC)
    before = await fetch(mw.pool, "select member_number from members")
    rows = [
        {"memberNumber": "2001", "name": "Carlos Exemplo", "email": "carlos@exemplo.pt", "category": "Efetivo", "joinedOn": "01/02/2020"},
        {"memberNumber": "2002", "name": "", "taxNumber": "123456788"},
        {"memberNumber": "2001", "name": "Repetido Exemplo"},
        {"name": "Coluna Errada", "cor": "azul"},
    ]
    r = (await sec.post("/api/v1/admin/registry/import", json={"kind": "members", "rows": rows, "dryRun": False})).json()
    assert {(e["row"], e["field"]) for e in r["errors"]} == {(2, "name"), (2, "taxNumber"), (3, "memberNumber"), (4, "cor")}
    assert "created" not in r and len(await fetch(mw.pool, "select member_number from members")) == len(before), "com erros não grava nada"

    good = [
        {"memberNumber": "2001", "name": "Carlos Exemplo", "email": "carlos@exemplo.pt", "category": "Efetivo", "joinedOn": "01/02/2020"},
        {"memberNumber": "482", "name": "Sócio Demonstração", "phone": "912 345 678", "status": "suspenso"},
        {"name": "Diana Exemplo", "category": "Jovem"},
    ]
    dry = (await sec.post("/api/v1/admin/registry/import", json={"kind": "members", "rows": good, "dryRun": True})).json()
    assert (dry["errors"], dry["creates"], dry["updates"]) == ([], 2, 1)
    done = (await sec.post("/api/v1/admin/registry/import", json={"kind": "members", "rows": good, "dryRun": False})).json()
    assert (done["created"], done["updated"]) == (2, 1)
    m = await fetch_one(mw.pool, "select status, phone, joined_on from members where member_number = '00482'")
    assert m == {"status": "Suspenso", "phone": "912345678", "joined_on": "2019-03-01"}
    assert (await fetch_one(mw.pool, "select joined_on from members where member_number = '02001'")) == {"joined_on": "2020-02-01"}
    diana = await fetch_one(mw.pool, "select member_number from members where name = 'Diana Exemplo'")
    assert diana and diana["member_number"] > "01000"
    # Os números novos continuam depois do maior importado
    nxt = (await sec.post("/api/v1/admin/members", json={"name": "Eva Exemplo"})).json()
    assert int(nxt["memberNumber"]) > 2001
    await execute(mw.pool, "update members set status = 'Ativo' where member_number = '00482'")


async def test_importar_atletas_liga_aos_socios_e_nao_duplica(mw):
    sec = await mw.login(*SEC)
    rows = [
        {"code": "SFC-0900", "name": "Filipe Exemplo", "birthDate": "2012-03-02", "gender": "M", "sport": "rugby", "memberNumber": "2001"},
        {"name": "Gabriela Exemplo", "birthDate": "03/04/2013", "sport": "atletismo", "guardianEmail": "carlos@exemplo.pt", "guardianName": "Carlos"},
    ]
    bad = (
        await sec.post(
            "/api/v1/admin/registry/import", json={"kind": "athletes", "rows": [*rows, {"name": "Sem Sócio Exemplo", "memberNumber": "77777"}]}
        )
    ).json()
    assert [(e["row"], e["field"]) for e in bad["errors"]] == [(3, "memberNumber")]
    first = (await sec.post("/api/v1/admin/registry/import", json={"kind": "athletes", "rows": rows, "dryRun": False})).json()
    assert (first["created"], first["updated"]) == (2, 0)
    again = (await sec.post("/api/v1/admin/registry/import", json={"kind": "athletes", "rows": rows, "dryRun": False})).json()
    assert (again["created"], again["updated"]) == (0, 2), "pelo código ou pelo nome + data de nascimento"
    assert (await fetch_one(mw.pool, "select count(*)::int as n from athletes where name in ('Filipe Exemplo', 'Gabriela Exemplo')")) == {"n": 2}
    carlos = await mw.client().post("/api/v1/auth/login", json={"login": "carlos@exemplo.pt", "password": "x"}, headers=XHR)
    assert carlos.status_code == 401
    acc = await fetch_one(
        mw.pool,
        "select aa.role from athlete_access aa join users u on u.id = aa.user_id join athletes a on a.id = aa.athlete_id "
        "where u.email = 'carlos@exemplo.pt' and a.name = 'Gabriela Exemplo'",
    )
    assert acc == {"role": "encarregado"}
    tes = await mw.login(*TES)
    assert (await tes.post("/api/v1/admin/registry/import", json={"kind": "athletes", "rows": rows})).status_code == 403


async def test_quotas_por_categoria(mw):
    tes = await mw.login(*TES)
    assert (await tes.put("/api/v1/admin/quota-plans/Efetivo", json={"amount": 5, "periodicity": "mensal"})).status_code == 200
    assert (await tes.put("/api/v1/admin/quota-plans/Jovem", json={"amount": 30, "periodicity": "anual"})).status_code == 200
    plans = {p["category"]: p for p in (await tes.get("/api/v1/admin/quota-plans")).json()}
    assert plans["Efetivo"]["members"] >= 2 and plans["Jovem"]["periodicity"] == "anual"
    gen = (await tes.post("/api/v1/admin/fees/generate", json={"month": "2027-03"})).json()
    assert gen["quotas"] > 0
    assert (await tes.post("/api/v1/admin/fees/generate", json={"month": "2027-03"})).json()["quotas"] == 0, "não duplica"
    q = await fetch(
        mw.pool, "select member_number, period, amount, due_date from quotas where period in ('Março 2027', 'Quota 2027') order by member_number"
    )
    carlos = next(x for x in q if x["member_number"] == "02001")
    assert (carlos["period"], carlos["amount"], carlos["due_date"]) == ("Março 2027", 5, "2027-03-08")
    jovem = next(x for x in q if x["period"] == "Quota 2027")
    assert (jovem["amount"], jovem["due_date"]) == (30, "2027-03-08")
    sec = await mw.login(*SEC)
    assert (await sec.put("/api/v1/admin/quota-plans/Efetivo", json={"amount": 1})).status_code == 403


@pytest.fixture
def receipts_on(monkeypatch):
    monkeypatch.setattr(config, "payments", replace(CFG, moloni_payment_methods={**CFG.moloni_payment_methods, "cash": 4, "transfer": 5}))


async def test_pagamento_na_secretaria_com_fatura_recibo(mw, receipts_on):
    tes = await mw.login(*TES)
    pending = (await tes.get("/api/v1/admin/payments/pending?q=Carlos")).json()
    quota = next(x for x in pending if x["kind"] == "quota" and x["memberNumber"] == "02001")
    assert (quota["payerName"], quota["payerEmail"], quota["label"]) == ("Carlos Exemplo", "carlos@exemplo.pt", "Quota Março 2027")
    sec = await mw.login(*SEC)
    body = {"items": [{"kind": "quota", "id": quota["id"]}], "method": "cash", "paidOn": "2027-03-05", "payerName": "Carlos Exemplo"}
    assert (await sec.post("/api/v1/admin/payments/manual", json=body)).status_code == 403
    r = await tes.post("/api/v1/admin/payments/manual", json={**body, "payerNif": "123456788"})
    assert r.status_code == 400
    r = await tes.post("/api/v1/admin/payments/manual", json={**body, "note": "Pago ao balcão"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["receiptStatus"] == "pending"
    assert (await tes.post("/api/v1/admin/payments/manual", json=body)).status_code == 409, "já está pago"
    row = await fetch_one(mw.pool, "select paid_at, payment_method from quotas where id = %s", [quota["id"]])
    assert row == {"paid_at": "2027-03-05", "payment_method": "Numerário"}
    p = await fetch_one(mw.pool, "select provider, payer_nif, payer_email, status from payments where id = %s", [pid])
    assert p == {"provider": "manual", "payer_nif": "999999990", "payer_email": "", "status": "paid"}

    fake = FakeMoloni()
    client = MoloniClient(config.payments, transport=httpx.MockTransport(fake.handler), media_url="https://media.test")
    s = await issue_receipts(mw.pool, config.payments, client)
    assert (s.issued, s.errors) == (1, [])
    ops = [op for op, _ in fake.calls]
    assert "invoiceReceiptSendMail" not in ops, "sem email, o Moloni não envia"
    created = dict(fake.calls)["invoiceReceiptCreate"]["data"]
    assert created["payments"][0]["paymentMethodId"] == 4 and created["ourReference"].startswith("Secretaria ")
    assert (await fetch_one(mw.pool, "select receipt_pdf from payments where id = %s", [pid])) == {"receipt_pdf": PDF}
    listing = (await tes.get("/api/v1/admin/payments?status=paid")).json()
    assert any(x["id"] == pid and x["provider"] == "manual" and x["note"] == "Pago ao balcão" for x in listing)


async def test_pagamento_na_secretaria_sem_moloni(mw):
    tes = await mw.login(*TES)
    fee = next(x for x in (await tes.get("/api/v1/admin/payments/pending")).json() if x["kind"] == "quota")
    body = {"items": [{"kind": fee["kind"], "id": fee["id"]}], "method": "transfer", "paidOn": "2027-03-06", "payerName": fee["payerName"]}
    r = await tes.post("/api/v1/admin/payments/manual", json=body)
    assert r.status_code == 503 and r.json()["error"] == "receipts_disabled"
    r = await tes.post("/api/v1/admin/payments/manual", json={**body, "receipt": False})
    assert r.status_code == 201 and r.json()["receiptStatus"] == "none"
