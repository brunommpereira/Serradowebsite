"""API de parceiros: credenciais de cliente → token → pedido de gasto (id) → estado do processo."""

import base64

from serrado.db.pool import execute, fetch, fetch_one

PDF = base64.b64encode(b"%PDF-1.4\n% fatura de teste\n%%EOF").decode()


def expense(**extra: object) -> dict:
    return {
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
    diretor = next(u for u in meta["candidates"] if u["email"] == "diretor@serradofc.pt")
    r = await admin.post("/api/v1/admin/api-clients", json={"name": "ERP do clube", "userId": diretor["id"], "nucleos": ["rugby"], **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def get_token(mw, cid: str, secret: str) -> str:
    r = await mw.client().post("/api/v1/partner/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["token_type"] == "Bearer" and body["expires_in"] == 900
    return body["access_token"]


async def test_pedido_de_fora_devolve_id_e_estado_acompanha_o_fluxo(mw):
    client = await new_client(mw)
    cid, secret = client["clientId"], client["clientSecret"]
    assert cid.startswith("sfc_cli_") and secret.startswith("sfc_sk_") and client["secretHint"] == secret[-4:]
    # Do segredo só fica o hash; a lista não o mostra
    row = await fetch_one(mw.pool, "select secret_hash from api_clients where client_id = %s", [cid])
    assert row and secret not in row["secret_hash"] and len(row["secret_hash"]) == 64
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    listed = (await admin.get("/api/v1/admin/api-clients")).json()["clients"]
    assert listed[0]["clientId"] == cid and "clientSecret" not in listed[0]

    token = await get_token(mw, cid, secret)
    api = mw.client()
    api.headers["authorization"] = f"Bearer {token}"

    # Registar: devolve o id e o estado
    r = await api.post("/api/v1/partner/expenses", json=expense())
    assert r.status_code == 201, r.text
    out = r.json()
    eid = out["id"]
    assert (out["status"], out["final"], out["duplicate"], out["externalRef"]) == ("pedido", False, False, "ERP-2026-0001")
    assert out["statusLabel"] == "Aguarda aprovação do tesoureiro do núcleo"
    db = await fetch_one(mw.pool, "select requested_by, api_client from expenses where id = %s", [eid])
    diretor = await fetch_one(mw.pool, "select id from users where email = 'diretor@serradofc.pt'")
    assert db and diretor and db["requested_by"] == diretor["id"] and db["api_client"] is not None

    # Repetir o mesmo envio (ex.: falhou a rede) não cria outro pedido
    again = (await api.post("/api/v1/partner/expenses", json=expense())).json()
    assert (again["id"], again["duplicate"]) == (eid, True)
    assert (await fetch_one(mw.pool, "select count(*) as n from expenses where external_ref = 'ERP-2026-0001'"))["n"] == 1

    # O pedido entra no fluxo normal: o tesoureiro do núcleo aprova, a tesouraria paga
    nucleo = await mw.login("nucleo@serradofc.pt", "nucleo2026")
    assert (await nucleo.post(f"/api/v1/admin/expenses/{eid}/nucleo", json={"approve": True, "amount": "110.00"})).status_code == 200
    st = (await api.get(f"/api/v1/partner/expenses/{eid}")).json()
    assert (st["status"], st["approvedAmount"]) == ("aprovado_nucleo", 110.0)
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    paid = {"paidOn": "2026-01-05", "amount": "110.00", "method": "transferencia"}
    assert (await tesouraria.post(f"/api/v1/admin/expenses/{eid}/pay", json=paid)).status_code == 200

    st = (await api.get(f"/api/v1/partner/expenses/{eid}")).json()
    assert (st["status"], st["final"], st["statusLabel"]) == ("pago", True, "Pago")
    assert st["payment"] == {"paidOn": "2026-01-05", "amount": 110.0, "method": "transferencia"}
    assert [h["action"] for h in st["history"]] == ["pedido", "aprovado_nucleo", "aprovado", "pago"]
    assert all(set(h) == {"at", "action", "label"} for h in st["history"])  # sem nomes nem notas internas
    by_ref = (await api.get("/api/v1/partner/expenses", params={"externalRef": "ERP-2026-0001"})).json()
    assert by_ref["id"] == eid


async def test_credenciais_tokens_e_limites(mw):
    client = await new_client(mw, name="Outro sistema")
    cid, secret = client["clientId"], client["clientSecret"]
    c = mw.client()

    # Credenciais erradas, outra forma de pedido e HTTP Basic
    bad = await c.post("/api/v1/partner/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": "sfc_sk_errado"})
    assert bad.status_code == 401 and bad.json()["error"] == "invalid_client"
    assert (
        await c.post("/api/v1/partner/oauth/token", data={"grant_type": "password", "client_id": cid, "client_secret": secret})
    ).status_code == 400
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = await c.post("/api/v1/partner/oauth/token", data={"grant_type": "client_credentials"}, headers={"authorization": f"Basic {basic}"})
    assert r.status_code == 200, r.text
    r = await c.post("/api/v1/partner/oauth/token", json={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert (await fetch_one(mw.pool, "select count(*) as n from api_tokens where token_hash = %s", [token]))["n"] == 0  # só o hash

    api = mw.client()
    # Sem token / token inventado
    assert (await api.post("/api/v1/partner/expenses", json=expense(externalRef="X-1"))).status_code == 401
    api.headers["authorization"] = "Bearer sfc_at_inventado"
    assert (await api.get("/api/v1/partner/expenses/1")).status_code == 401
    api.headers["authorization"] = f"Bearer {token}"

    # Só os núcleos permitidos; validação igual à do backoffice
    r = await api.post("/api/v1/partner/expenses", json=expense(nucleo="futsal", externalRef="X-2"))
    assert r.status_code == 403 and r.json()["error"] == "nucleo_not_allowed"
    assert (await api.post("/api/v1/partner/expenses", json=expense(amount="-5", externalRef="X-3"))).status_code == 400
    assert (await api.post("/api/v1/partner/expenses", json=expense(externalRef="com espaço"))).status_code == 400

    # Não vê pedidos de outros clientes nem do backoffice
    diretor = await mw.login("diretor@serradofc.pt", "diretor2026")
    own = (await diretor.post("/api/v1/admin/expenses", json={k: v for k, v in expense().items() if k != "externalRef"})).json()
    assert (await api.get(f"/api/v1/partner/expenses/{own['id']}")).status_code == 404

    # Token expirado
    await execute(mw.pool, "update api_tokens set expires_at = now() - interval '1 minute'")
    assert (await api.get(f"/api/v1/partner/expenses/{own['id']}")).status_code == 401

    # Novo segredo: o antigo deixa de valer; revogar: nada vale
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    rotated = (await admin.post(f"/api/v1/admin/api-clients/{client['id']}/rotate")).json()
    assert rotated["clientSecret"] != secret
    bad = await c.post("/api/v1/partner/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret})
    assert bad.status_code == 401
    fresh = await get_token(mw, cid, rotated["clientSecret"])
    assert (await admin.post(f"/api/v1/admin/api-clients/{client['id']}/revoke")).json()["active"] is False
    api.headers["authorization"] = f"Bearer {fresh}"
    assert (await api.get("/api/v1/partner/expenses/1")).status_code == 401
    bad = await c.post(
        "/api/v1/partner/oauth/token", data={"grant_type": "client_credentials", "client_id": cid, "client_secret": rotated["clientSecret"]}
    )
    assert bad.status_code == 401

    # Só quem gere utilizadores mexe nas credenciais; o responsável tem de poder pedir gastos
    tesouraria = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tesouraria.get("/api/v1/admin/api-clients")).status_code == 403
    treinador = await fetch_one(mw.pool, "select id::text as id from users where email = 'treinador@serradofc.pt'")
    assert treinador
    r = await admin.post("/api/v1/admin/api-clients", json={"name": "Sem permissão", "userId": treinador["id"]})
    assert r.status_code == 400
    audit = await fetch(mw.pool, "select action from audit_log where entity = 'api_client' order by id")
    assert [a["action"] for a in audit][-3:] == ["create", "rotate_secret", "revoke"]


async def test_responsavel_sem_permissao_bloqueia_o_cliente(mw):
    client = await new_client(mw, name="Sistema da direção")
    token = await get_token(mw, client["clientId"], client["clientSecret"])
    await execute(mw.pool, "update users set disabled = true where email = 'diretor@serradofc.pt'")
    try:
        api = mw.client()
        api.headers["authorization"] = f"Bearer {token}"
        r = await api.post("/api/v1/partner/expenses", json=expense(externalRef="Y-1"))
        assert r.status_code == 403 and r.json()["error"] == "client_user_not_allowed"
    finally:
        await execute(mw.pool, "update users set disabled = false where email = 'diretor@serradofc.pt'")
