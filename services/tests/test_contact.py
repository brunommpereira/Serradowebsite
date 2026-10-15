"""Formulário de contacto do site: guarda a mensagem e avisa o clube por email."""

from serrado.config import config
from serrado.db.pool import fetch, fetch_one
from tests.conftest import XHR, Middleware

FORM = {
    "name": "Ana Visitante",
    "email": "ana@exemplo.pt",
    "subject": "Ser sócio",
    "message": "Olá! Como posso ser sócia?\nObrigada.",
    "consent": True,
    "website": "",
}


async def test_mensagem_fica_guardada_e_o_clube_recebe_email(mw: Middleware, monkeypatch) -> None:
    monkeypatch.setattr(config.mail, "brevo_api_key", "test-key")
    monkeypatch.setattr(config.mail, "from_email", "nao-responder@serradofc.pt")
    r = await mw.client().post("/api/v1/contact", json=FORM, headers=XHR)
    assert r.status_code == 201, r.text
    assert r.json()["duplicate"] is False
    row = await fetch_one(mw.pool, "select name, email, subject, message, ip from contact_messages order by id desc limit 1")
    assert row is not None and row["email"] == "ana@exemplo.pt" and row["subject"] == "Ser sócio" and row["ip"]
    mails = await fetch(mw.pool, "select to_email, subject, html from email_outbox where subject like 'Contacto pelo site%%'")
    assert len(mails) == 1
    assert "ana@exemplo.pt" not in mails[0]["to_email"]  # vai para o clube, nunca para quem escreveu
    assert "mailto:ana@exemplo.pt" in mails[0]["html"]
    # Duplo clique: não repete
    r = await mw.client().post("/api/v1/contact", json=FORM, headers=XHR)
    assert r.json()["duplicate"] is True


async def test_sem_consentimento_robo_ou_dados_invalidos_e_recusado(mw: Middleware) -> None:
    c = mw.client()
    assert (await c.post("/api/v1/contact", json={**FORM, "consent": False}, headers=XHR)).status_code == 400
    assert (await mw.client().post("/api/v1/contact", json={**FORM, "website": "http://spam"}, headers=XHR)).status_code == 400
    assert (await mw.client().post("/api/v1/contact", json={**FORM, "email": "nao-e-email"}, headers=XHR)).status_code == 400
    assert (await mw.client().post("/api/v1/contact", json={**FORM, "message": ""}, headers=XHR)).status_code == 400
    # Assunto fora da lista passa a «Outro»
    r = await mw.client().post("/api/v1/contact", json={**FORM, "subject": "<script>", "message": "Outra pergunta"}, headers=XHR)
    assert r.status_code == 201
    assert (await fetch_one(mw.pool, "select subject from contact_messages order by id desc limit 1")) == {"subject": "Outro"}


async def test_limite_de_mensagens_por_ip(mw: Middleware) -> None:
    c = mw.client()
    codes = [(await c.post("/api/v1/contact", json={**FORM, "message": f"Mensagem {i}"}, headers=XHR)).status_code for i in range(7)]
    assert 429 in codes
