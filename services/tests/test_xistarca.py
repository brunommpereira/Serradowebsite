"""Inscrições no Troféu de Almada pela Xistarca, contra um checkout Xistarca falso (em memória)."""

import json
from typing import Any
from urllib.parse import parse_qsl

import httpx
import pytest

from serrado.config import XistarcaConfig
from serrado.db.pool import execute, fetch, fetch_one
from serrado.xistarca import Edition, Person, XistarcaClient, XistarcaError, fill_block, parse, run, submit
from tests.conftest import Middleware

PASSWORD = "p@ss-secreta$do-clube"
CFG = XistarcaConfig(email="clube@serradofc.pt", password=PASSWORD)
URL = "https://checkout.xistarca.pt/evento/trofeu-de-almada-2026-2027"


def block(alea: str) -> str:
    """Bloco de atleta como o devolve ajax/adiciona_atleta.php (resumido)."""
    p = f"[739][{alea}]"
    return f"""
<div class="cont-atleta controle_contagem_739" id="atleta_{alea}">
  <input type="text" name="f_codigo_xistarca{p}" id="f_registro_atleta_{alea}" value="">
  <input type="hidden" name="f_pre_preenchido{p}" value="n">
  <input type="radio" name="f_paratleta{p}" value="n" checked=""><input type="radio" name="f_paratleta{p}" value="s">
  <select name="f_federado{p}"><option value="n">Não federado</option><option value="s">Federado</option></select>
  <input type="radio" name="f_sexo{p}" value="m"><input type="radio" name="f_sexo{p}" value="f">
  <input type="date" name="f_data_nascimento{p}"><input type="text" name="f_nome{p}"><input type="email" name="f_email{p}">
  <input type="tel" name="f_telefone{p}"><select name="f_pais{p}"><option value="Portugal">Portugal</option></select>
  <input type="text" name="f_bbci{p}"><input type="text" name="f_nome_acidente{p}" value=""><input type="tel" name="f_telefone_acidente{p}" value="">
  <label>Nome da equipa</label><input name="f_nome_equipe{p}" type="text" value="">
  <input type="radio" value="s" name="f_participou_evento{p}"><input type="radio" value="n" name="f_participou_evento{p}" checked>
  <div><label for="">Localidade de Residência</label><div><input type="text" name="f_campo_personalizado{p}[190]" value=""></div></div>
  <div><label for="">Clube/Coletividade/Associação/Ensino Superior de Almada</label>
   <select name="f_campo_personalizado{p}[191]"><option value="1317">Não Aplicável</option><option value="1327">Serrado FC / Outdoor Training Camp</option></select></div>
</div>"""


