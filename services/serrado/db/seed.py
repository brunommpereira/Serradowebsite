"""
Dados de DEMONSTRAÇÃO (todos fictícios). Apaga e volta a criar o conteúdo —
usar só em desenvolvimento/testes, nunca na base de dados de produção.

    python -m serrado.db.seed
"""

import asyncio
import json
import re
import unicodedata
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ..legal_templates import TEMPLATES
from ..password import hash_password
from ..permissions import DEFAULT_ROLES
from ..signup import doc_hash
from .pool import Conn, Jsonb, Pool, create_pool, tx

DEMO_USERS: list[dict[str, Any]] = [
    {"email": "socio@exemplo.pt", "name": "Sócio Demonstração", "password": "serrado1978", "member": ("00482", "Familiar"), "roles": []},
    {"email": "atleta@exemplo.pt", "name": "Rita Exemplo", "password": "atleta2026", "member": ("00731", "Efetivo"), "roles": []},
    {"email": "joao@exemplo.pt", "name": "João Exemplo", "password": "atleta2026", "member": None, "roles": []},
    {"email": "admin@serradofc.pt", "name": "Administração", "password": "admin2026", "member": None, "roles": ["admin"]},
    {"email": "editor@serradofc.pt", "name": "Equipa de Comunicação", "password": "editor2026", "member": None, "roles": ["editor"]},
    {"email": "secretaria@serradofc.pt", "name": "Secretaria", "password": "secretaria2026", "member": None, "roles": ["secretaria"]},
    {"email": "tesouraria@serradofc.pt", "name": "Tesouraria", "password": "tesouraria2026", "member": None, "roles": ["tesouraria"]},
    {"email": "treinador@serradofc.pt", "name": "Treinador Exemplo", "password": "treinador2026", "member": None, "roles": ["treinador"]},
]


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def load_content() -> dict[str, Any]:
    return json.loads((Path(__file__).parent / "content.json").read_text(encoding="utf-8"))


async def seed(pool: Pool, log: Callable[[str], None] = print) -> None:
    content = load_content()
    hashes = await asyncio.gather(*(hash_password(u["password"]) for u in DEMO_USERS))
    async with tx(pool) as c:
        await c.execute(
            """truncate users, user_roles, audit_log, members, quotas, athletes, athlete_access, athlete_documents,
               athlete_change_requests, races, results, cms_news, cms_events, cms_pages, cms_partners, cms_revisions, email_outbox restart identity cascade"""
        )
        # Papéis: só os de origem, com as permissões de origem
        await c.execute("delete from roles where not builtin")
        await c.execute("delete from role_permissions")
        for role, perms in DEFAULT_ROLES.items():
            for p in perms:
                await c.execute("insert into role_permissions values (%s, %s)", [role, p])
        ids: dict[str, str] = {}
        for u, pw in zip(DEMO_USERS, hashes, strict=True):
            cur = await c.execute("insert into users (email, name, password_hash) values (%s, %s, %s) returning id", [u["email"], u["name"], pw])
            row = await cur.fetchone()
            assert row is not None
            ids[u["email"]] = row["id"]
            for r in u["roles"]:
                await c.execute("insert into user_roles values (%s, %s)", [row["id"], r])
            if u["member"]:
                await c.execute(
                    "insert into members (member_number, user_id, name, email, category, joined_on) values (%s, %s, %s, %s, %s, %s)",
                    [u["member"][0], row["id"], u["name"], u["email"], u["member"][1], "2019-03-01"],
                )
        await c.execute("select setval('member_number_seq', 1000, false)")  # n.os novos a partir de 01000
        await c.execute("truncate quota_plans")
        # Documentos legais de demonstração (no servidor, a direção publica os seus no backoffice)
        await c.execute("truncate legal_documents, registrations")
        for kind, (title, body) in TEMPLATES.items():
            await c.execute(
                "insert into legal_documents (kind, version, title, body, sha256) values (%s, 1, %s, %s, %s)",
                [kind, title, body, doc_hash(title, body)],
            )
        await _seed_quotas(c)
        await _seed_athletes(c, ids)
        await _seed_results(c)
        await seed_cms(c, content, ids["editor@serradofc.pt"])
    log(f"✔ seed: {len(DEMO_USERS)} contas, 4 atletas, {len(content['news']) + 1} notícias, {len(content['events'])} eventos")


async def _seed_quotas(c: Conn) -> None:
    rows = [
        ("Novembro 2026", 20, "2026-11-08", None, None, None),
        ("Outubro 2026", 20, "2026-10-08", "2026-10-02", "MB WAY", "R2026/0412"),
        ("Setembro 2026", 20, "2026-09-08", "2026-09-05", "MB WAY", "R2026/0377"),
    ]
    for period, amount, due, paid, method, receipt in rows:
        await c.execute(
            "insert into quotas (member_number, period, amount, due_date, paid_at, payment_method, receipt_number) values (%s,%s,%s,%s,%s,%s,%s)",
            ["00482", period, amount, due, paid, method, receipt],
        )


