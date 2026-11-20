"""Entrar com email e password reconhece o mesmo email que o Google (Gmail com ou sem pontos, maiúsculas, espaços)."""

import itertools

import pytest

from serrado.config import config
from serrado.db.pool import execute, fetch_one
from serrado.password import hash_password_sync
from tests.conftest import XHR

_IP = itertools.count(1)


def _client(mw):
    """Um IP novo por pedido: o limite de tentativas é por IP."""
    return mw.client(f"10.77.0.{next(_IP)}")


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")


async def _user(mw, email: str, password: str | None) -> None:
    await execute(
        mw.pool,
        "insert into users (email, name, password_hash) values (%s, 'Utilizador Exemplo', %s) on conflict do nothing",
        [email, hash_password_sync(password) if password else "!"],
    )


async def test_gmail_com_ou_sem_pontos_entra_com_a_mesma_password(mw):
    await _user(mw, "maria.exemplo.gmail@gmail.com", "segredo-2026")
    for escrito in (
        "maria.exemplo.gmail@gmail.com",
        "mariaexemplogmail@gmail.com",
        " Maria.Exemplo.Gmail@Gmail.com ",
        "mariaexemplogmail+clube@gmail.com",
    ):
        c = _client(mw)
        r = await c.post("/api/v1/auth/login", json={"login": escrito, "password": "segredo-2026"}, headers=XHR)
        assert r.status_code == 200, (escrito, r.text)
    c = _client(mw)
    assert (await c.post("/api/v1/auth/login", json={"login": "mariaexemplogmail@gmail.com", "password": "errada"}, headers=XHR)).status_code == 401


async def test_com_duas_contas_parecidas_o_email_igual_ganha(mw):
    await _user(mw, "ana.dois.exemplo@gmail.com", "primeira-2026")
    await _user(mw, "anadoisexemplo@gmail.com", "segunda-2026")
    for escrito, password in (("anadoisexemplo@gmail.com", "segunda-2026"), ("ana.dois.exemplo@gmail.com", "primeira-2026")):
        c = _client(mw)
        r = await c.post("/api/v1/auth/login", json={"login": escrito, "password": password}, headers=XHR)
        assert r.status_code == 200, (escrito, r.text)


async def test_repor_a_password_funciona_com_a_variante_do_gmail(mw, mail_on):
    await _user(mw, "rui.reposicao@gmail.com", None)  # conta criada pelo Google, sem password
    c = _client(mw)
    r = await c.post("/api/v1/auth/password/forgot", json={"email": "ruireposicao@gmail.com"}, headers=XHR)
    assert r.status_code == 202
    mail = await fetch_one(mw.pool, "select to_email from email_outbox where to_email like 'rui.reposicao@%' order by id desc limit 1")
    assert mail and mail["to_email"] == "rui.reposicao@gmail.com"