class FakeXistarca:
    def __init__(self) -> None:
        self.closed = False
        self.logged = False
        self.next_alea = 1000
        self.validated: list[dict[str, str]] = []
        self.checkout: dict[str, str] | None = None
        self.paid: dict[str, str] | None = None
        self.total = "0,00"
        self.requests: list[str] = []
        self.bodies: list[str] = []

    def alea(self) -> str:
        self.next_alea += 1
        return str(self.next_alea)

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        body = request.content.decode()
        self.requests.append(f"{request.method} {path}")
        self.bodies.append(body)
        data = dict(parse_qsl(body, keep_blank_values=True))
        if path == "/evento/trofeu-de-almada-2026-2027":
            inner = (
                "<h2>Inscrições encerradas!</h2>"
                if self.closed
                else '<label>Troféu de Almada</label><input type="number" name="f_f_739" id="f_f_739" value="0">'
            )
            return httpx.Response(
                200,
                text=f'<div class="descricao">\n<h1>TROFÉU DE ALMADA 2026/2027</h1></div><form id="form-inscricoes" action="checkout-inscricao?id=20500" method="POST">{inner}</form>',
            )
        if path == "/ajax/include-popup-login.php":
            ok = data.get("f_email") == CFG.email and data.get("f_senha") == PASSWORD and data.get("acao") == "login"
            self.logged = ok
            return httpx.Response(200, text=json.dumps({"js_msg": "" if ok else "Email ou palavra-passe errados"}))
        if not self.logged:
            return httpx.Response(200, text="<p>Sessão expirada</p>")
        if path == "/checkout-inscricao":
            assert data.get("f_f_739") == "1"
            return httpx.Response(
                200,
                text=f'<form id="form-checkout-inscricao" action=""><input type="hidden" name="f_id_evento" value="20500">{block(self.alea())}</form>',
            )
        if path == "/ajax/adiciona_atleta.php":
            return httpx.Response(200, text=block(self.alea()))
        if path == "/ajax/busca_usuarios.php":
            if data["usuario"] == "rita.conta@exemplo.pt":
                return httpx.Response(
                    200,
                    text=json.dumps(
                        {
                            "nome": "RITA EXEMPLO",
                            "email": "r***@exemplo.pt",
                            "email_cripto": "ENC-EMAIL",
                            "telefone_cripto": "ENC-TEL",
                            "bicc_cripto": "ENC-CC",
                            "pais": "Portugal",
                            "sexo": "f",
                            "paratleta": "n",
                            "data_nascimento": "1985-04-21",
                            "nome_contactar_acidente": "Pedro",
                            "telefone_contactar_acidente": "930000000",
                            "federado": "n",
                            "socio": "n",
                        }
                    ),
                )
            return httpx.Response(200, text=json.dumps({"erro": "Código inválido"}))
        if path == "/ajax/valida_atleta.php":
            fields = {k.split("[")[0]: v for k, v in data.items()}
            self.validated.append(fields)
            if fields.get("f_nome") == "João Exemplo" and fields.get("f_email") == "joao@exemplo.pt":
                return httpx.Response(200, text=json.dumps({"js_msg": "usuario_modalidade_registrado", "js_status": "1"}))
            needed = ("f_nome", "f_sexo", "f_data_nascimento", "f_bbci", "f_nome_acidente", "f_telefone_acidente")
            if any(not fields.get(k) for k in needed) or data.get("f_id_evento") != "20500":
                return httpx.Response(200, text=json.dumps({"js_msg": "Preencha todos os campos obrigatórios"}))
            return httpx.Response(200, text=json.dumps({"js_msg": ""}))
        if path == "/ajax/checkout-inscricao.php":
            self.checkout = data
            return httpx.Response(200, text=json.dumps({"js_url": "id=20500&c=ab12"}))
        if path == "/checkout-adicionais":
            return httpx.Response(
                200,
                text='<form id="form-checkout-adicionais" action="checkout-pagamento"><input type="radio" name="f_doacao" value="0" checked></form>',
            )
        if path == "/checkout-pagamento":
            return httpx.Response(
                200,
                text=f'<p>Total a pagar: {self.total} €</p><form id="form-checkout-pagamento" action="checkout-agradecimento">'
                '<input type="checkbox" id="f_termos_1" name="f_termos_1" value="s"><input type="hidden" name="f_id_compra" value="77"></form>',
            )
        if path == "/ajax/checkout-pagamento.php":
            self.paid = data
            return httpx.Response(
                200, text=json.dumps({"js_acao": "Redirect", "js_msg": "ok", "js_url": "https://checkout.xistarca.pt/checkout-agradecimento?id=77"})
            )
        if path == "/checkout-agradecimento":
            return httpx.Response(200, text="<h2>Obrigado</h2>")
        return httpx.Response(404, text="?")


@pytest.fixture
def fake() -> FakeXistarca:
    return FakeXistarca()


def client_for(fake: FakeXistarca, cfg: XistarcaConfig = CFG) -> XistarcaClient:
    return XistarcaClient(cfg, transport=httpx.MockTransport(fake.handler))


def edition(mode: str = "test") -> Edition:
    return Edition(1, "2026/2027", "Troféu de Almada 2026/2027", URL, "", "Serrado FC", "Serrado FC / Outdoor Training Camp", mode)


def person(key: str = "1", **kw: Any) -> Person:
    from datetime import date

    base: dict[str, Any] = {
        "key": key,
        "name": "Inês Exemplo",
        "birth_date": date(2013, 7, 2),
        "gender": "Feminino",
        "email": "",
        "phone": "+351 910 000 000",
        "id_number": "30987654",
        "city": "Charneca da Caparica",
        "emergency_name": "Avó Exemplo",
        "emergency_phone": "920000000",
    }
    return Person(**{**base, **kw})


