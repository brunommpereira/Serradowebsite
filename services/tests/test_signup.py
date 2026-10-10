"""Registo online de sócios e atletas: documentos com versões, assinatura desenhada, prova e PDF."""

import base64
import hashlib
import json
import re

import psycopg
import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch, fetch_one
from tests.conftest import XHR


async def versions(mw) -> dict[str, int]:
    form = (await mw.client().get("/api/v1/registrations/form")).json()
    return {k: d["version"] for k, d in form["documents"].items()}


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def confirm_link(mw, email: str, ip: str = "10.9.0.50"):
    """Abre a ligação do email «Confirma a tua proposta» (a mais recente para este email)."""
    row = await fetch_one(
        mw.pool, "select html from email_outbox where to_email = %s and subject like 'Confirma a tua proposta%%' order by id desc limit 1", [email]
    )
    assert row, f"sem email de confirmação para {email}"
    token = re.search(r"/propostas/confirmar\?token=([A-Za-z0-9_-]+)", row["html"]).group(1)
    c = mw.client(ip)
    c.headers.update(XHR)
    return await c.post("/api/v1/registrations/confirm", json={"token": token})


def member_form(v: dict[str, int], **extra) -> dict:
    return {
        "name": "Joana Exemplo Registo",
        "email": "joana@exemplo.pt",
        "phone": "912 345 678",
        "taxNumber": "123456789",
        "birthDate": "1990-07-21",
        "postalCode": "2825-000",
        "city": "Charneca",
        "address": None,
        "category": None,
        "accept": v,
        "imageConsent": True,
        "declaration": True,
        **extra,
    }


async def test_formulario_mostra_os_documentos_em_vigor(mw):
    form = (await mw.client().get("/api/v1/registrations/form")).json()
    assert form["ready"] == {"member": True, "athlete": True}
    assert set(form["documents"]) == {"socio", "atleta", "rgpd", "imagem"}
    rgpd = form["documents"]["rgpd"]
    assert rgpd["sha256"] == hashlib.sha256(f"{rgpd['title']}\n\n{rgpd['body']}".encode()).hexdigest()


