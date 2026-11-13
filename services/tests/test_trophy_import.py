"""Lista de inscritos da Xistarca: marca os atletas como inscritos na edição e cria os que faltam (dados fictícios)."""

from serrado.db.pool import fetch, fetch_one


async def test_lista_da_xistarca_marca_inscritos_e_cria_quem_falta(mw):
    ed = await fetch_one(mw.pool, "select id from race_editions where season = '2026/2027'")
    assert ed
    eid = ed["id"]
    # Atletas que já existem: um com CC, um só com nome e nascimento, um que pediu no site mas não está na lista
    for code, name, birth, cc in (
        ("SFC-8801", "Rita Lista Exemplo", "1990-01-02", "11111111"),
        ("SFC-8802", "Tiago de Lista Exemplo", "2012-05-06", None),
        ("SFC-8803", "Pedro Fora Exemplo", "1985-07-08", None),
    ):
        await fetch(
            mw.pool,
            "insert into athletes (code, name, birth_date, id_number, sport_slug) values (%s, %s, %s, %s, 'atletismo') returning id",
            [code, name, birth, cc],
        )
    pedro = await fetch_one(mw.pool, "select id from athletes where code = 'SFC-8803'")
    assert pedro
    await fetch(
        mw.pool,
        "insert into race_signups (edition_id, athlete_id, consent_at) values (%s, %s, now()) returning id",
        [eid, pedro["id"]],
    )
    rows = [
        # Mesmo CC, nome escrito de outra maneira
        {"name": "Rita L. Exemplo", "gender": "F", "idNumber": "11111111", "birthDate": "1990-01-02", "email": "rita@exemplo.pt", "phone": None},
        # Mesmo nome (sem partículas) e nascimento; a ficha não tinha CC nem email: a lista completa
        {
            "name": "Tiago Lista Exemplo",
            "gender": "M",
            "idNumber": "22222222",
            "birthDate": "2012-05-06",
            "email": "pais@exemplo.pt",
            "phone": "912345678",
        },
        # Não existe: é criado
        {"name": "Nova Atleta Exemplo", "gender": "F", "idNumber": "33333333", "birthDate": "2000-10-11", "email": None, "phone": "+351 913 333 333"},
        # Repetida
        {"name": "Rita Exemplo", "gender": "F", "idNumber": "11111111", "birthDate": "1990-01-02"},
        # Documento estrangeiro (passaporte): é guardado como está
        {"name": "Visitante Exemplo", "gender": "M", "idNumber": "x 12345", "birthDate": "1999-03-03"},
        # Documento que não serve (sem algarismos): cria sem documento, com aviso
        {"name": "Sem Documento Exemplo", "gender": "F", "idNumber": "ABC", "birthDate": "1998-04-04"},
    ]
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    url = f"/api/v1/admin/races/editions/{eid}/import"

    # Pré-visualização: não grava nada
    prev = (await sec.post(url, json={"rows": rows, "dryRun": True})).json()
    assert (prev["matched"], prev["created"], prev["marked"]) == (2, 3, 5)
    assert not await fetch(mw.pool, "select 1 from athletes where name = 'Nova Atleta Exemplo'")
    assert not await fetch(mw.pool, "select 1 from race_signups where status = 'inscrito' and edition_id = %s", [eid])

    out = (await sec.post(url, json={"rows": rows})).json()
    assert (out["rows"], out["matched"], out["created"], out["marked"], out["already"]) == (6, 2, 3, 5, 0)
    assert out["completed"] == 2  # Rita ganhou email; Tiago ganhou CC, email e telemóvel
    assert [s["row"] for s in out["skipped"]] == [4]
    assert [n["row"] for n in out["notes"]] == [6]
    assert [x["code"] for x in out["notInList"]] == ["SFC-8803"]
    assert sorted(out["createdNames"]) == ["Nova Atleta Exemplo", "Sem Documento Exemplo", "Visitante Exemplo"]
    vis = await fetch_one(mw.pool, "select id_number from athletes where name = 'Visitante Exemplo'")
    assert vis and vis["id_number"] == "X12345"

    tiago = await fetch_one(mw.pool, "select id_number, email, phone, gender from athletes where code = 'SFC-8802'")
    assert tiago and (tiago["id_number"], tiago["email"], tiago["phone"], tiago["gender"]) == (
        "22222222",
        "pais@exemplo.pt",
        "912345678",
        "Masculino",
    )
    nova = await fetch_one(mw.pool, "select sport_slug, phone, id_number from athletes where name = 'Nova Atleta Exemplo'")
    assert nova and (nova["sport_slug"], nova["phone"], nova["id_number"]) == ("atletismo", "913333333", "33333333")
    st = await fetch(
        mw.pool,
        "select a.name from race_signups s join athletes a on a.id = s.athlete_id where s.edition_id = %s and s.status = 'inscrito' order by a.name",
        [eid],
    )
    assert [x["name"] for x in st] == [
        "Nova Atleta Exemplo",
        "Rita Lista Exemplo",
        "Sem Documento Exemplo",
        "Tiago de Lista Exemplo",
        "Visitante Exemplo",
    ]

    # Repetir a mesma lista não cria nem marca de novo
    again = (await sec.post(url, json={"rows": rows})).json()
    assert (again["created"], again["marked"], again["already"]) == (0, 0, 5)

    # Treinador não pode
    tr = await mw.login("treinador@serradofc.pt", "treinador2026")
    assert (await tr.post(url, json={"rows": rows})).status_code == 403