def test_bloco_preenchido_com_clube_localidade_e_equipa() -> None:
    controls = parse(block("55")).loose
    data = fill_block(controls, "739", "55", person(), edition(), "", None)
    assert data["f_nome[739][55]"] == "Inês Exemplo"
    assert data["f_sexo[739][55]"] == "f"
    assert data["f_data_nascimento[739][55]"] == "2013-07-02"
    assert data["f_telefone[739][55]"] == "910000000"
    assert data["f_campo_personalizado[739][55][191]"] == "1327"
    assert data["f_campo_personalizado[739][55][190]"] == "Charneca da Caparica"
    assert data["f_nome_equipe[739][55]"] == "Serrado FC"
    assert data["f_participou_evento[739][55]"] == "n"  # valores por omissão da página mantêm-se


async def test_modo_teste_valida_na_xistarca_e_nao_submete(fake: FakeXistarca) -> None:
    people = [person("1"), person("2", name="Tomás Exemplo", gender="Masculino", emergency_name=None)]
    outcomes, note = await submit(CFG, edition("test"), people, client_for(fake))
    by = {o.key: o for o in outcomes}
    assert by["1"].status == "validado"
    assert by["2"].status == "erro" and "contacto de emergência" in by["2"].message
    assert note == "modo de teste"
    assert fake.checkout is None and fake.paid is None


async def test_modo_real_inscreve_varios_numa_so_compra(fake: FakeXistarca) -> None:
    people = [
        person("1"),
        person("2", name="Rita Exemplo", email="rita.conta@exemplo.pt", birth_date=None),
        person("3", name="Ana Exemplo", id_number="12345679"),
    ]
    # A Rita não tem data de nascimento na ficha: falta → não vai
    outcomes, _ = await submit(CFG, edition("live"), people, client_for(fake))
    by = {o.key: o for o in outcomes}
    assert by["1"].status == by["3"].status == "inscrito"
    assert by["2"].status == "erro"
    assert fake.checkout is not None
    names = sorted(v for k, v in fake.checkout.items() if k.startswith("f_nome[739]"))
    assert names == ["Ana Exemplo", "Inês Exemplo"]
    assert fake.checkout["f_id_evento"] == "20500"
    assert fake.paid is not None and fake.paid["f_termos_1"] == "s"
    assert fake.requests.count("POST /ajax/adiciona_atleta.php") == 1  # o 1.º bloco já vem na página


async def test_quem_tem_conta_xistarca_e_importado(fake: FakeXistarca) -> None:
    outcomes, _ = await submit(CFG, edition("test"), [person("1", name="Rita Exemplo", email="rita.conta@exemplo.pt")], client_for(fake))
    assert outcomes[0].status == "validado" and outcomes[0].imported
    sent = fake.validated[-1]
    assert sent["f_email"] == "ENC-EMAIL" and sent["f_pre_preenchido"] == "s" and sent["f_codigo_xistarca"] == "rita.conta@exemplo.pt"


async def test_ja_inscrito_na_xistarca_conta_como_inscrito(fake: FakeXistarca) -> None:
    outcomes, note = await submit(CFG, edition("live"), [person("9", name="João Exemplo", email="joao@exemplo.pt")], client_for(fake))
    assert outcomes[0].status == "ja_inscrito"
    assert note == "nenhum atleta aceite" and fake.checkout is None


async def test_evento_fechado_e_password_errada_sem_mostrar_a_password(fake: FakeXistarca) -> None:
    fake.closed = True
    with pytest.raises(XistarcaError, match="encerradas"):
        await submit(CFG, edition("live"), [person()], client_for(fake))
    fake.closed = False
    with pytest.raises(XistarcaError) as e:
        await submit(XistarcaConfig(CFG.email, "errada"), edition("live"), [person()], client_for(fake, XistarcaConfig(CFG.email, "errada")))
    assert "login recusado" in str(e.value) and PASSWORD not in str(e.value) and "errada" not in str(e.value)


async def test_nunca_paga_se_o_valor_nao_for_zero(fake: FakeXistarca) -> None:
    fake.total = "12,50"
    with pytest.raises(XistarcaError, match="12.50"):
        await submit(CFG, edition("live"), [person()], client_for(fake))
    assert fake.paid is None


