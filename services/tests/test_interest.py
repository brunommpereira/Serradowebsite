"""Pré-inscrições (ex.: Escola de Futsal): formulário público, emails e acompanhamento no backoffice."""

import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch, fetch_one
from tests.conftest import XHR


def form(**extra: object) -> dict:
    return {
        "sport": "futsal",
        "childName": "Tiago Exemplo Pequeno",
        "birthDate": "2018-05-04",
        "guardianName": "Marta Exemplo",
        "email": "Marta@Exemplo.pt",
        "phone": "912 345 678",
        "notes": "Pode treinar às terças.",
        "consent": True,
        "website": "",
        **extra,
    }


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def test_pre_inscricao_publica_com_emails(mw, mail_on):
    await execute(mw.pool, "delete from email_outbox")
    c = mw.client("10.8.0.1")
    c.headers.update({**XHR, "user-agent": "Browser/1.0"})
    r = await c.post("/api/v1/interest", json=form())
    assert r.status_code == 201, r.text
    assert r.json()["duplicate"] is False
    row = await fetch_one(mw.pool, "select * from interest_signups where id = %s", [r.json()["id"]])
    assert row and (row["email"], row["phone"], row["status"], row["ip"], row["user_agent"]) == (
        "marta@exemplo.pt",
        "912345678",
        "novo",
        "10.8.0.1",
        "Browser/1.0",
    )
    mails = await fetch(mw.pool, "select to_email, subject from email_outbox order by id")
    assert [m["to_email"] for m in mails] == ["marta@exemplo.pt", "site@serradofc.pt"]
    assert "Pré-inscrição recebida" in mails[0]["subject"] and "Tiago Exemplo Pequeno" in mails[1]["subject"]
    # Repetido (duplo clique): não duplica nem envia de novo
    again = await c.post("/api/v1/interest", json=form())
    assert again.json()["duplicate"] is True
    assert len(await fetch(mw.pool, "select 1 from email_outbox")) == 2
    # Sem consentimento, telemóvel inválido, robô (campo escondido preenchido), modalidade desconhecida
    assert (await c.post("/api/v1/interest", json=form(consent=False, childName="Outra Criança"))).status_code == 400
    assert (await c.post("/api/v1/interest", json=form(phone="123", childName="Outra Criança"))).status_code == 400
    c2 = mw.client("10.8.0.2")
    c2.headers.update(XHR)
    assert (await c2.post("/api/v1/interest", json=form(website="http://spam", childName="Outra Criança"))).status_code == 400
    assert (await c2.post("/api/v1/interest", json=form(sport="xadrez", childName="Outra Criança"))).status_code == 400


async def test_aviso_vai_para_o_email_dos_contactos(mw, mail_on):
    await execute(mw.pool, "delete from email_outbox")
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    await ed.put("/api/v1/admin/site/blocks/contacts", json={"data": {"email": "geral@serradofc.pt"}})
    c = mw.client("10.8.0.3")
    c.headers.update(XHR)
    assert (await c.post("/api/v1/interest", json=form(childName="Rui Exemplo Aviso"))).status_code == 201
    to = [m["to_email"] for m in await fetch(mw.pool, "select to_email from email_outbox order by id")]
    assert to[-1] == "geral@serradofc.pt"


async def test_backoffice_acompanha_e_apaga(mw):
    c = mw.client("10.8.0.4")
    c.headers.update(XHR)
    created = (await c.post("/api/v1/interest", json=form(childName="Beatriz Exemplo"))).json()
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    rows = (await sec.get("/api/v1/admin/interest", params={"status": "novo"})).json()
    assert any(x["childName"] == "Beatriz Exemplo" and x["sport"] == "futsal" for x in rows)
    up = await sec.patch(f"/api/v1/admin/interest/{created['id']}", json={"status": "contactado", "staffNote": "Liguei, vem terça."})
    assert up.status_code == 200 and up.json()["status"] == "contactado"
    assert (await sec.get("/api/v1/admin/interest", params={"status": "novo"})).json() == [x for x in rows if x["id"] != created["id"]]
    assert (await sec.patch(f"/api/v1/admin/interest/{created['id']}", json={"status": "outro"})).status_code == 400
    # Quem não gere registos não vê nem altera
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.get("/api/v1/admin/interest")).status_code == 403
    assert (await tes.delete(f"/api/v1/admin/interest/{created['id']}")).status_code == 403
    assert (await sec.delete(f"/api/v1/admin/interest/{created['id']}")).status_code == 204
    assert await fetch_one(mw.pool, "select 1 from interest_signups where id = %s", [created["id"]]) is None
    actions = [a["action"] for a in await fetch(mw.pool, "select action from audit_log where action like 'interest.%' order by id")]
    assert actions == ["interest.update", "interest.delete"]


async def test_limite_de_pre_inscricoes_por_ip(mw):
    c = mw.client("10.8.0.99")
    c.headers.update(XHR)
    codes = [(await c.post("/api/v1/interest", json={"childName": "x"})).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429