async def test_codigo_novo_salta_os_codigos_ja_usados(mw):
    # Fichas importadas com código (SFC-0001…) não fazem avançar o contador: o próximo tem de saltar para depois do maior
    await fetch(mw.pool, "select setval('athlete_code_seq', 1, false)")
    top = await fetch_one(mw.pool, "select max(substring(code from '\\d+$')::int) as n from athletes where code ~ '^SFC-\\d+$'")
    start = int((top or {}).get("n") or 0)
    for n in range(start + 1, start + 61):
        await fetch(mw.pool, "insert into athletes (code, name) values (%s, %s) returning id", [f"SFC-{n:04d}", f"Ocupado Exemplo {n}"])
    ed = await fetch_one(mw.pool, "select id from race_editions where season = '2026/2027'")
    assert ed
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    out = await sec.post(
        f"/api/v1/admin/races/editions/{ed['id']}/import",
        json={"rows": [{"name": "Codigo Novo Exemplo", "gender": "M", "idNumber": "44444444", "birthDate": "1980-01-01"}]},
    )
    assert out.status_code == 200, out.text
    row = await fetch_one(mw.pool, "select code from athletes where name = 'Codigo Novo Exemplo'")
    assert row and row["code"] == f"SFC-{start + 61:04d}"


async def test_documento_estrangeiro_preenche_a_ficha_que_ficou_sem_ele(mw):
    # Importações antigas deixaram a ficha sem o passaporte: importar de novo preenche-o
    await fetch(
        mw.pool,
        "insert into athletes (code, name, birth_date, sport_slug) values ('SFC-7701', 'Estrangeiro Exemplo', '1990-09-09', 'atletismo') returning id",
    )
    ed = await fetch_one(mw.pool, "select id from race_editions where season = '2026/2027'")
    assert ed
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    out = (
        await sec.post(
            f"/api/v1/admin/races/editions/{ed['id']}/import",
            json={"rows": [{"name": "Estrangeiro Exemplo", "gender": "M", "idNumber": "123456", "birthDate": "1990-09-09"}]},
        )
    ).json()
    assert (out["matched"], out["completed"], out["notes"]) == (1, 1, [])
    row = await fetch_one(mw.pool, "select id_number from athletes where code = 'SFC-7701'")
    assert row and row["id_number"] == "123456"


