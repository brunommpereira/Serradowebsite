"""Email a todos os atletas: contagens, teste, envio uma só vez por endereço e saudação (dados fictícios)."""

from serrado.db.pool import fetch

URL = "/api/v1/admin/athletes-mail"
CORPO = {
    "campaign": "campanha-teste-1",
    "subject": "Corrida e festa no Fresh",
    "paragraphs": ["Pedimos desculpa pelo transtorno.", "Domingo, 22, às 10h30, em frente ao Fresh."],
    "button": {"label": "Inscrever-me", "url": "https://www.serradofc.pt/eventos/abertura-da-epoca"},
    "button2": {"label": "Ver a notícia", "url": "https://www.serradofc.pt/noticias"},
    "sport": "xtestemail",
}


async def test_email_a_todos_os_atletas(mw):
    for code, name, birth, email in (
        ("SFC-9501", "Ana Adulta Exemplo", "1990-01-02", "ana.adulta@exemplo.pt"),
        ("SFC-9502", "Rui Menor Exemplo", "2015-05-06", "pais.familia@exemplo.pt"),
        ("SFC-9503", "Rita Menor Exemplo", "2016-06-07", "pais.familia@exemplo.pt"),  # mesmo endereço: um só email
        ("SFC-9504", "Sem Email Exemplo", "1985-03-04", None),
    ):
        await fetch(
            mw.pool,
            "insert into athletes (code, name, birth_date, email, sport_slug) values (%s, %s, %s, %s, 'xtestemail') returning id",
            [code, name, birth, email],
        )
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")

    async def sent(like: str):
        return await fetch(mw.pool, "select to_email, subject, html from email_outbox where to_email like %s order by id", [like])

    # Pré-visualização: só contagens, nada sai
    prev = (await sec.post(URL, json=CORPO)).json()
    assert (prev["athletes"], prev["ready"], prev["noEmail"], prev["dryRun"]) == (4, 2, 1, True)
    assert not await sent("%@exemplo.pt")

    # Teste: vai só para o endereço pedido e não marca nada
    t = (await sec.post(URL, json={**CORPO, "dryRun": False, "testTo": "teste@exemplo.pt"})).json()
    assert t["test"] and t["sentTo"] == "teste@exemplo.pt"
    assert [r["subject"] for r in await sent("teste@%")] == ["[TESTE] Corrida e festa no Fresh"]
    assert (await sec.post(URL, json=CORPO)).json()["ready"] == 2

    # Envio a sério: um por endereço, com o nome só nos adultos com endereço próprio
    out = (await sec.post(URL, json={**CORPO, "dryRun": False})).json()
    assert out["sent"] == 2
    adulto = (await sent("ana.adulta@%"))[0]
    assert "Olá Ana," in adulto["html"] and "Pedimos desculpa" in adulto["html"] and "Ver a notícia" in adulto["html"]
    familia = await sent("pais.familia@%")
    assert len(familia) == 1 and "Olá," in familia[0]["html"] and "Olá Rui" not in familia[0]["html"]

    # Segunda vez com a mesma campanha: ninguém volta a receber; com outra referência, sim
    again = (await sec.post(URL, json={**CORPO, "dryRun": False})).json()
    assert (again["sent"], again["already"]) == (0, 2)
    assert len(await sent("ana.adulta@%")) == 1
    novo = (await sec.post(URL, json={**CORPO, "campaign": "campanha-teste-2", "dryRun": False})).json()
    assert novo["sent"] == 2

    # Validação: endereço de botão sem https e campanha mal escrita
    assert (await sec.post(URL, json={**CORPO, "button": {"label": "Mau", "url": "http://x.pt/a"}})).status_code in (400, 422)
    assert (await sec.post(URL, json={**CORPO, "campaign": "Má campanha"})).status_code in (400, 422)
