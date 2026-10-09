"""Papéis e permissões editáveis no backoffice, tesouraria, recuperação da password por email e envio pela Brevo."""

import json
import re

import httpx
import pytest

from serrado.config import MailConfig, config
from serrado.db.pool import execute, fetch, fetch_one
from serrado.mail import BrevoClient, send_pending
from tests.conftest import XHR


async def first_athlete(mw) -> str:
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    return (await admin.get("/api/v1/admin/athletes")).json()[0]["id"]


async def test_tesouraria_gere_pagamentos_e_a_secretaria_so_os_ve(mw):
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    me = (await tes.get("/api/v1/me")).json()
    assert me["roles"] == ["tesouraria"] and me["permissions"] == ["members.view", "payments.manage", "payments.view"]
    assert (await tes.put("/api/v1/admin/fee-plans/rugby", json={"amount": 30, "active": True})).status_code == 200
    assert (await tes.get("/api/v1/admin/payments")).status_code == 200
    assert (await tes.get("/api/v1/admin/athletes")).status_code == 403, "a tesouraria não vê os atletas"
    assert (await tes.post("/api/v1/admin/cms/news/1/publish")).status_code == 403
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    assert (await sec.get("/api/v1/admin/payments")).status_code == 200
    assert (await sec.put("/api/v1/admin/fee-plans/rugby", json={"amount": 1, "active": True})).status_code == 403
    dash = (await tes.get("/api/v1/admin/dashboard")).json()
    assert dash["attention"] == {"requests": [], "documents": []} and "payments.manage" in dash["user"]["permissions"]


async def test_dados_sensiveis_so_com_a_permissao(mw):
    athlete = await first_athlete(mw)
    coach = await mw.login("treinador@serradofc.pt", "treinador2026")
    a = (await coach.get(f"/api/v1/admin/athletes/{athlete}")).json()
    assert "taxNumber" not in a and "idNumber" not in a and a["access"] == "treinador"
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    assert "taxNumber" in (await sec.get(f"/api/v1/admin/athletes/{athlete}")).json()


