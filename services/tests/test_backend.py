"""Backend (/internal/v1): segurança entre serviços, sessão, CMS, atletas, resultados, sócios e gestão."""

import psycopg
import pytest

from serrado.db.pool import fetch, fetch_one

EDITOR = {"email": "editor@serradofc.pt", "roles": "editor"}
SECRETARIA = {"email": "secretaria@serradofc.pt", "roles": "secretaria"}
SOCIO = {"email": "socio@exemplo.pt"}
ADMIN = {"email": "admin@serradofc.pt", "roles": "admin"}
COACH = {"email": "treinador@serradofc.pt", "roles": "treinador"}


@pytest.fixture(scope="module")
def call(backend_env):
    return backend_env[1]


@pytest.fixture(scope="module")
def pool(backend_env):
    return backend_env[0]


async def athlete_id(pool, code: str) -> str:
    row = await fetch_one(pool, "select id from athletes where code = %s", [code])
    assert row
    return row["id"]


# ---------------------------------------------------------------- segurança entre serviços
async def test_sem_token_de_servico_401(call):
    r = await call.client.get("/internal/v1/cms/news")
    assert r.status_code == 401
    assert r.json()["error"] == "invalid_service_token"


async def test_health_nao_precisa_de_token(call):
    assert (await call.client.get("/internal/health")).status_code == 200


# ---------------------------------------------------------------- autenticação
async def test_login_por_email_e_por_numero_de_socio(call):
    a = await call("POST", "/auth/verify", json={"login": "Socio@Exemplo.pt", "password": "serrado1978"})
    assert a.status_code == 200
    assert a.json()["member"]["memberNumber"] == "00482"
    assert len(a.json()["athletes"]) == 2
    b = await call("POST", "/auth/verify", json={"login": "482", "password": "serrado1978"})
    assert b.json()["email"] == "socio@exemplo.pt"


async def test_password_errada_ou_conta_inexistente_401_igual(call):
    assert (await call("POST", "/auth/verify", json={"login": "socio@exemplo.pt", "password": "x"})).status_code == 401
    assert (await call("POST", "/auth/verify", json={"login": "ninguem@exemplo.pt", "password": "x"})).status_code == 401


async def test_atleta_nao_socio_member_null(call):
    r = await call("POST", "/auth/verify", json={"login": "joao@exemplo.pt", "password": "atleta2026"})
    assert r.json()["member"] is None
    assert [a["role"] for a in r.json()["athletes"]] == ["atleta"]


# ---------------------------------------------------------------- CMS
async def test_publico_so_ve_publicados_editor_ve_rascunhos(call):
    pub = await call("GET", "/cms/news")
    assert all(n["status"] == "published" for n in pub.json()["items"])
    drafts = await call("GET", "/cms/news?status=draft", EDITOR)
    assert drafts.json()["total"] == 1
    assert (await call("GET", "/cms/news/slug/rascunho-gala-anual")).status_code == 404


async def test_fluxo_editorial_criar_publicar_editar_repor(call):
    created = await call(
        "POST", "/cms/news", EDITOR, {"slug": "teste-cms", "title": "Primeira versão", "category": "Clube", "summary": "Resumo", "body": "Texto"}
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]
    assert created.json()["status"] == "draft"
    assert (await call("POST", f"/cms/news/{entry_id}/publish", EDITOR)).json()["status"] == "published"
    assert (await call("GET", "/cms/news/slug/teste-cms")).status_code == 200
    await call(
        "PUT",
        f"/cms/news/{entry_id}",
        EDITOR,
        {"slug": "teste-cms", "title": "Segunda versão", "category": "Clube", "summary": "Resumo", "body": "Texto novo"},
    )
    revs = (await call("GET", f"/cms/news/{entry_id}/revisions", EDITOR)).json()
    assert len(revs) == 2
    first = revs[-1]
    restored = await call("POST", f"/cms/news/{entry_id}/revisions/{first['id']}/restore", EDITOR)
    assert restored.json()["title"] == "Primeira versão"
    assert restored.json()["status"] == "published", "repor uma versão não altera o estado de publicação"


