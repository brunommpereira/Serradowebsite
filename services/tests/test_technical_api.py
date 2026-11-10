"""APIs técnicas: credenciais de cliente → token → pedido em nome de quem pede (id) → decisão do núcleo → estado."""

import base64

from serrado.db.pool import execute, fetch, fetch_one

PDF = base64.b64encode(b"%PDF-1.4\n% fatura de teste\n%%EOF").decode()
BOTH = ["expenses.create", "expenses.approve_nucleo"]


def expense(**extra: object) -> dict:
    return {
        "requesterEmail": "Diretor@SerradoFC.pt",
        "nucleo": "rugby",
        "category": "Material e equipamentos",
        "title": "Bolas de treino",
        "supplier": "Desportos Lda",
        "supplierNif": "509999990",
        "amount": "120.00",
        "externalRef": "ERP-2026-0001",
        "files": [{"name": "orcamento.pdf", "data": PDF}],
        **extra,
    }


async def new_client(mw, **extra: object) -> dict:
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    meta = (await admin.get("/api/v1/admin/api-clients")).json()
    assert {s["key"] for s in meta["scopes"]} == set(BOTH)
    owner = next(u for u in meta["candidates"] if u["email"] == "tesouraria@serradofc.pt")
    body = {"name": "ERP do clube", "userId": owner["id"], "nucleos": ["rugby"], "scopes": BOTH, **extra}
    r = await admin.post("/api/v1/admin/api-clients", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def get_token(mw, cid: str, secret: str) -> str:
    r = await mw.client().post("/api/v1/technical/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["token_type"] == "Bearer" and body["expires_in"] == 900
    return body["access_token"]


async def api_for(mw, client: dict):
    api = mw.client()
    api.headers["authorization"] = f"Bearer {await get_token(mw, client['clientId'], client['clientSecret'])}"
    return api


async def test_pedido_em_nome_de_quem_pede_decisao_do_nucleo_e_estado(mw):
    client = await new_client(mw)
    cid, secret = client["clientId"], client["clientSecret"]
    assert cid.startswith("sfc_cli_") and secret.startswith("sfc_sk_") and client["secretHint"] == secret[-4:]
    assert client["scopes"] == BOTH and client["userName"] == "Tesouraria"
    # Do segredo só fica o hash; a lista não o mostra
    row = await fetch_one(mw.pool, "select secret_hash from api_clients where client_id = %s", [cid])
    assert row and secret not in row["secret_hash"] and len(row["secret_hash"]) == 64
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    listed = (await admin.get("/api/v1/admin/api-clients")).json()["clients"]
    assert listed[0]["clientId"] == cid and "clientSecret" not in listed[0]

    api = await api_for(mw, client)

    # Registar: o pedido fica em nome do email indicado (sem distinguir maiúsculas)
    r = await api.post("/api/v1/technical/expenses", json=expense())
    assert r.status_code == 201, r.text
    out = r.json()
    eid = out["id"]
    assert (out["status"], out["final"], out["duplicate"], out["externalRef"]) == ("pedido", False, False, "ERP-2026-0001")
    db = await fetch_one(mw.pool, "select u.email, e.api_client from expenses e join users u on u.id = e.requested_by where e.id = %s", [eid])
    assert db and db["email"] == "diretor@serradofc.pt" and db["api_client"] is not None

    # Repetir o mesmo envio não cria outro pedido
    again = (await api.post("/api/v1/technical/expenses", json=expense())).json()
    assert (again["id"], again["duplicate"]) == (eid, True)

    # Decisão do núcleo: quem pediu não decide; quem não é tesoureiro do núcleo também não
    decide = f"/api/v1/technical/expenses/{eid}/nucleo-decision"
    r = await api.post(decide, json={"approverEmail": "diretor@serradofc.pt", "approve": True})
    assert r.status_code == 403 and r.json()["error"] == "approver_not_allowed"
    r = await api.post(decide, json={"approverEmail": "treinador@serradofc.pt", "approve": True})
    assert r.status_code == 403 and r.json()["error"] == "approver_not_allowed"
    r = await api.post(decide, json={"approverEmail": "ninguem@exemplo.pt", "approve": True})
    assert r.status_code == 403
    # Valor maior do que o pedido não
    r = await api.post(decide, json={"approverEmail": "nucleo@serradofc.pt", "approve": True, "amount": "500.00"})
    assert r.status_code == 400 and r.json()["error"] == "amount_too_high"
    # O tesoureiro do rugby aprova (com valor menor)
    r = await api.post(decide, json={"approverEmail": "nucleo@serradofc.pt", "approve": True, "amount": "110.00", "note": "Só 9 bolas"})
    assert r.status_code == 200, r.text
    st = r.json()
    assert (st["status"], st["approvedAmount"]) == ("aprovado_nucleo", 110.0)
    db = await fetch_one(mw.pool, "select u.email from expenses e join users u on u.id = e.nucleo_by where e.id = %s", [eid])
    assert db and db["email"] == "nucleo@serradofc.pt"
    audit = await fetch_one(mw.pool, "select details from audit_log where entity = 'expense' and action = 'approve' order by id desc limit 1")
    assert audit and audit["details"]["via"] == "API técnica · ERP do clube"
    # Já decidido: não se decide outra vez
    r = await api.post(decide, json={"approverEmail": "nucleo@serradofc.pt", "approve": False, "note": "x"})
    assert r.status_code == 409 and r.json()["error"] == "invalid_state"

    # A tesouraria paga no backoffice e o estado acompanha
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    paid = {"paidOn": "2026-01-05", "amount": "110.00", "method": "transferencia"}
    assert (await tesouraria.post(f"/api/v1/admin/expenses/{eid}/pay", json=paid)).status_code == 200
    st = (await api.get(f"/api/v1/technical/expenses/{eid}")).json()
    assert (st["status"], st["final"], st["statusLabel"]) == ("pago", True, "Pago")
    assert st["payment"] == {"paidOn": "2026-01-05", "amount": 110.0, "method": "transferencia"}
    assert [h["action"] for h in st["history"]] == ["pedido", "aprovado_nucleo", "aprovado", "pago"]
    assert all(set(h) == {"at", "action", "label"} for h in st["history"])  # sem nomes nem notas internas
    assert (await api.get("/api/v1/technical/expenses", params={"externalRef": "ERP-2026-0001"})).json()["id"] == eid


async def test_rejeicao_pelo_nucleo_exige_motivo(mw):
    api = await api_for(mw, await new_client(mw, name="Sistema de compras"))
    eid = (await api.post("/api/v1/technical/expenses", json=expense(externalRef="REJ-1"))).json()["id"]
    decide = f"/api/v1/technical/expenses/{eid}/nucleo-decision"
    r = await api.post(decide, json={"approverEmail": "nucleo@serradofc.pt", "approve": False})
    assert r.status_code == 400 and r.json()["error"] == "reason_required"
    st = (await api.post(decide, json={"approverEmail": "nucleo@serradofc.pt", "approve": False, "note": "Já temos bolas"})).json()
    assert (st["status"], st["final"], st["rejectReason"]) == ("rejeitado", True, "Já temos bolas")


async def test_quem_pede_tem_de_poder_pedir(mw):
    api = await api_for(mw, await new_client(mw, name="Outro ERP"))
    for email in ("treinador@serradofc.pt", "naoexiste@exemplo.pt"):
        r = await api.post("/api/v1/technical/expenses", json=expense(requesterEmail=email, externalRef="REQ-" + email[:4]))
        assert r.status_code == 403 and r.json()["error"] == "requester_not_allowed"
    assert (await api.post("/api/v1/technical/expenses", json=expense(requesterEmail="sem-arroba", externalRef="REQ-x"))).status_code == 400
    missing = {k: v for k, v in expense(externalRef="REQ-y").items() if k != "requesterEmail"}
    assert (await api.post("/api/v1/technical/expenses", json=missing)).status_code == 400
    # Conta desativada deixa de poder pedir
    await execute(mw.pool, "update users set disabled = true where email = 'diretor@serradofc.pt'")
    try:
        r = await api.post("/api/v1/technical/expenses", json=expense(externalRef="REQ-z"))
        assert r.status_code == 403 and r.json()["error"] == "requester_not_allowed"
    finally:
        await execute(mw.pool, "update users set disabled = false where email = 'diretor@serradofc.pt'")


async def test_permissoes_da_credencial(mw):
    # Só registar: não decide
    only_create = await api_for(mw, await new_client(mw, name="Só pedidos", scopes=["expenses.create"]))
    eid = (await only_create.post("/api/v1/technical/expenses", json=expense(externalRef="SC-1"))).json()["id"]
    r = await only_create.post(f"/api/v1/technical/expenses/{eid}/nucleo-decision", json={"approverEmail": "nucleo@serradofc.pt", "approve": True})
    assert r.status_code == 403 and r.json()["error"] == "scope_not_allowed"
    # Só decidir: não regista, e só decide os pedidos que o próprio cliente registou
    only_decide = await api_for(mw, await new_client(mw, name="Só decisões", scopes=["expenses.approve_nucleo"]))
    r = await only_decide.post("/api/v1/technical/expenses", json=expense(externalRef="SC-2"))
    assert r.status_code == 403 and r.json()["error"] == "scope_not_allowed"
    r = await only_decide.post(f"/api/v1/technical/expenses/{eid}/nucleo-decision", json={"approverEmail": "nucleo@serradofc.pt", "approve": True})
    assert r.status_code == 404
    # Sem permissões não se cria
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    owner = await fetch_one(mw.pool, "select id::text as id from users where email = 'tesouraria@serradofc.pt'")
    assert owner
    assert (await admin.post("/api/v1/admin/api-clients", json={"name": "Nada", "userId": owner["id"], "scopes": []})).status_code == 400


async def test_credenciais_tokens_e_limites(mw):
    client = await new_client(mw, name="Sistema externo")
    cid, secret = client["clientId"], client["clientSecret"]
    c = mw.client()

    # Credenciais erradas, outra forma de pedido e HTTP Basic / JSON
    bad = await c.post("/api/v1/technical/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": "sfc_sk_errado"})
    assert bad.status_code == 401 and bad.json()["error"] == "invalid_client"
    assert (
        await c.post("/api/v1/technical/oauth/token", data={"grant_type": "password", "client_id": cid, "client_secret": secret})
    ).status_code == 400
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = await c.post("/api/v1/technical/oauth/token", data={"grant_type": "client_credentials"}, headers={"authorization": f"Basic {basic}"})
    assert r.status_code == 200, r.text
    r = await c.post("/api/v1/technical/oauth/token", json={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert (await fetch_one(mw.pool, "select count(*) as n from api_tokens where token_hash = %s", [token]))["n"] == 0  # só o hash

    api = mw.client()
    assert (await api.post("/api/v1/technical/expenses", json=expense(externalRef="X-1"))).status_code == 401
    api.headers["authorization"] = "Bearer sfc_at_inventado"
    assert (await api.get("/api/v1/technical/expenses/1")).status_code == 401
    api.headers["authorization"] = f"Bearer {token}"

    # Só os núcleos permitidos; validação igual à do backoffice
    r = await api.post("/api/v1/technical/expenses", json=expense(nucleo="futsal", externalRef="X-2"))
    assert r.status_code == 403 and r.json()["error"] == "nucleo_not_allowed"
    assert (await api.post("/api/v1/technical/expenses", json=expense(amount="-5", externalRef="X-3"))).status_code == 400
    assert (await api.post("/api/v1/technical/expenses", json=expense(externalRef="com espaço"))).status_code == 400

    # Não vê pedidos de outros clientes nem do backoffice
    diretor = await mw.login("diretor@serradofc.pt", "diretor2026")
    own_body = {k: v for k, v in expense().items() if k not in ("externalRef", "requesterEmail")}
    own = (await diretor.post("/api/v1/admin/expenses", json=own_body)).json()
    assert (await api.get(f"/api/v1/technical/expenses/{own['id']}")).status_code == 404
    r = await api.post(f"/api/v1/technical/expenses/{own['id']}/nucleo-decision", json={"approverEmail": "nucleo@serradofc.pt", "approve": True})
    assert r.status_code == 404

    # Token expirado
    await execute(mw.pool, "update api_tokens set expires_at = now() - interval '1 minute'")
    assert (await api.get(f"/api/v1/technical/expenses/{own['id']}")).status_code == 401

    # Novo segredo: o antigo deixa de valer; revogar: nada vale
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    rotated = (await admin.post(f"/api/v1/admin/api-clients/{client['id']}/rotate")).json()
    assert rotated["clientSecret"] != secret
    bad = await c.post("/api/v1/technical/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert bad.status_code == 401
    fresh = await get_token(mw, cid, rotated["clientSecret"])
    assert (await admin.post(f"/api/v1/admin/api-clients/{client['id']}/revoke")).json()["active"] is False
    api.headers["authorization"] = f"Bearer {fresh}"
    assert (await api.get("/api/v1/technical/expenses/1")).status_code == 401

    # Só quem gere utilizadores mexe nas credenciais; o responsável tem de ser da equipa
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tesouraria.get("/api/v1/admin/api-clients")).status_code == 403
    socio = await fetch_one(mw.pool, "select id::text as id from users where email = 'joao@exemplo.pt'")
    assert socio
    assert (await admin.post("/api/v1/admin/api-clients", json={"name": "Sem papel", "userId": socio["id"]})).status_code == 400
    audit = await fetch(mw.pool, "select action from audit_log where entity = 'api_client' order by id")
    assert [a["action"] for a in audit][-3:] == ["create", "rotate_secret", "revoke"]