async def test_papel_novo_e_permissoes_alteradas_valem_logo(mw):
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    catalog = {p["key"] for p in (await admin.get("/api/v1/admin/permissions")).json()}
    assert {"payments.manage", "athletes.sensitive", "users.manage"} <= catalog
    bad = await admin.post("/api/v1/admin/roles", json={"key": "coord", "name": "Coordenação", "permissions": ["athletes.voar"]})
    assert bad.status_code == 400 and bad.json()["error"] == "unknown_permission"
    created = await admin.post(
        "/api/v1/admin/roles", json={"key": "coord", "name": "Coordenação", "description": "Coordenador técnico", "permissions": ["athletes.view"]}
    )
    assert created.status_code == 201, created.text
    assert (await admin.post("/api/v1/admin/roles", json={"key": "coord", "name": "Outra", "permissions": []})).status_code == 409
    users = {u["email"]: u["id"] for u in (await admin.get("/api/v1/admin/users")).json()}
    joao = users["joao@exemplo.pt"]
    assert (await admin.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": ["coord"]})).status_code == 200
    assert (await admin.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": ["inventado"]})).json()["error"] == "unknown_role"

    j = await mw.login("joao@exemplo.pt", "atleta2026")
    athlete = (await j.get("/api/v1/admin/athletes")).json()[0]["id"]
    assert "taxNumber" not in (await j.get(f"/api/v1/admin/athletes/{athlete}")).json()
    # A mudança de permissões vale no pedido seguinte, sem nova sessão
    upd = await admin.put("/api/v1/admin/roles/coord", json={"name": "Coordenação", "permissions": ["athletes.view", "athletes.sensitive"]})
    assert upd.status_code == 200
    assert "taxNumber" in (await j.get(f"/api/v1/admin/athletes/{athlete}")).json()
    roles = {r["key"]: r for r in (await admin.get("/api/v1/admin/roles")).json()}
    assert roles["coord"]["users"] == 1 and roles["coord"]["permissions"] == ["athletes.sensitive", "athletes.view"]
    assert len(roles["admin"]["permissions"]) == len(catalog), "o admin tem sempre tudo"

    # Os de origem não se apagam; os novos sim (e quem os tinha perde-os)
    assert (await admin.delete("/api/v1/admin/roles/tesouraria")).status_code == 409
    assert (await admin.delete("/api/v1/admin/roles/coord")).status_code == 204
    assert (await j.get("/api/v1/admin/athletes")).status_code == 403


async def test_quem_gere_utilizadores_nao_da_mais_do_que_tem(mw):
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    assert (
        await admin.post("/api/v1/admin/roles", json={"key": "rh", "name": "Gestão de contas", "permissions": ["users.manage", "cms.edit"]})
    ).status_code == 201
    users = {u["email"]: u["id"] for u in (await admin.get("/api/v1/admin/users")).json()}
    await admin.put(f"/api/v1/admin/users/{users['editor@serradofc.pt']}/roles", json={"roles": ["rh"]})
    rh = await mw.login("editor@serradofc.pt", "editor2026")
    joao = users["joao@exemplo.pt"]
    assert (await rh.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": ["editor"]})).status_code == 200
    assert (await rh.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": ["tesouraria"]})).status_code == 403
    assert (await rh.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": ["admin"]})).status_code == 403
    assert (await rh.put("/api/v1/admin/roles/rh", json={"name": "RH", "permissions": ["users.manage", "payments.manage"]})).status_code == 403
    assert (await rh.post("/api/v1/admin/roles", json={"key": "x1", "name": "Xx", "permissions": ["audit.all"]})).status_code == 403
    await admin.put(f"/api/v1/admin/users/{users['editor@serradofc.pt']}/roles", json={"roles": ["editor"]})
    await admin.put(f"/api/v1/admin/users/{joao}/roles", json={"roles": []})


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def test_recuperar_password_sem_email_configurado(mw):
    c = mw.client()
    assert (await c.get("/api/v1/auth/options")).json()["passwordReset"] is False
    r = await c.post("/api/v1/auth/password/forgot", json={"email": "socio@exemplo.pt"}, headers=XHR)
    assert r.status_code == 503 and r.json()["error"] == "mail_disabled"


async def test_recuperar_password_por_email(mw, mail_on):
    c = mw.client()
    assert (await c.get("/api/v1/auth/options")).json()["passwordReset"] is True
    old = await mw.login("socio@exemplo.pt", "serrado1978")
    # Sem conta: mesma resposta e nada na fila
    assert (await c.post("/api/v1/auth/password/forgot", json={"email": "ninguem@exemplo.pt"}, headers=XHR)).status_code == 202
    assert await fetch(mw.pool, "select 1 from email_outbox") == []
    assert (await c.post("/api/v1/auth/password/forgot", json={"email": "Socio@Exemplo.pt"}, headers=XHR)).status_code == 202
    assert (await c.post("/api/v1/auth/password/forgot", json={"email": "socio@exemplo.pt"}, headers=XHR)).status_code == 202
    assert len(await fetch(mw.pool, "select 1 from email_outbox")) == 1, "um pedido repetido logo a seguir não manda outro email"
    mail = await fetch_one(mw.pool, "select to_email, subject, html from email_outbox")
    assert mail and mail["to_email"] == "socio@exemplo.pt" and "Repor a password" in mail["subject"]
    found = re.search(r"nova-password\?token=([\w-]+)", mail["html"])
    assert found
    token = found.group(1)
    row = await fetch_one(mw.pool, "select token_hash from password_tokens")
    assert row and token not in row["token_hash"], "só o hash fica guardado"

    short = await c.post("/api/v1/auth/password/reset", json={"token": token, "password": "curta"}, headers=XHR)
    assert short.status_code == 400
    ok = await c.post("/api/v1/auth/password/reset", json={"token": token, "password": "nova-password-2026"}, headers=XHR)
    assert ok.status_code == 200 and ok.json()["email"] == "socio@exemplo.pt"
    again = await c.post("/api/v1/auth/password/reset", json={"token": token, "password": "outra-password-2026"}, headers=XHR)
    assert again.status_code == 400 and again.json()["error"] == "invalid_token", "uso único"

    # A sessão antiga termina; a password antiga deixa de servir
    await execute(mw.pool, "update users set password_changed_at = now() + interval '2 seconds' where email = 'socio@exemplo.pt'")
    assert (await old.get("/api/v1/me")).status_code == 401
    bad = await mw.client().post("/api/v1/auth/login", json={"login": "socio@exemplo.pt", "password": "serrado1978"}, headers=XHR)
    assert bad.status_code == 401
    await execute(mw.pool, "update users set password_changed_at = now() - interval '1 minute' where email = 'socio@exemplo.pt'")
    new = await mw.login("socio@exemplo.pt", "nova-password-2026")
    assert (await new.get("/api/v1/me")).status_code == 200
    audit = await fetch(mw.pool, "select action from audit_log where action like 'auth.password%' order by id")
    assert [a["action"] for a in audit] == ["auth.password_forgot", "auth.password_reset"]


async def test_ligacao_expirada_e_convite(mw, mail_on):
    admin = await mw.login("admin@serradofc.pt", "admin2026")
    users = {u["email"]: u["id"] for u in (await admin.get("/api/v1/admin/users")).json()}
    await execute(mw.pool, "delete from email_outbox")
    inv = await admin.post(f"/api/v1/admin/users/{users['joao@exemplo.pt']}/invite")
    assert inv.status_code == 202, inv.text
    mail = await fetch_one(mw.pool, "select subject, html from email_outbox")
    assert mail and "conta" in mail["subject"]
    found = re.search(r"token=([\w-]+)", mail["html"])
    assert found
    token = found.group(1)
    await execute(mw.pool, "update password_tokens set expires_at = now() - interval '1 second' where purpose = 'invite'")
    c = mw.client()
    r = await c.post("/api/v1/auth/password/reset", json={"token": token, "password": "password-joao-2026"}, headers=XHR)
    assert r.status_code == 400
    sec = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await sec.post(f"/api/v1/admin/users/{users['joao@exemplo.pt']}/invite")).status_code == 403


async def test_envio_pela_brevo_com_novas_tentativas(mw):
    await execute(mw.pool, "delete from email_outbox")
    async with mw.pool.connection() as c:
        from serrado.mail import enqueue

        await enqueue(
            c,
            to_email="socio@exemplo.pt",
            to_name="Sócio",
            subject="Olá",
            html_body="<p>x</p>",
            attachments=[{"name": "a.pdf", "content": "JVBERg=="}],
        )
    seen: list[dict] = []
    status = [500, 201]

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url == "https://api.brevo.com/v3/smtp/email" and req.headers["api-key"] == "xkeysib-teste"
        seen.append(json.loads(req.content))
        code = status.pop(0)
        return httpx.Response(code, json={"message": "erro temporário"} if code >= 300 else {"messageId": "<1@brevo>"})

    cfg = MailConfig(brevo_api_key="xkeysib-teste", from_email="site@serradofc.pt", from_name="Serrado FC")
    client = BrevoClient(cfg, transport=httpx.MockTransport(handler))
    s = await send_pending(mw.pool, cfg, client)
    assert (s.sent, s.failed) == (0, 1) and "500" in s.errors[0]
    assert (await send_pending(mw.pool, cfg, client)).sent == 0, "espera antes de tentar outra vez"
    await execute(mw.pool, "update email_outbox set tried_at = now() - interval '1 hour'")
    assert (await send_pending(mw.pool, cfg, client)).sent == 1
    assert seen[-1]["sender"] == {"email": "site@serradofc.pt", "name": "Serrado FC"}
    assert seen[-1]["to"] == [{"email": "socio@exemplo.pt", "name": "Sócio"}] and seen[-1]["attachment"][0]["name"] == "a.pdf"
    row = await fetch_one(mw.pool, "select status, html, attachments from email_outbox")
    assert row == {"status": "sent", "html": "", "attachments": []}, "o conteúdo não fica guardado depois de enviado"


class FakeSmtp:
    """smtplib.SMTP falso: guarda o login e as mensagens; pode recusar a autenticação."""

    sent: list = []
    logins: list = []
    refuse = False

    def __init__(self, host: str, port: int) -> None:
        assert (host, port) == ("mail.serradofc.pt", 465)

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> None:
        return None

    def login(self, user: str, password: str) -> None:
        if FakeSmtp.refuse:
            import smtplib

            raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")
        FakeSmtp.logins.append((user, password))

    def send_message(self, msg) -> None:
        FakeSmtp.sent.append(msg)


async def test_envio_por_smtp_da_caixa_do_dominio(mw):
    from serrado.mail import SmtpClient, enqueue

    await execute(mw.pool, "delete from email_outbox")
    async with mw.pool.connection() as c:
        await enqueue(
            c,
            to_email="socio@exemplo.pt",
            to_name="Sócio Exemplo",
            subject="Olá «sócio»",
            html_body="<p>Primeira linha</p><p>Segunda &amp; última</p>",
            attachments=[{"name": "registo.pdf", "content": "JVBERi0xLjQ="}],
        )
    cfg = MailConfig(
        brevo_api_key="",
        from_email="geral@serradofc.pt",
        from_name="Serrado FC",
        smtp_host="mail.serradofc.pt",
        smtp_port=465,
        smtp_user="geral@serradofc.pt",
        smtp_password="segredo-de-teste",
    )
    assert cfg.provider == "smtp" and cfg.enabled and "segredo" not in repr(cfg)
    client = SmtpClient(cfg, smtp_factory=FakeSmtp)
    FakeSmtp.sent, FakeSmtp.logins, FakeSmtp.refuse = [], [], True
    s = await send_pending(mw.pool, cfg, client)
    assert s.failed == 1 and "recusou o utilizador ou a password" in s.errors[0] and "segredo" not in s.errors[0]
    await execute(mw.pool, "update email_outbox set tried_at = now() - interval '1 hour'")
    FakeSmtp.refuse = False
    assert (await send_pending(mw.pool, cfg, client)).sent == 1
    assert FakeSmtp.logins == [("geral@serradofc.pt", "segredo-de-teste")]
    msg = FakeSmtp.sent[0]
    assert msg["From"] == "Serrado FC <geral@serradofc.pt>" and "socio@exemplo.pt" in msg["To"] and msg["Subject"] == "Olá «sócio»"
    assert msg["Message-ID"].endswith("@serradofc.pt>")
    text = msg.get_body(("plain",)).get_content()
    assert "Primeira linha" in text and "Segunda & última" in text and "<p>" not in text
    assert "<p>Primeira linha</p>" in msg.get_body(("html",)).get_content()
    att = next(msg.iter_attachments())
    assert att.get_filename() == "registo.pdf" and att.get_content_type() == "application/pdf" and att.get_content().startswith(b"%PDF")