async def test_filtro_de_atletas_por_inscricao_no_trofeu(mw):
    ed = await fetch_one(mw.pool, "select id from race_editions where active order by season desc limit 1")
    assert ed
    for code, name, status in (
        ("SFC-9101", "Filtro Inscrito Exemplo", "inscrito"),
        ("SFC-9102", "Filtro Pedido Exemplo", "pedido"),
        ("SFC-9103", "Filtro Cancelado Exemplo", "cancelado"),
        ("SFC-9104", "Filtro Sem Pedido Exemplo", None),
    ):
        a = await fetch_one(
            mw.pool,
            "insert into athletes (code, name, birth_date, sport_slug) values (%s, %s, '1990-01-01', 'atletismo') returning id",
            [code, name],
        )
        assert a
        if status:
            await fetch(
                mw.pool,
                "insert into race_signups (edition_id, athlete_id, consent_at, status) values (%s, %s, now(), %s) returning id",
                [ed["id"], a["id"], status],
            )
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")

    async def codes(trophy: str) -> set[str]:
        r = await sec.get("/api/v1/admin/athletes", params={"trophy": trophy})
        assert r.status_code == 200, r.text
        return {a["code"] for a in r.json() if a["code"].startswith("SFC-91")}

    assert await codes("inscrito") == {"SFC-9101"}
    assert await codes("pedido") == {"SFC-9102"}
    # O pedido cancelado conta como sem inscrição
    assert await codes("nenhum") == {"SFC-9103", "SFC-9104"}
    assert (await sec.get("/api/v1/admin/athletes", params={"trophy": "outro"})).status_code in (400, 422)


async def bib_of(mw) -> int | None:
    row = await fetch_one(
        mw.pool,
        "select s.bib from race_signups s join athletes a on a.id = s.athlete_id where a.id_number = '44444444'",
    )
    return row["bib"] if row else None


async def test_a_lista_guarda_o_dorsal(mw):
    ed = await fetch_one(mw.pool, "select id from race_editions where active order by season desc limit 1")
    assert ed
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    url = f"/api/v1/admin/races/editions/{ed['id']}/import"
    row = {"name": "Dorsal Importado Exemplo", "gender": "M", "idNumber": "44444444", "birthDate": "1991-02-03", "dorsal": 421}
    first = await sec.post(url, json={"rows": [row]})
    assert first.status_code == 200 and first.json()["dorsals"] == 1
    assert await bib_of(mw) == 421
    # A pré-visualização conta os dorsais sem os gravar
    prev = (await sec.post(url, json={"rows": [{**row, "dorsal": 500}], "dryRun": True})).json()
    assert prev["dorsals"] == 1 and await bib_of(mw) == 421
    # Voltar a importar com outro dorsal corrige-o; sem dorsal, deixa como está
    assert (await sec.post(url, json={"rows": [{**row, "dorsal": 422}]})).status_code == 200
    assert (await sec.post(url, json={"rows": [{k: v for k, v in row.items() if k != "dorsal"}]})).status_code == 200
    assert await bib_of(mw) == 422
    assert (await sec.post(url, json={"rows": [{**row, "dorsal": 0}]})).status_code in (400, 422)


