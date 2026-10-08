"""Ferramentas de linha de comandos: conta de administração e conteúdo inicial."""

from collections.abc import AsyncIterator

import pytest

from serrado.db.content import seed_public_content
from serrado.db.create_admin import create_admin
from serrado.db.pool import Pool, execute, fetch_one
from serrado.password import verify_password
from tests.conftest import fresh_database


@pytest.fixture(scope="module")
async def pool() -> AsyncIterator[Pool]:
    p = await fresh_database("tools")
    yield p
    await p.close()


async def test_create_admin_cria_a_conta_com_papel_de_admin_e_regista_na_auditoria(pool):
    user_id = await create_admin(pool, " Direcao@SerradoFC.pt ", "Direção", "uma-password-longa")
    row = await fetch_one(
        pool,
        "select u.email, u.password_hash, array_agg(r.role) as roles from users u join user_roles r on r.user_id = u.id where u.id = %s group by u.id",
        [user_id],
    )
    assert row and row["email"] == "direcao@serradofc.pt"
    assert row["roles"] == ["admin"]
    assert await verify_password("uma-password-longa", row["password_hash"])
    assert await fetch_one(pool, "select 1 as ok from audit_log where action = 'users.create_admin' and entity_id = %s", [user_id])


async def test_create_admin_numa_conta_existente_repoe_a_password_sem_a_duplicar(pool):
    id1 = await create_admin(pool, "direcao@serradofc.pt", "Direção", "outra-password-longa")
    row = await fetch_one(
        pool,
        "select id, password_hash, (select count(*)::int from users where email = 'direcao@serradofc.pt') as n from users where email = 'direcao@serradofc.pt'",
    )
    assert row and row["n"] == 1 and row["id"] == id1
    assert await verify_password("outra-password-longa", row["password_hash"])


async def test_create_admin_recusa_passwords_curtas_e_emails_invalidos(pool):
    with pytest.raises(ValueError, match="12 caracteres"):
        await create_admin(pool, "a@b.pt", "X", "curta")
    with pytest.raises(ValueError, match="Email inválido"):
        await create_admin(pool, "sem-arroba", "X", "uma-password-longa")


async def test_conteudo_inicial_nao_mexe_num_cms_com_conteudo_e_preenche_um_cms_vazio(pool):
    before = await fetch_one(pool, "select count(*)::int as n from cms_news")
    assert await seed_public_content(pool, lambda _m: None) is False
    assert await fetch_one(pool, "select count(*)::int as n from cms_news") == before

    await execute(pool, "truncate cms_news, cms_events, cms_pages, cms_partners, cms_revisions restart identity cascade")
    assert await seed_public_content(pool, lambda _m: None) is True
    news = await fetch_one(pool, "select count(*) filter (where status = 'published')::int as pub, count(*)::int as total from cms_news")
    assert news and news["total"] > 0
    assert news["pub"] == news["total"]  # sem rascunhos de exemplo
    assert await fetch_one(pool, "select count(*)::int as n from cms_pages") == {"n": 2}


def test_passwords_compativeis_com_as_hashes_da_versao_node():
    """Hash gerada pela versão Node (scrypt N=16384, r=8, p=1): as contas existentes continuam a entrar."""
    from serrado.password import hash_password_sync, verify_password_sync

    node = "scrypt$16384$8$1$DSz3mndb5ud1G0Cg7qUEeg==$iX8MmpuSMoQM1gsWIQsZAVgxdri76cMLCsspQSzn9HPwcEmZ+ZziIM0YaArqb6hSRNSQ59J3iMiHg5nlENaQ3A=="
    assert verify_password_sync("serrado1978", node)
    assert not verify_password_sync("outra", node)
    h = hash_password_sync("serrado1978")
    assert h.startswith("scrypt$16384$8$1$") and verify_password_sync("serrado1978", h)
    assert not verify_password_sync("x", "md5$abc")
