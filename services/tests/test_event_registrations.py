"""Inscrições em eventos: formulário público, vagas, emails e acompanhamento no backoffice."""

from datetime import datetime, timedelta

import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch, fetch_one
from tests.conftest import XHR


def form(**extra: object) -> dict:
    return {
        "name": "Joana Exemplo",
        "email": "Joana@Exemplo.pt",
        "phone": "912 345 678",
        "people": 3,
        "isMember": False,
        "sport": "atletismo",
        "notes": "Dois vão ao treino.",
        "consent": True,
        "consentImage": True,
        "website": "",
        **extra,
    }


async def new_event(
    pool, slug: str, *, days: int = 20, capacity: int = 0, price: float = 20, member_price: float | None = None, reg: bool = True
) -> int:
    starts = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d 10:30")
    row = await fetch_one(
        pool,
        """insert into cms_events (slug, title, kind, starts_at, location, capacity, price, member_price, registration_required, status, published_at)
           values (%s, %s, 'Convívio', %s, 'Fresh Bar', %s, %s, %s, %s, 'published', now()) returning id""",
        [slug, f"Evento {slug}", starts, capacity, price, member_price, reg],
    )
    assert row
    return int(row["id"])


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def test_inscricao_publica_com_valor_e_emails(mw, mail_on):
    eid = await new_event(mw.pool, "festa-teste")
    await execute(mw.pool, "delete from email_outbox")
    c = mw.client("10.9.0.1")
    c.headers.update({**XHR, "user-agent": "Browser/1.0"})
    r = await c.post("/api/v1/events/festa-teste/registrations", json=form())
    assert r.status_code == 201, r.text
    out = r.json()
    assert (out["people"], out["amount"], out["duplicate"]) == (3, 60.0, False)
    assert out["code"].startswith(f"EV{eid}-")
    row = await fetch_one(mw.pool, "select * from event_registrations where code = %s", [out["code"]])
    assert row and (row["email"], row["phone"], row["status"], row["ip"], row["consent_image"]) == (
        "joana@exemplo.pt",
        "912345678",
        "inscrito",
        "10.9.0.1",
        True,
    )
    mails = await fetch(mw.pool, "select to_email, subject, html from email_outbox order by id")
    assert [m["to_email"] for m in mails] == ["joana@exemplo.pt", "site@serradofc.pt"]
    assert out["code"] in mails[0]["html"] and "60 €" in mails[0]["html"]
    # Repetido (duplo clique): devolve a mesma inscrição, sem novo email
    again = (await c.post("/api/v1/events/festa-teste/registrations", json=form())).json()
    assert again["duplicate"] is True and again["code"] == out["code"]
    assert len(await fetch(mw.pool, "select 1 from email_outbox")) == 2
    av = (await c.get("/api/v1/events/festa-teste/availability")).json()
    assert av == {"registered": 3, "capacity": 0, "open": True}


async def test_preco_de_socio_validacoes_e_fecho(mw):
    await new_event(mw.pool, "socios-teste", price=20, member_price=15)
    c = mw.client("10.9.0.2")
    c.headers.update(XHR)
    r = await c.post("/api/v1/events/socios-teste/registrations", json=form(isMember=True, memberNumber="123", people=2))
    assert r.json()["amount"] == 30.0
    bad = [
        form(consent=False, name="Outro Nome"),
        form(phone="123", name="Outro Nome"),
        form(people=0, name="Outro Nome"),
        form(sport="xadrez", name="Outro Nome"),
    ]
    for f in bad:
        assert (await c.post("/api/v1/events/socios-teste/registrations", json=f)).status_code == 400
    c2 = mw.client("10.9.0.3")
    c2.headers.update(XHR)
    assert (await c2.post("/api/v1/events/socios-teste/registrations", json=form(website="http://spam", name="Robô Teste"))).status_code == 400
    # Evento passado, sem inscrição ou inexistente
    await new_event(mw.pool, "passado-teste", days=-2)
    await new_event(mw.pool, "livre-teste", reg=False)
    assert (await c2.post("/api/v1/events/passado-teste/registrations", json=form())).status_code == 409
    assert (await c2.post("/api/v1/events/livre-teste/registrations", json=form())).status_code == 409
    assert (await c2.get("/api/v1/events/passado-teste/availability")).json()["open"] is False
    assert (await c2.get("/api/v1/events/nao-existe/availability")).status_code == 404


async def test_lotacao(mw):
    await new_event(mw.pool, "lotacao-teste", capacity=4)
    c = mw.client("10.9.0.4")
    c.headers.update(XHR)
    assert (await c.post("/api/v1/events/lotacao-teste/registrations", json=form(people=3))).status_code == 201
    full = await c.post("/api/v1/events/lotacao-teste/registrations", json=form(people=2, name="Rui Exemplo"))
    assert full.status_code == 409 and "restam 1" in full.text
    assert (await c.post("/api/v1/events/lotacao-teste/registrations", json=form(people=1, name="Rui Exemplo"))).status_code == 201
    assert (await c.get("/api/v1/events/lotacao-teste/availability")).json()["open"] is False


async def test_backoffice_lista_marca_pago_e_apaga(mw):
    eid = await new_event(mw.pool, "backoffice-teste")
    c = mw.client("10.9.0.5")
    c.headers.update(XHR)
    code = (await c.post("/api/v1/events/backoffice-teste/registrations", json=form(people=2))).json()["code"]
    # Público e editor não veem; secretaria e tesouraria sim
    assert (await c.get("/api/v1/admin/event-registrations", params={"eventId": eid})).status_code == 401
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    assert (await ed.get("/api/v1/admin/event-registrations", params={"eventId": eid})).status_code == 403
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    rows = (await tes.get("/api/v1/admin/event-registrations", params={"eventId": eid})).json()
    assert [(x["code"], x["people"], x["amount"]) for x in rows] == [(code, 2, 40.0)]
    r = await tes.patch(f"/api/v1/admin/event-registrations/{rows[0]['id']}", json={"status": "pago", "staffNote": "MB Way"})
    assert r.status_code == 200 and r.json()["status"] == "pago"
    ev = next(x for x in (await tes.get("/api/v1/admin/event-registrations/events")).json() if x["id"] == eid)
    assert (ev["people"], ev["amount"], ev["paid"]) == (2, 40.0, 40.0)
    # Apagar é da secretaria (RGPD)
    assert (await tes.delete(f"/api/v1/admin/event-registrations/{rows[0]['id']}")).status_code == 403
    sec = await mw.login("secretaria@serradofc.pt", "secretaria2026")
    assert (await sec.delete(f"/api/v1/admin/event-registrations/{rows[0]['id']}")).status_code == 204
    assert (await sec.get("/api/v1/admin/event-registrations", params={"eventId": eid})).json() == []