async def test_email_com_o_dorsal_aos_inscritos(mw):
    ed = await fetch_one(mw.pool, "select id from race_editions where active order by season desc limit 1")
    assert ed
    eid = ed["id"]
    for code, name, birth, email, bib in (
        ("SFC-9301", "Mail Adulto Exemplo", "1990-01-02", "mail.adulto@exemplo.pt", 421),
        ("SFC-9302", "Mail Menor Exemplo", "2015-05-06", "pais.menor@exemplo.pt", 422),
        ("SFC-9303", "Mail SemEmail Exemplo", "1985-03-04", None, 423),
        ("SFC-9304", "Mail SemDorsal Exemplo", "1980-07-08", "sem.dorsal@exemplo.pt", None),
    ):
        a = await fetch_one(
            mw.pool,
            "insert into athletes (code, name, birth_date, email, sport_slug) values (%s, %s, %s, %s, 'atletismo') returning id",
            [code, name, birth, email],
        )
        assert a
        await fetch(
            mw.pool,
            "insert into race_signups (edition_id, athlete_id, consent_at, status, bib) values (%s, %s, now(), 'inscrito', %s) returning id",
            [eid, a["id"], bib],
        )
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    url = f"/api/v1/admin/races/editions/{eid}/dorsal-mail"

    async def sent(like: str):
        return await fetch(mw.pool, "select to_email, subject, html from email_outbox where to_email like %s order by id", [like])

    # Pré-visualização: só contagens, nada é enviado
    prev = (await sec.post(url, json={})).json()
    assert (prev["ready"], prev["dryRun"]) == (2, True)
    assert prev["noEmail"] >= 1  # há outros inscritos com dorsal e sem email, de testes anteriores
    assert "Mail SemDorsal Exemplo" in prev["noBibNames"] and "Mail SemEmail Exemplo" in prev["noEmailNames"]
    assert not await sent("%@exemplo.pt")

    # Teste: um exemplo para o endereço indicado; não marca ninguém
    test = (await sec.post(url, json={"testTo": "teste@exemplo.pt"})).json()
    assert test["test"] is True
    (t,) = await sent("teste@exemplo.pt")
    assert t["subject"].startswith("[TESTE] ") and "Dorsal n.º" in t["html"]
    assert not await fetch(mw.pool, "select 1 from race_signups where bib_email_at is not null")

    # Envio: um email por atleta, com o dorsal; o menor é tratado na terceira pessoa
    out = (await sec.post(url, json={"dryRun": False})).json()
    assert out["sent"] == 2
    (adult,) = await sent("mail.adulto@exemplo.pt")
    assert "Dorsal n.º 421" in adult["html"] and "Olá Mail," in adult["html"] and "Estás inscrito" in adult["html"]
    for text in ("a partir das 09h00", "Junta de Freguesia da Caparica", "bandeira do Serrado", "TAAMPC-2026.2027-TCaparica-Regulamento.pdf"):
        assert text in adult["html"]
    # Convite para o site e para a área do atleta (tempos e comparações)
    assert "Convidamos" not in adult["html"] and "Ver os meus tempos e comparações" in adult["html"] and "/area-atletas" in adult["html"]
    # O regulamento vem antes do fecho
    assert adult["html"].index("Ver o regulamento") < adult["html"].index("Contamos com todos")
    (minor,) = await sent("pais.menor@exemplo.pt")
    assert "Dorsal n.º 422" in minor["html"] and "O Mail está inscrito" in minor["html"]
    assert not await sent("sem.dorsal@exemplo.pt")

    # Cada um só recebe uma vez, a não ser que se peça para reenviar
    again = (await sec.post(url, json={"dryRun": False})).json()
    assert (again["sent"], again["already"]) == (0, 2)
    assert (await sec.post(url, json={"dryRun": False, "resend": True})).json()["sent"] == 2
    assert len(await sent("mail.adulto@exemplo.pt")) == 2


async def test_o_dorsal_aparece_na_ficha_e_na_area_do_atleta(mw):
    ed = await fetch_one(mw.pool, "select id from race_editions where active order by season desc limit 1")
    assert ed
    a = await fetch_one(
        mw.pool,
        "insert into athletes (code, name, birth_date, sport_slug) values ('SFC-9401', 'Ficha Dorsal Exemplo', '1992-02-02', 'atletismo') returning id",
    )
    assert a
    await fetch(
        mw.pool,
        "insert into race_signups (edition_id, athlete_id, consent_at, status, bib) values (%s, %s, now(), 'inscrito', 777) returning id",
        [ed["id"], a["id"]],
    )
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    ficha = (await sec.get(f"/api/v1/admin/athletes/{a['id']}")).json()
    assert ficha["trophy"]["bib"] == 777 and ficha["trophy"]["status"] == "inscrito"
    area = (await sec.get(f"/api/v1/athletes/{a['id']}/trophy")).json()
    assert area["signup"]["bib"] == 777
