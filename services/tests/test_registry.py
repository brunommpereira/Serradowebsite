"""Sócios e atletas no backoffice (à mão e por ficheiro), quotas por categoria e pagamentos feitos na secretaria."""

from dataclasses import replace

import httpx
import pytest

from serrado.config import config
from serrado.db.pool import create_pool, execute, fetch, fetch_one, tx
from serrado.payments.moloni import MoloniClient
from serrado.payments.service import issue_receipts
from tests.conftest import XHR
from tests.test_payments import CFG, PDF, FakeMoloni

SEC = ("secretaria@serradofc.pt", "secretaria2026")
TES = ("tesouraria@serradofc.pt", "tesouraria2026")


async def test_secretaria_cria_socio_com_numero_seguinte_e_conta_ligada(mw):
    sec = await mw.login(*SEC)
    top = await fetch_one(mw.pool, "select max(member_number::int) as n from members")
    expected = str(top["n"] + 1).zfill(5)  # o maior n.º que existe + 1
    r = await sec.post(
        "/api/v1/admin/members",
        json={"name": "Ana Exemplo", "email": "Ana@Exemplo.pt", "taxNumber": "123456789", "phone": "912345678", "category": "Efetivo"},
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert (m["memberNumber"], m["email"], m["status"], m["accountEmail"], m["accountHasPassword"]) == (
        expected,
        "ana@exemplo.pt",
        "Ativo",
        "ana@exemplo.pt",
        False,
    )
    # A conta criada não tem password: só entra depois do convite (ou «Esqueci-me da password»)
    no = await mw.client().post("/api/v1/auth/login", json={"login": "ana@exemplo.pt", "password": "!"}, headers=XHR)
    assert no.status_code == 401
    assert (await sec.post("/api/v1/admin/members", json={"name": "Outra", "memberNumber": expected})).status_code == 409
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
    upd = await sec.put(f"/api/v1/admin/members/{expected}", json={"name": "Ana Exemplo Silva", "status": "Suspenso", "category": "Jovem"})
    assert (upd.json()["name"], upd.json()["status"], upd.json()["category"]) == ("Ana Exemplo Silva", "Suspenso", "Jovem")
    found = (await sec.get("/api/v1/admin/members?q=silva")).json()
    assert [x["memberNumber"] for x in found] == [expected]
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


async def test_ficha_do_socio_sugere_atletas_e_a_secretaria_liga(mw):
    sec = await mw.login(*SEC)
    m = (await sec.post("/api/v1/admin/members", json={"name": "Rita de Sousa Quintanilha", "email": "rita.q@exemplo.pt"})).json()
    n = m["memberNumber"]

    async def athlete(name: str, **extra: object) -> str:
        r = await sec.post("/api/v1/admin/athletes", json={"name": name, "sport": "futsal", **extra})
        assert r.status_code == 201, r.text
        return r.json()["id"]

    same = await athlete("Rita Sousa Quintanilha")
    first_last = await athlete("Rita Maria Quintanilha")
    child = await athlete("Tomás Quintanilha")
    guarded = await athlete("Outro Apelido", guardianName="Rita", guardianEmail="rita.q@exemplo.pt")
    other = await athlete("Nada A Ver")
    sug = (await sec.get(f"/api/v1/admin/members/{n}/athlete-suggestions")).json()
    by_id = {x["id"]: x for x in sug}
    # Quem já tem o sócio como encarregado não aparece como sugestão
    assert [x["id"] for x in sug[:3]] == [same, first_last, child] and guarded not in by_id
    assert by_id[same]["reason"] == "Mesmo nome" and by_id[same]["type"] == "same" and by_id[child]["type"] == "surname"
    assert other not in by_id
    # Pesquisa livre por nome
    found = (await sec.get(f"/api/v1/admin/members/{n}/athlete-suggestions", params={"q": "nada ve"})).json()
    assert [x["id"] for x in found] == [other]

    # Ligar: a ficha do sócio passa a mostrar o atleta e a do atleta o n.º de sócio
    r = await sec.post(f"/api/v1/admin/members/{n}/athletes/{child}")
    assert r.status_code == 200, r.text
    assert [a["id"] for a in r.json()["athletes"]] == [child]
    row = await fetch_one(mw.pool, "select member_number from athletes where id = %s", [child])
    assert row and row["member_number"] == n
    assert child not in {x["id"] for x in (await sec.get(f"/api/v1/admin/members/{n}/athlete-suggestions")).json()}
    # Ligado a outro sócio: pede confirmação (force)
    m2 = (await sec.post("/api/v1/admin/members", json={"name": "Segundo Sócio"})).json()["memberNumber"]
    assert (await sec.post(f"/api/v1/admin/members/{m2}/athletes/{child}")).status_code == 409
    assert (await sec.post(f"/api/v1/admin/members/{m2}/athletes/{child}", params={"force": "true"})).status_code == 200
    # Desligar
    assert (await sec.delete(f"/api/v1/admin/members/{n}/athletes/{child}")).status_code == 404
    assert (await sec.delete(f"/api/v1/admin/members/{m2}/athletes/{child}")).json()["athletes"] == []
    actions = [a["action"] for a in await fetch(mw.pool, "select action from audit_log where entity_id = %s order by id", [child])]
    assert actions[-3:] == ["athletes.link_member", "athletes.link_member", "athletes.unlink_member"]
    # Quem não gere sócios e atletas não liga
    tes = await mw.login(*TES)
    assert (await tes.post(f"/api/v1/admin/members/{n}/athletes/{same}")).status_code == 403


async def test_mesma_pessoa_completa_os_dados_em_falta_nas_duas_fichas(mw):
    sec = await mw.login(*SEC)
    m = (
        await sec.post(
            "/api/v1/admin/members",
            json={"name": "Joana de Exemplo Pires", "email": "joana.pires@exemplo.pt", "taxNumber": "451234561", "city": "Almada"},
        )
    ).json()
    n = m["memberNumber"]
    same = await sec.post(
        "/api/v1/admin/athletes",
        json={
            "name": "Joana Exemplo Pires",
            "sport": "atletismo",
            "birthDate": "1990-03-04",
            "phone": "912000111",
            "city": "Charneca",
            "address": "Rua A, 1",
        },
    )
    child = await sec.post("/api/v1/admin/athletes", json={"name": "Rui Exemplo Pires", "sport": "futsal", "birthDate": "2015-01-01"})
    r = await sec.post(f"/api/v1/admin/members/{n}/athletes/{same.json()['id']}")
    assert r.status_code == 200, r.text
    done = r.json()["completed"]
    assert done == {"member": ["Telemóvel", "Data de nascimento", "Morada"], "athlete": ["Email", "NIF"]}
    member = r.json()
    # O que já estava preenchido não muda (localidade do sócio fica Almada)
    assert (member["phone"], member["birthDate"], member["address"], member["city"], member["taxNumber"]) == (
        "912000111",
        "1990-03-04",
        "Rua A, 1",
        "Almada",
        "451234561",
    )
    a = await fetch_one(mw.pool, "select email, tax_number, city from athletes where id = %s", [same.json()["id"]])
    assert a == {"email": "joana.pires@exemplo.pt", "tax_number": "451234561", "city": "Charneca"}
    # Filho/a (outro nome): liga, mas não copia dados
    r2 = await sec.post(f"/api/v1/admin/members/{n}/athletes/{child.json()['id']}")
    assert r2.json()["completed"] == {"member": [], "athlete": []}
    kid = await fetch_one(mw.pool, "select tax_number, email from athletes where id = %s", [child.json()["id"]])
    assert kid == {"tax_number": None, "email": None}
    # Alterar o sócio depois também completa a ficha do atleta que é a mesma pessoa
    await sec.put(f"/api/v1/admin/members/{n}", json={"name": "Joana de Exemplo Pires", "postalCode": "2820-001"})
    assert (await fetch_one(mw.pool, "select postal_code from athletes where id = %s", [same.json()["id"]])) == {"postal_code": "2820-001"}


async def test_atleta_menor_com_o_mesmo_apelido_sugere_o_socio_como_encarregado(mw):
    sec = await mw.login(*SEC)
    n = (await sec.post("/api/v1/admin/members", json={"name": "Carlos Exemplo Valadares", "birthDate": "1980-02-02"})).json()["memberNumber"]

    async def athlete(name: str, birth: str) -> str:
        return str((await sec.post("/api/v1/admin/athletes", json={"name": name, "sport": "futsal", "birthDate": birth})).json()["id"])

    kid = await athlete("Inês Valadares", "2016-06-06")
    adult = await athlete("Paulo Valadares", "1985-01-01")
    sug = {x["id"]: x for x in (await sec.get(f"/api/v1/admin/members/{n}/athlete-suggestions")).json()}
    assert sug[kid]["type"] == "guardian" and "pode ser o encarregado" in sug[kid]["reason"]
    assert sug[adult]["type"] == "surname"
    # Sem email não há conta para o encarregado
    r = await sec.post(f"/api/v1/admin/members/{n}/guardian/{kid}")
    assert r.status_code == 400 and "email" in r.text
    await sec.put(f"/api/v1/admin/members/{n}", json={"name": "Carlos Exemplo Valadares", "email": "carlos.v@exemplo.pt"})
    r = await sec.post(f"/api/v1/admin/members/{n}/guardian/{kid}")
    assert r.status_code == 200, r.text
    assert [(g["id"], g["role"]) for g in r.json()["guardianOf"]] == [(kid, "encarregado")]
    # A ficha do atleta não fica com o n.º do pai; a conta do sócio passa a ver a ficha
    row = await fetch_one(mw.pool, "select member_number from athletes where id = %s", [kid])
    assert row == {"member_number": None}
    access = (await sec.get(f"/api/v1/admin/athletes/{kid}/access")).json()
    assert [(x["email"], x["role"]) for x in access] == [("carlos.v@exemplo.pt", "encarregado")]
    assert kid not in {x["id"] for x in (await sec.get(f"/api/v1/admin/members/{n}/athlete-suggestions")).json()}
    r = await sec.delete(f"/api/v1/admin/members/{n}/guardian/{kid}")
    assert r.json()["guardianOf"] == []


async def test_ligacao_usada_em_autocommit_volta_ao_pool_transacional(mw):
    """Os locks (emails, recibos, Facebook) põem a ligação em autocommit; a seguinte tem de voltar a ser transacional."""
    p = create_pool(mw.pool.conninfo, min_size=1, max_size=1)
    await p.open()
    try:
        async with p.connection() as c:
            await c.set_autocommit(True)
        async with tx(p) as c:
            assert c.autocommit is False
            await c.execute("select set_config('app.identity_change', 'on', true)")
            row = await (await c.execute("select current_setting('app.identity_change', true) as v")).fetchone()
            assert row == {"v": "on"}
    finally:
        await p.close()


async def test_conta_ve_a_ficha_com_o_seu_email_e_os_resultados_ligados_pelo_nome(mw):
    from serrado.password import hash_password_sync

    sec = await mw.login(*SEC)
    # Importado só com o email de contacto (sem «Conta do atleta»), como no ficheiro do clube
    imp = await sec.post(
        "/api/v1/admin/registry/import",
        json={
            "kind": "athletes",
            "dryRun": False,
            "rows": [
                {"name": "Bruno Miguel Exemplo Pereira", "birthDate": "1980-05-05", "sport": "atletismo", "email": "Bruno.Exemplo@Gmail.com"},
                {"name": "Inês Exemplo Pereira", "birthDate": "2015-02-02", "sport": "atletismo", "email": "bruno.exemplo@gmail.com"},
            ],
        },
    )
    assert imp.status_code == 200, imp.text
    adult = await fetch_one(mw.pool, "select id from athletes where name = 'Bruno Miguel Exemplo Pereira'")
    kid = await fetch_one(mw.pool, "select id from athletes where name = 'Inês Exemplo Pereira'")
    assert adult and kid
    # Resultados do Troféu sem código: ligam-se pelo nome (primeiro e último) e ano de nascimento
    rows = [
        {
            "athleteCode": None,
            "athleteName": "BRUNO PEREIRA",
            "birthYear": 1980,
            "season": "2025/2026",
            "round": 7,
            "race": "Corrida X",
            "raceBase": "Corrida X",
            "raceDate": "2025-11-02",
            "category": "Veteranos",
            "place": 3,
        },
        {
            "athleteCode": None,
            "athleteName": "JOÃO NINGUÉM",
            "birthYear": 1980,
            "season": "2025/2026",
            "round": 7,
            "race": "Corrida X",
            "raceBase": "Corrida X",
            "raceDate": "2025-11-02",
            "category": "Veteranos",
            "place": 9,
        },
    ]
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    res = await admin.post("/api/v1/admin/results/import", json={"rows": rows})
    assert res.status_code == 200, res.text
    linked = await fetch(mw.pool, "select athlete_name from results where athlete_id = %s", [adult["id"]])
    assert [x["athlete_name"] for x in linked] == ["BRUNO PEREIRA"]

    # A conta com esse email entra e vê a sua ficha (atleta) e a da filha (encarregado), com os resultados
    await execute(
        mw.pool,
        "insert into users (email, name, password_hash) values ('bruno.exemplo@gmail.com', 'Bruno', %s) on conflict (email) do nothing",
        [hash_password_sync("segredo-2026")],
    )
    me = await mw.login("bruno.exemplo@gmail.com", "segredo-2026")
    mine = {a["id"]: a for a in (await me.get("/api/v1/me/athletes")).json()}
    assert set(mine) == {adult["id"], kid["id"]}
    roles = {
        r["athlete_id"]: r["role"]
        for r in await fetch(mw.pool, "select athlete_id, role from athlete_access where athlete_id in (%s, %s)", [adult["id"], kid["id"]])
    }
    assert roles == {adult["id"]: "atleta", kid["id"]: "encarregado"}
    results = (await me.get(f"/api/v1/athletes/{adult['id']}/results")).json()
    assert [r["place"] for r in results] == [3]


async def test_lista_de_resultados_com_filtros_e_ligacao_manual(mw):
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    rows = [
        {
            "athleteCode": None,
            "athleteName": "ZÉ DESCONHECIDO",
            "birthYear": 1999,
            "season": "2024/2025",
            "round": 3,
            "race": "Prova Y",
            "raceBase": "Prova Y",
            "raceDate": "2024-12-01",
            "category": "Seniores",
            "place": 5,
        },
        {
            "athleteCode": None,
            "athleteName": "ZÉ DESCONHECIDO",
            "birthYear": 1999,
            "season": "2024/2025",
            "round": 4,
            "race": "Prova Z",
            "raceBase": "Prova Z",
            "raceDate": "2025-01-12",
            "category": "Seniores",
            "place": 2,
        },
    ]
    assert (await admin.post("/api/v1/admin/results/import", json={"rows": rows})).status_code == 200
    out = (await admin.get("/api/v1/admin/results", params={"season": "2024/2025", "linked": "no", "q": "desconhecido"})).json()
    assert [x["place"] for x in out["items"]] == [2, 5] and out["total"] == 2 and out["linked"] == 0
    assert "2024/2025" in out["seasons"] and "Seniores" in out["categories"]
    sec = await mw.login(*SEC)
    a = (await sec.post("/api/v1/admin/athletes", json={"name": "José Outro Nome", "sport": "atletismo", "birthDate": "1999-03-03"})).json()
    r = await admin.post("/api/v1/admin/results/link", json={"athleteName": "ZÉ DESCONHECIDO", "birthYear": 1999, "athleteId": a["id"]})
    assert r.json() == {"updated": 2}
    out = (await admin.get("/api/v1/admin/results", params={"linked": "yes", "q": "José Outro"})).json()
    assert {x["linkedName"] for x in out["items"]} == {"José Outro Nome"} and out["total"] == 2
    tes = await mw.login(*TES)
    assert (await tes.post("/api/v1/admin/results/link", json={"athleteName": "ZÉ DESCONHECIDO", "birthYear": 1999})).status_code == 403


async def test_educandos_ligados_ao_numero_de_socio_aparecem_na_area_de_atletas(mw):
    from serrado.password import hash_password_sync

    sec = await mw.login(*SEC)
    # Sócio importado sem email; a ficha de atleta dele tem o email (completa a do sócio ao ligar)
    n = (await sec.post("/api/v1/admin/members", json={"name": "Pai Exemplo Valente"})).json()["memberNumber"]
    me_ath = (
        await sec.post(
            "/api/v1/admin/athletes",
            json={"name": "Pai Exemplo Valente", "sport": "atletismo", "email": "pai.valente@exemplo.pt", "birthDate": "1980-01-01"},
        )
    ).json()
    kid1 = (await sec.post("/api/v1/admin/athletes", json={"name": "Rita Valente", "sport": "futsal", "birthDate": "2015-05-05"})).json()
    kid2 = (await sec.post("/api/v1/admin/athletes", json={"name": "Rui Valente", "sport": "futsal", "birthDate": "2013-05-05"})).json()
    other_adult = (
        await sec.post("/api/v1/admin/athletes", json={"name": "Outro Adulto Valente", "sport": "atletismo", "birthDate": "1975-05-05"})
    ).json()
    for a in (me_ath, kid1, kid2, other_adult):
        assert (await sec.post(f"/api/v1/admin/members/{n}/athletes/{a['id']}", params={"force": "true"})).status_code == 200
    await execute(
        mw.pool,
        "insert into users (email, name, password_hash) values ('pai.valente@exemplo.pt', 'Pai', %s) on conflict (email) do nothing",
        [hash_password_sync("segredo-2026")],
    )
    me = await mw.login("pai.valente@exemplo.pt", "segredo-2026")
    mine = {a["id"] for a in (await me.get("/api/v1/me/athletes")).json()}
    assert mine == {me_ath["id"], kid1["id"], kid2["id"]}, "o outro adulto com o mesmo n.º não"
    linked = await fetch_one(mw.pool, "select u.email from members m join users u on u.id = m.user_id where m.member_number = %s", [n])
    assert linked == {"email": "pai.valente@exemplo.pt"}, "a ficha de sócio fica ligada à conta"
