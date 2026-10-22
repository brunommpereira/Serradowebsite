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