ATHLETES: list[dict[str, Any]] = [
    {
        "code": "SFC-0001", "name": "Tomás Exemplo", "birth": "2016-03-12", "gender": "Masculino", "sport": "futsal", "category": "Sub-11",
        "id_number": "31234567", "tax": "258369140", "email": "socio@exemplo.pt", "phone": "910000000", "shirt": "10A", "emergency": (None, None), "confirmed": None,
        "access": [("socio@exemplo.pt", "encarregado")],
        "docs": {"cc-frente": "Aprovado", "cc-verso": ("Rejeitado", "Imagem desfocada"), "foto": "Aprovado", "rgpd": "Em falta",
                 "exame": ("Rejeitado", "Falta a assinatura do médico"), "ficha": "Em análise"},
    },
    {
        "code": "SFC-0002", "name": "Inês Exemplo", "birth": "2013-07-02", "gender": "Feminino", "sport": "atletismo", "category": "Infantis",
        "id_number": "30987654", "tax": "246813571", "email": "socio@exemplo.pt", "phone": "910000000", "shirt": "XS", "emergency": ("Avó Exemplo", "920000000"),
        "confirmed": "2026-09-10", "access": [("socio@exemplo.pt", "encarregado")],
        "docs": {"cc-frente": "Aprovado", "cc-verso": "Aprovado", "foto": "Aprovado", "rgpd": "Aprovado", "exame": "Aprovado", "ficha": "Aprovado"},
    },
    {
        "code": "SFC-0003", "name": "Rita Exemplo", "birth": "1985-04-21", "gender": "Feminino", "sport": "atletismo", "category": "Veteranas I",
        "id_number": "12345678", "tax": "123456789", "email": "atleta@exemplo.pt", "phone": "910000001", "shirt": "S", "emergency": ("Pedro Exemplo", "930000000"),
        "confirmed": "2025-10-02", "access": [("atleta@exemplo.pt", "atleta")],
        "docs": {"cc-frente": "Aprovado", "cc-verso": "Aprovado", "foto": "Aprovado", "exame": "Em análise", "ficha": "Aprovado"},
    },
    {
        "code": "SFC-0004", "name": "João Exemplo", "birth": "1996-08-09", "gender": "Masculino", "sport": "atletismo", "category": "Seniores",
        "id_number": "14567890", "tax": "214365875", "email": "joao@exemplo.pt", "phone": "960000000", "shirt": "M", "emergency": ("Ana Exemplo", "910000002"),
        "confirmed": "2026-09-20", "access": [("joao@exemplo.pt", "atleta")],
        "docs": {"cc-frente": "Aprovado", "cc-verso": "Aprovado", "foto": "Aprovado", "rgpd": "Aprovado", "exame": "Aprovado"},
    },
]  # fmt: skip


async def _seed_athletes(c: Conn, users: dict[str, str]) -> None:
    for a in ATHLETES:
        cur = await c.execute(
            """insert into athletes (code, name, birth_date, gender, sport_slug, category, id_number, id_expiry, tax_number, email, phone, address, postal_code, city,
                 shirt_size, shirt_type, emergency_name, emergency_phone, consent_rgpd, consent_image, confirmed_at)
               values (%s,%s,%s,%s,%s,%s,%s,'2029-05-30',%s,%s,%s,'Rua do Exemplo, 10','2825-000','Caparica',%s,'Normal',%s,%s,true,true,%s) returning id""",
            [a["code"], a["name"], a["birth"], a["gender"], a["sport"], a["category"], a["id_number"], a["tax"], a["email"], a["phone"], a["shirt"],
             a["emergency"][0], a["emergency"][1], a["confirmed"]],
        )  # fmt: skip
        row = await cur.fetchone()
        assert row is not None
        for email, role in a["access"]:
            await c.execute("insert into athlete_access values (%s, %s, %s)", [users[email], row["id"], role])
        for kind, v in a["docs"].items():
            status, note = v if isinstance(v, tuple) else (v, None)
            await c.execute(
                "insert into athlete_documents (athlete_id, kind, status, note, file_key) values (%s,%s,%s,%s,%s)",
                [row["id"], kind, status, note, None if status == "Em falta" else f"athletes/{a['code']}/{kind}.pdf"],
            )
        if a["code"] == "SFC-0002":
            await c.execute(
                "insert into athlete_change_requests (athlete_id, requested_by, changes) values (%s, %s, %s)",
                [row["id"], users["socio@exemplo.pt"], Jsonb({"name": "Inês Maria Exemplo"})],
            )