async def test_so_aceita_eventos_da_xistarca(fake: FakeXistarca) -> None:
    ed = edition()
    ed.event_url = "https://outro-site.pt/evento/x"
    with pytest.raises(XistarcaError, match="checkout.xistarca.pt"):
        await submit(CFG, ed, [person()], client_for(fake))


# ------------------------------------------------------------------ API e fila
async def _ids(mw: Middleware) -> dict[str, str]:
    rows = await fetch(mw.pool, "select id, name from athletes")
    return {r["name"]: str(r["id"]) for r in rows}


async def test_area_do_atleta_sem_edicao(mw: Middleware) -> None:
    c = await mw.login("atleta@exemplo.pt", "atleta2026")
    rita = (await _ids(mw))["Rita Exemplo"]
    r = await c.get(f"/api/v1/athletes/{rita}/trophy")
    assert r.status_code == 200 and r.json()["edition"] is None


async def test_backoffice_cria_edicao_e_provas(mw: Middleware) -> None:
    adm = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    body = {"season": "2026/2027", "name": "Troféu de Almada 2026/2027", "eventUrl": URL, "mode": "test"}
    r = await adm.post("/api/v1/admin/races/editions", json=body)
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert (await adm.post("/api/v1/admin/races/editions", json={**body, "eventUrl": "https://mau.pt/evento/x"})).status_code == 400
    races = [
        {"round": 1, "name": "GP Clube do Sargento da Armada", "raceDate": "2026-11-08", "location": "Almada"},
        {"round": 2, "name": "Corrida da Charneca", "raceDate": "2026-12-06"},
    ]
    r = await adm.put(f"/api/v1/admin/races/editions/{eid}/calendar", json={"races": races})
    assert r.status_code == 200 and r.json() == {"races": 2}
    r = await adm.get("/api/v1/admin/races/editions")
    data = r.json()
    assert data["configured"] is False
    assert [x["name"] for x in data["editions"][0]["races"]] == ["GP Clube do Sargento da Armada", "Corrida da Charneca"]
    # Sem permissão
    treino = await mw.login("treinador@serradofc.pt", "treinador2026")
    assert (await treino.get("/api/v1/admin/races/editions")).status_code == 403