async def test_proposta_de_socio_aceite_e_confirmada_por_email(mw, mail_on):
    v = await versions(mw)
    c = mw.client("10.9.0.1")
    c.headers.update({**XHR, "user-agent": "TesteBrowser/1.0"})
    # Sem a declaração aceite, honeypot, documento desatualizado
    assert (await c.post("/api/v1/registrations/member", json=member_form(v, declaration=False))).status_code == 400
    assert (await c.post("/api/v1/registrations/member", json=member_form(v, website="spam"))).status_code == 400
    old = {**v, "socio": v["socio"] - 1}
    assert (await c.post("/api/v1/registrations/member", json=member_form(old))).json()["error"] == "documents_changed"

    # Sócio proponente que não existe
    c3 = mw.client("10.9.0.12")
    c3.headers.update(XHR)
    bad = await c3.post("/api/v1/registrations/member", json=member_form(v, proposerNumber="99999"))
    assert bad.status_code == 400 and "proposerNumber" in bad.text
    r = await c.post("/api/v1/registrations/member", json=member_form(v, proposerNumber="482"))
    assert r.status_code == 201, r.text
    out = r.json()
    # Fica à espera da confirmação por email: a secretaria ainda não a vê
    assert out["status"] == "por_confirmar" and "memberNumber" not in out
    assert await fetch_one(mw.pool, "select 1 from members where email = 'joana@exemplo.pt'") is None
    assert not await fetch_one(mw.pool, "select 1 from email_outbox where subject like 'Nova proposta%%'")
    bad_link = await c.post("/api/v1/registrations/confirm", json={"token": "x" * 43})
    assert bad_link.status_code == 400 and bad_link.json()["error"] == "invalid_link"
    ok_link = await confirm_link(mw, "joana@exemplo.pt")
    assert ok_link.status_code == 200 and ok_link.json()["status"] == "pendente", ok_link.text
    assert (await confirm_link(mw, "joana@exemplo.pt")).json()["already"] is True, "a ligação pode ser aberta outra vez"
    g = await fetch_one(mw.pool, "select * from registrations where id = %s", [out["id"]])
    assert g and (g["status"], g["proposer_number"], g["member_number"]) == ("pendente", "00482", None)
    assert g and g["ip"] == "10.9.0.1" and g["user_agent"] == "TesteBrowser/1.0" and g["signer_role"] == "titular"
    assert g["confirm_ip"] == "10.9.0.50" and g["confirmed_at"] and g["signature_png"] is None
    assert g["declaration"].startswith("Declaro que os dados indicados são verdadeiros")
    assert g["pdf"].startswith(b"%PDF") and g["pdf_sha256"] == hashlib.sha256(g["pdf"]).hexdigest()
    assert {(a["kind"], a["accepted"]) for a in g["accepted"]} == {("socio", True), ("rgpd", True), ("imagem", True)}
    # A prova volta a dar o mesmo hash com os dados guardados
    evidence = {
        "kind": "member",
        "data": g["data"],
        "accepted": g["accepted"],
        "imageConsent": g["image_consent"],
        "signer": {"name": g["signer_name"], "email": g["signer_email"], "role": g["signer_role"]},
        "declaration": g["declaration"],
        "signedAt": g["signed_at"].replace("Z", "+00:00").replace(".000", ""),
        "ip": g["ip"],
        "userAgent": g["user_agent"],
    }
    assert (
        hashlib.sha256(json.dumps(evidence, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest() == g["evidence_sha256"]
    )
    # Emails: o pedido de confirmação, depois a proposta (PDF em anexo) e o aviso à secretaria; ainda sem convite
    mails = await fetch(mw.pool, "select subject, attachments from email_outbox where to_email = 'joana@exemplo.pt' order by id")
    assert [x["subject"] for x in mails] == ["Confirma a tua proposta — Serrado FC", "Proposta de sócio — Serrado FC"]
    assert base64.b64decode(mails[1]["attachments"][0]["content"]) == g["pdf"]
    assert await fetch_one(mw.pool, "select 1 from email_outbox where subject = 'Nova proposta de sócio: Joana Exemplo Registo'")
    # Não propõe duas vezes o mesmo email
    c2 = mw.client("10.9.0.11")
    c2.headers.update(XHR)
    again = await c2.post("/api/v1/registrations/member", json=member_form(v))
    assert again.status_code == 409 and again.json()["error"] == "already_proposed"

    # A secretaria aceita: passa a sócio (n.º seguinte), com conta e convite
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    pend = (await sec.get("/api/v1/admin/registrations", params={"status": "pendente"})).json()
    p = next(x for x in pend if x["id"] == out["id"])
    assert (p["proposerNumber"], p["data"]["phone"]) == ("00482", "912345678")
    ok = await sec.post(f"/api/v1/admin/registrations/{out['id']}/approve", json={"note": "Bem-vinda!"})
    assert ok.status_code == 200, ok.text
    number = ok.json()["memberNumber"]
    m = await fetch_one(
        mw.pool, "select status, category, phone, notes, user_id is not null as linked from members where member_number = %s", [number]
    )
    assert m == {"status": "Ativo", "category": "Efetivo", "phone": "912345678", "notes": "Proposta online (proponente n.º 00482)", "linked": True}
    g2 = await fetch_one(mw.pool, "select status, member_number, review_note, evidence_sha256 from registrations where id = %s", [out["id"]])
    assert g2 == {"status": "aceite", "member_number": number, "review_note": "Bem-vinda!", "evidence_sha256": g["evidence_sha256"]}
    mails = [x["subject"] for x in await fetch(mw.pool, "select subject from email_outbox where to_email = 'joana@exemplo.pt' order by id")]
    assert mails[2:] == ["Proposta aceite — Serrado FC", "A tua conta no site do Serrado FC"]
    assert (await sec.post(f"/api/v1/admin/registrations/{out['id']}/approve", json={})).status_code == 409, "só uma vez"
    # Já sócio: nova proposta com o mesmo email é recusada logo
    assert (await c2.post("/api/v1/registrations/member", json=member_form(v))).json()["error"] == "already_member"


async def test_inscricao_de_atleta_menor_aceite_pelo_encarregado(mw, mail_on):
    v = await versions(mw)
    c = mw.client("10.9.0.2")
    c.headers.update(XHR)
    base = {
        "name": "Rui Exemplo Pequeno",
        "birthDate": "2016-03-04",
        "gender": "Masculino",
        "sport": "futsal",
        "emergencyName": "Mãe Exemplo",
        "emergencyPhone": "913000000",
        "accept": v,
        "imageConsent": False,
        "declaration": True,
    }
    no_guardian = await c.post("/api/v1/registrations/athlete", json=base)
    assert no_guardian.status_code == 400 and "guardian" in no_guardian.text
    guardian = {"name": "Sara Exemplo Mãe", "email": "sara@exemplo.pt", "phone": "914000000", "relation": "Mãe"}
    # Como o site envia: campos opcionais vazios a null
    empty = {k: None for k in ("shirtSize", "idNumber", "idExpiry", "taxNumber", "address", "postalCode", "city", "email", "phone")}
    r = await c.post("/api/v1/registrations/athlete", json={**base, **empty, "guardian": guardian, "website": ""})
    assert r.status_code == 201, r.text
    assert await fetch_one(mw.pool, "select 1 from athletes where name = 'Rui Exemplo Pequeno'") is None, "fica à espera da secretaria"
    assert (await confirm_link(mw, "sara@exemplo.pt")).json()["status"] == "pendente"
    dup = await c.post("/api/v1/registrations/athlete", json={**base, "guardian": guardian})
    assert dup.status_code == 409 and dup.json()["error"] == "already_proposed"
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    ok = await sec.post(f"/api/v1/admin/registrations/{r.json()['id']}/approve", json={})
    assert ok.status_code == 200, ok.text
    a = await fetch_one(
        mw.pool, "select id, code, sport_slug, consent_rgpd, consent_image, emergency_phone from athletes where name = 'Rui Exemplo Pequeno'"
    )
    assert a and (a["sport_slug"], a["consent_rgpd"], a["consent_image"], a["emergency_phone"]) == ("futsal", True, False, "913000000")
    assert ok.json()["code"] == a["code"]
    acc = await fetch(mw.pool, "select u.email, aa.role from athlete_access aa join users u on u.id = aa.user_id where aa.athlete_id = %s", [a["id"]])
    assert [(x["email"], x["role"]) for x in acc] == [("sara@exemplo.pt", "encarregado")]
    g = await fetch_one(mw.pool, "select signer_role, signer_email, accepted from registrations where athlete_id = %s", [a["id"]])
    assert g and (g["signer_role"], g["signer_email"]) == ("encarregado", "sara@exemplo.pt")
    assert {(x["kind"], x["accepted"]) for x in g["accepted"]} == {("atleta", True), ("rgpd", True), ("imagem", False)}
    dup = await c.post("/api/v1/registrations/athlete", json={**base, "guardian": guardian})
    assert dup.status_code == 409 and dup.json()["error"] == "already_registered"
    # Adulto: assina o próprio e fica com acesso à ficha
    adult = {**base, "name": "Tânia Exemplo Adulta", "birthDate": "1995-01-01", "gender": "Feminino", "sport": "atletismo"}
    c4 = mw.client("10.9.0.22")
    c4.headers.update(XHR)
    assert (await c4.post("/api/v1/registrations/athlete", json=adult)).status_code == 400, "sem email"
    r2 = await c4.post("/api/v1/registrations/athlete", json={**adult, "email": "tania@exemplo.pt"})
    assert r2.status_code == 201, r2.text
    await confirm_link(mw, "tania@exemplo.pt")
    assert (await sec.post(f"/api/v1/admin/registrations/{r2.json()['id']}/approve", json={})).status_code == 200
    role = await fetch_one(mw.pool, "select aa.role from athlete_access aa join users u on u.id = aa.user_id where u.email = 'tania@exemplo.pt'")
    assert role == {"role": "atleta"}


async def test_backoffice_publica_versoes_novas_e_ve_os_registos(mw):
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    legal = (await sec.get("/api/v1/admin/legal")).json()
    assert set(legal["templates"]) == {"socio", "atleta", "rgpd", "imagem"}
    before = legal["current"]["rgpd"]["version"]
    r = await sec.post(
        "/api/v1/admin/legal/rgpd", json={"title": "Proteção de dados", "body": "Texto novo da política de dados com mais de vinte caracteres."}
    )
    assert r.status_code == 201 and r.json()["version"] == before + 1
    hist = [h for h in (await sec.get("/api/v1/admin/legal")).json()["history"] if h["kind"] == "rgpd"]
    assert [h["version"] for h in hist] == [before + 1, before] and hist[1]["registrations"] >= 1
    # As versões publicadas nunca mudam
    with pytest.raises(psycopg.errors.RaiseException):
        await execute(mw.pool, "update legal_documents set body = 'x' where kind = 'rgpd'")
    # Um formulário aberto com a versão antiga tem de ser recarregado
    v = await versions(mw)
    stale = {**v, "rgpd": before}
    c = mw.client("10.9.0.3")
    c.headers.update(XHR)
    r = await c.post("/api/v1/registrations/member", json=member_form(stale, email="outra@exemplo.pt"))
    assert r.json()["error"] == "documents_changed"

    regs = (await sec.get("/api/v1/admin/registrations")).json()
    assert {x["kind"] for x in regs} == {"member", "athlete"}
    pdf = await sec.get(f"/api/v1/admin/registrations/{regs[0]['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and pdf.headers["content-type"] == "application/pdf"
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.get("/api/v1/admin/registrations")).status_code == 403
    assert (await tes.post("/api/v1/admin/legal/rgpd", json={"title": "Xyz", "body": "x" * 30})).status_code == 403


async def test_limite_de_registos_por_ip(mw):
    c = mw.client("10.9.0.99")
    c.headers.update(XHR)
    codes = [(await c.post("/api/v1/registrations/member", json={"name": "x"})).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429


async def test_secretaria_recusa_uma_proposta_com_motivo(mw, mail_on):
    v = await versions(mw)
    c = mw.client("10.9.0.21")
    c.headers.update(XHR)
    r = await c.post("/api/v1/registrations/member", json=member_form(v, name="Pedro Exemplo Recusado", email="pedro.r@exemplo.pt"))
    assert r.status_code == 201, r.text
    await confirm_link(mw, "pedro.r@exemplo.pt")
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.post(f"/api/v1/admin/registrations/{r.json()['id']}/approve", json={})).status_code == 403
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    no = await sec.post(f"/api/v1/admin/registrations/{r.json()['id']}/reject", json={"note": "Falta o sócio proponente."})
    assert no.json()["status"] == "recusada"
    assert await fetch_one(mw.pool, "select 1 from members where email = 'pedro.r@exemplo.pt'") is None
    mail = await fetch_one(mw.pool, "select subject, html from email_outbox where to_email = 'pedro.r@exemplo.pt' order by id desc limit 1")
    assert mail and mail["subject"] == "Proposta não aceite — Serrado FC" and "Falta o sócio proponente." in mail["html"]
    # Depois de recusada pode voltar a propor
    assert (
        await c.post("/api/v1/registrations/member", json=member_form(v, name="Pedro Exemplo Recusado", email="pedro.r@exemplo.pt"))
    ).status_code == 201