async def _seed_results(c: Conn) -> None:
    races = [
        ("2025/2026", 1, "6º GP São Martinho de Almada", "GP São Martinho de Almada", "2025-11-09"),
        ("2025/2026", 2, "Troféu da Caparica 2025", "Troféu da Caparica", "2025-11-16"),
        ("2025/2026", 8, "3ª Corrida Egas Moniz", "Corrida Egas Moniz", "2026-05-24"),
    ]
    for r in races:
        await c.execute("insert into races (season, round, name, base_name, race_date) values (%s,%s,%s,%s,%s)", list(r))
    rows = [
        (1, "SFC-0002", "Infantis", 4, "3:44.25", 224.25, 1000, 7),
        (2, "SFC-0002", "Infantis", 3, "3:47.61", 227.61, 1000, 8),
        (1, "SFC-0003", "Veteranas I", 5, "29:05.31", 1745.31, 5850, 6),
        (8, "SFC-0003", "Veteranas I", 3, "35:40.17", 2140.17, 7000, 8),
        (8, "SFC-0004", "Seniores", 12, "28:41.06", 1721.06, 7000, 1),
    ]
    for rnd, code, category, place, time, secs, dist, pts in rows:
        await c.execute(
            """insert into results (race_id, athlete_id, athlete_name, birth_year, category, place, time, time_s, distance_m, trophy_points)
               select r.id, a.id, upper(a.name), extract(year from a.birth_date), %s, %s, %s, %s, %s, %s from races r, athletes a where r.round = %s and a.code = %s""",
            [category, place, time, secs, dist, pts, rnd, code],
        )


PAGES = [
    (
        "privacidade",
        "Política de Privacidade",
        "Como o Serrado FC trata os dados pessoais de sócios, atletas e visitantes.",
        "O Serrado Futebol Clube é o responsável pelo tratamento dos dados pessoais recolhidos neste site.\n\n"
        "Os dados são usados apenas para gerir a relação com sócios, atletas e encarregados de educação, e nunca são vendidos a terceiros.\n\n"
        "Pode pedir acesso, retificação ou eliminação dos seus dados através de geral@serradofc.pt.",
    ),
    (
        "cookies",
        "Política de Cookies",
        "Que cookies usamos e como pode geri-los.",
        "Usamos apenas cookies essenciais ao funcionamento do site e à sessão da área reservada.\n\nPode apagar ou bloquear cookies nas definições do seu browser.",
    ),
]


async def seed_cms(c: Conn, content: dict[str, Any], editor: str | None, *, draft: bool = True) -> None:
    """Conteúdo do CMS (notícias, eventos, parceiros e páginas). Com `draft`, junta um rascunho de exemplo."""
    for n in content["news"]:
        await c.execute(
            "insert into cms_news (slug, title, category, summary, body, author, status, published_at, updated_by) values (%s,%s,%s,%s,%s,%s,'published',%s,%s)",
            [n["slug"], n["title"], n["category"], n["summary"], "\n\n".join(n["content"]), n["author"], n["publicationDate"] + "T09:00:00Z", editor],
        )
    if draft:
        await c.execute(
            """insert into cms_news (slug, title, category, summary, body, status, updated_by) values ('rascunho-gala-anual', 'Gala anual do clube: reserva a data',
               'Clube', 'A gala de aniversário regressa em abril.', 'Texto em preparação.', 'draft', %s)""",
            [editor],
        )
    for e in content["events"]:
        await c.execute(
            """insert into cms_events (slug, title, kind, sport_slug, summary, body, starts_at, end_time, location, capacity, price, member_price,
                 registration_required, ask_shirt_size, status, published_at, updated_by)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'published',now(),%s)""",
            [e["slug"], e["title"], e["kind"], e.get("sportSlug"), e["summary"], "\n\n".join(e["description"]), e["date"], e.get("endTime"), e["location"],
             e["capacity"], e["price"], e.get("memberPrice"), e["registrationRequired"], e["askShirtSize"], editor],
        )  # fmt: skip
    for s in content["sponsors"]:
        await c.execute(
            "insert into cms_partners (slug, name, category, website, description, status, published_at, updated_by) values (%s,%s,%s,%s,%s,%s,now(),%s)",
            [slugify(s["name"]), s["name"], s["category"], s["website"], s["description"], "published" if s["active"] else "archived", editor],
        )
    for slug, title, summary, body in PAGES:
        await c.execute(
            "insert into cms_pages (slug, title, summary, body, status, published_at, updated_by) values (%s,%s,%s,%s,'published',now(),%s)",
            [slug, title, summary, body, editor],
        )


async def _main() -> None:
    pool = create_pool()
    await pool.open()
    try:
        await seed(pool)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_main())