async def test_atleta_pede_inscricao_com_autorizacao(mw: Middleware) -> None:
    c = await mw.login("atleta@exemplo.pt", "atleta2026")
    rita = (await _ids(mw))["Rita Exemplo"]
    r = await c.get(f"/api/v1/athletes/{rita}/trophy")
    t = r.json()
    assert t["edition"]["season"] == "2026/2027" and t["canSignup"] and t["missing"] == [] and len(t["races"]) == 2
    assert (await c.post(f"/api/v1/athletes/{rita}/trophy/signup", json={})).status_code == 400  # sem autorização
    r = await c.post(f"/api/v1/athletes/{rita}/trophy/signup", json={"consent": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pedido" and r.json()["queued"] is False  # sem conta Xistarca configurada nos testes
    assert (await c.post(f"/api/v1/athletes/{rita}/trophy/signup", json={"consent": True})).status_code == 409
    assert (await c.get(f"/api/v1/athletes/{rita}/trophy")).json()["signup"]["status"] == "pedido"
    # Não pode pedir por atletas de outros
    ines = (await _ids(mw))["Inês Exemplo"]
    assert (await c.post(f"/api/v1/athletes/{ines}/trophy/signup", json={"consent": True})).status_code == 403


async def test_encarregado_completa_o_que_falta_na_ficha(mw: Middleware) -> None:
    c = await mw.login("socio@exemplo.pt", "serrado1978")
    tomas = (await _ids(mw))["Tomás Exemplo"]
    t = (await c.get(f"/api/v1/athletes/{tomas}/trophy")).json()
    assert t["missing"] == ["emergency"]
    r = await c.post(f"/api/v1/athletes/{tomas}/trophy/signup", json={"consent": True})
    assert r.status_code == 422 and "contacto de emergência" in r.json()["message"]
    r = await c.post(
        f"/api/v1/athletes/{tomas}/trophy/signup",
        json={"consent": True, "emergencyName": "Avô Exemplo", "emergencyPhone": "910000009", "idNumber": "99999999"},
    )
    assert r.status_code == 200, r.text
    a = await fetch_one(mw.pool, "select emergency_name, id_number from athletes where id = %s", [tomas])
    assert a is not None and a["emergency_name"] == "Avô Exemplo"
    assert a["id_number"] == "31234567"  # o CC que já existia não é alterado por aqui
    # Cancelar antes de estar inscrito
    assert (await c.delete(f"/api/v1/athletes/{tomas}/trophy/signup")).status_code == 200
    assert (await c.get(f"/api/v1/athletes/{tomas}/trophy")).json()["signup"]["status"] == "cancelado"


async def test_fila_envia_e_atualiza_os_estados(mw: Middleware, fake: FakeXistarca) -> None:
    adm = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    ids = await _ids(mw)
    eid = (await fetch_one(mw.pool, "select id from race_editions where season = '2026/2027'"))["id"]  # type: ignore[index]
    r = await adm.post(f"/api/v1/admin/races/editions/{eid}/signups", json={"athleteIds": [ids["Inês Exemplo"], ids["Rita Exemplo"]]})
    assert r.json()["added"] == 1  # a Rita já tinha pedido
    # Modo de teste: valida e fica «validado»
    s = await run(mw.pool, CFG, client_for(fake))
    assert s["ok"] == 2 and fake.checkout is None
    rows = {r["name"]: r for r in (await adm.get(f"/api/v1/admin/races/editions/{eid}/signups")).json()}
    assert rows["Inês Exemplo"]["status"] == rows["Rita Exemplo"]["status"] == "validado"
    assert "idNumber" not in rows["Inês Exemplo"]  # a lista não expõe o CC
    # Passa a modo real: os validados são submetidos
    await execute(mw.pool, "update race_editions set mode = 'live' where id = %s", [eid])
    fake2 = FakeXistarca()
    s = await run(mw.pool, CFG, client_for(fake2))
    assert s["ok"] == 2 and fake2.checkout is not None
    rows = {r["name"]: r for r in (await adm.get(f"/api/v1/admin/races/editions/{eid}/signups?status=inscrito")).json()}
    assert set(rows) == {"Inês Exemplo", "Rita Exemplo"}
    # Na área do atleta aparece como inscrita
    c = await mw.login("atleta@exemplo.pt", "atleta2026")
    assert (await c.get(f"/api/v1/athletes/{ids['Rita Exemplo']}/trophy")).json()["signup"]["status"] == "inscrito"
    # Já inscrita: não se cancela pela área do atleta
    assert (await c.delete(f"/api/v1/athletes/{ids['Rita Exemplo']}/trophy/signup")).status_code == 409


async def test_erro_da_xistarca_fica_no_pedido_e_pode_repetir(mw: Middleware, fake: FakeXistarca) -> None:
    adm = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    ids = await _ids(mw)
    eid = (await fetch_one(mw.pool, "select id from race_editions where season = '2026/2027'"))["id"]  # type: ignore[index]
    await adm.post(f"/api/v1/admin/races/editions/{eid}/signups", json={"athleteIds": [ids["Tomás Exemplo"]]})
    fake.closed = True
    s = await run(mw.pool, CFG, client_for(fake))
    assert s["errors"] == 1 and "encerradas" in s["note"]
    row = (await adm.get(f"/api/v1/admin/races/editions/{eid}/signups?status=erro")).json()[0]
    assert row["name"] == "Tomás Exemplo" and "encerradas" in row["message"] and row["attempts"] == 1
    r = await adm.post(f"/api/v1/admin/races/signups/{row['id']}/retry")
    assert r.status_code == 200 and r.json()["status"] == "pedido"
    r = await adm.post(f"/api/v1/admin/races/signups/{row['id']}/done")
    assert r.json()["status"] == "inscrito"
    assert (await adm.post(f"/api/v1/admin/races/signups/{row['id']}/cancel")).status_code == 409
    # Enviar já: sem conta configurada, explica
    r = await adm.post("/api/v1/admin/races/run")
    assert r.status_code == 409 and "serrado xistarca" in r.json()["message"]