async def test_validacao_e_conflitos(call):
    assert (await call("POST", "/cms/news", EDITOR, {"slug": "Slug Inválido", "title": "x", "category": "Clube"})).status_code == 400
    assert (await call("POST", "/cms/news", EDITOR, {"slug": "nova-epoca-futsal", "title": "x", "category": "Clube"})).status_code == 409
    assert (await call("POST", "/cms/news", EDITOR, {"slug": "ok-slug", "title": "x", "category": "Inexistente"})).status_code == 400
    assert (await call("POST", "/cms/news", EDITOR, {"slug": "ok-slug", "title": "x", "category": "Clube", "extra": 1})).status_code == 400
    assert (await call("GET", "/cms/videos")).json()["error"] == "unknown_type"


async def test_so_editor_ou_admin_escreve(call):
    assert (await call("POST", "/cms/pages", SECRETARIA, {"slug": "x", "title": "x"})).status_code == 403
    assert (await call("POST", "/cms/pages", SOCIO, {"slug": "x", "title": "x"})).status_code == 403


async def test_eventos_data_local_e_campos_numericos(call):
    r = await call(
        "POST",
        "/cms/events",
        EDITOR,
        {
            "slug": "torneio-teste",
            "title": "Torneio",
            "kind": "Torneio",
            "startsAt": "2026-12-05T10:00",
            "location": "Pavilhão",
            "capacity": 40,
            "price": 5,
        },
    )
    assert r.status_code == 201
    assert r.json()["startsAt"] == "2026-12-05T10:00"
    assert r.json()["price"] == 5
    assert isinstance(r.json()["price"], int)


# ---------------------------------------------------------------- atletas
async def test_encarregado_ve_so_os_educandos_staff_ve_todos(call):
    mine = (await call("GET", "/athletes", SOCIO)).json()
    assert sorted(a["code"] for a in mine) == ["SFC-0001", "SFC-0002"]
    assert (await call("GET", "/athletes?scope=all", SOCIO)).status_code == 403
    assert len((await call("GET", "/athletes?scope=all", SECRETARIA)).json()) == 4
    pending = [a["code"] for a in (await call("GET", "/athletes?scope=all&pending=confirm", SECRETARIA)).json()]
    assert "SFC-0001" in pending and "SFC-0004" not in pending


async def test_sem_acesso_a_atleta_alheio(call, pool):
    rita = await athlete_id(pool, "SFC-0003")
    assert (await call("GET", f"/athletes/{rita}", SOCIO)).status_code == 403
    assert (await call("PATCH", f"/athletes/{rita}", SOCIO, {"phone": "910000009"})).status_code == 403


async def test_treinador_ve_a_ficha_sem_dados_sensiveis_e_nao_altera(call, pool):
    tomas = await athlete_id(pool, "SFC-0001")
    r = (await call("GET", f"/athletes/{tomas}", COACH)).json()
    assert "taxNumber" not in r
    assert "idNumber" not in r
    assert r["name"] == "Tomás Exemplo"
    assert (await call("PATCH", f"/athletes/{tomas}", COACH, {"phone": "910000009"})).status_code == 403


async def test_ficha_alterar_contactos_e_confirmar_so_com_a_ficha_completa(call, pool):
    tomas = await athlete_id(pool, "SFC-0001")
    incomplete = await call("POST", f"/athletes/{tomas}/confirm", SOCIO)
    assert incomplete.status_code == 422
    assert "Contacto de emergência" in incomplete.json()["message"]
    assert (await call("PATCH", f"/athletes/{tomas}", SOCIO, {"emergencyName": "Mãe Exemplo", "emergencyPhone": "910000003"})).status_code == 200
    assert (await call("PATCH", f"/athletes/{tomas}", SOCIO, {"name": "Outro"})).status_code == 400, "nome não é editável diretamente"
    assert (await call("PATCH", f"/athletes/{tomas}", SOCIO, {})).status_code == 400
    assert (await call("PATCH", f"/athletes/{tomas}", SOCIO, {"phone": "123"})).json()["error"] == "invalid_phone"
    assert (await call("POST", f"/athletes/{tomas}/confirm", SOCIO)).status_code == 200
    assert (await call("GET", f"/athletes/{tomas}", SOCIO)).json()["confirmed"] is True


async def test_identificacao_pedido_e_aprovacao_pela_secretaria(call, pool):
    tomas = await athlete_id(pool, "SFC-0001")
    assert (await call("POST", f"/athletes/{tomas}/change-requests", SOCIO, {"changes": {"taxNumber": "123456788"}})).status_code == 400, (
        "NIF inválido"
    )
    created = await call("POST", f"/athletes/{tomas}/change-requests", SOCIO, {"changes": {"name": "Tomás Miguel Exemplo", "taxNumber": "123456789"}})
    assert created.status_code == 201
    req_id = created.json()["id"]
    assert (await call("POST", f"/change-requests/{req_id}/approve", SOCIO)).status_code == 403
    assert (await call("POST", f"/change-requests/{req_id}/approve", SECRETARIA)).status_code == 200
    after = await fetch_one(pool, "select name, tax_number from athletes where id = %s", [tomas])
    assert after == {"name": "Tomás Miguel Exemplo", "tax_number": "123456789"}
    assert (await call("POST", f"/change-requests/{req_id}/approve", SECRETARIA)).status_code == 404, "não aprova duas vezes"


async def test_a_base_de_dados_recusa_mudar_a_identificacao_fora_de_um_pedido(pool):
    with pytest.raises(psycopg.Error, match="identity_locked"):
        await fetch(pool, "update athletes set name = 'X' where code = 'SFC-0002'")


async def test_documentos_rejeitar_exige_motivo(call):
    docs = (await call("GET", "/documents", SECRETARIA)).json()
    assert len(docs) >= 1
    assert (await call("POST", f"/documents/{docs[0]['id']}/reject", SECRETARIA, {})).status_code == 400
    assert (await call("POST", f"/documents/{docs[0]['id']}/reject", SECRETARIA, {"note": "Ilegível"})).json()["status"] == "Rejeitado"


# ---------------------------------------------------------------- resultados, sócios e gestão
async def test_importacao_idempotente_de_resultados(call):
    rows = [
        {
            "athleteCode": "SFC-0004", "athleteName": "JOÃO EXEMPLO", "birthYear": 1996, "season": "2024/2025", "round": 4, "race": "30º GPA Charneca",
            "raceBase": "GPA Charneca da Caparica", "raceDate": "2025-03-16", "category": "Seniores", "place": 20, "time": "35:00.00", "timeS": 2100,
            "distanceM": 7800, "trophyPoints": 1,
        }
    ]  # fmt: skip
    first = (await call("POST", "/results/import", SECRETARIA, {"rows": rows})).json()
    assert [first["inserted"], first["linked"]] == [1, 1]
    again = (await call("POST", "/results/import", SECRETARIA, {"rows": rows})).json()
    assert [again["inserted"], again["updated"]] == [0, 1]
    assert (await call("POST", "/results/import", EDITOR, {"rows": rows})).status_code == 403


async def test_quotas_o_proprio_socio_ou_a_secretaria(call):
    assert (await call("GET", "/members/00482/quotas", SOCIO)).json()[0]["status"] == "Pendente"
    assert (await call("GET", "/members/00731/quotas", SOCIO)).status_code == 403
    assert (await call("GET", "/members/00731/quotas", SECRETARIA)).status_code == 200


async def test_estatisticas_e_auditoria(call):
    stats = (await call("GET", "/stats", EDITOR)).json()
    assert isinstance(stats["newsPublished"], int)
    assert (await call("GET", "/stats", SOCIO)).status_code == 403
    log = (await call("GET", "/audit", ADMIN)).json()
    assert any(entry["action"] == "change_requests.approve" for entry in log)
    own = (await call("GET", "/audit", EDITOR)).json()
    assert all(entry["actor"] == "Equipa de Comunicação" for entry in own)


async def test_papeis_admin_gere_nao_pode_retirar_o_proprio_admin(call):
    users = call.users
    assert (await call("PUT", f"/users/{users['joao@exemplo.pt']}/roles", ADMIN, {"roles": ["treinador"]})).status_code == 200
    assert (await call("PUT", f"/users/{users['admin@serradofc.pt']}/roles", ADMIN, {"roles": ["editor"]})).status_code == 403
    assert (await call("PUT", f"/users/{users['joao@exemplo.pt']}/roles", EDITOR, {"roles": ["admin"]})).status_code == 403
