"""
Lista de inscritos da Xistarca (o Excel «TEMPLATE PLATAFORMA XISTARCA»: nome, sexo, CC, nascimento, equipa,
email, telemóvel) → atletas marcados como inscritos na edição do Troféu.

- Cada linha procura o atleta pelo n.º do CC; senão pelo nome e data de nascimento; senão pelo nome
  (só se houver um único atleta com esse nome e sem data que o contradiga).
- Quem não existe é criado (atletismo) com os dados da lista.
- Nos que existem, a lista só preenche o que está vazio na ficha (nunca substitui).
- A inscrição na edição fica «inscrito» (a Xistarca já os inscreveu).
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .backend.core import Actor, audit
from .db.pool import Conn
from .registry import AthleteIn, link_results, name_words, save_athlete
from .validation import is_valid_id_number, is_valid_phone

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ListRow(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=160)
    gender: str | None = None
    idNumber: str | None = None
    birthDate: str | None = None
    email: str | None = None
    phone: str | None = None


@dataclass
class ImportResult:
    rows: int = 0
    matched: int = 0
    created: int = 0
    completed: int = 0  # fichas existentes a que a lista acrescentou dados
    marked: int = 0  # inscrições que passaram a «inscrito»
    already: int = 0  # já estavam inscritos
    skipped: list[dict[str, Any]] = field(default_factory=list)
    notes: list[dict[str, Any]] = field(default_factory=list)
    created_names: list[str] = field(default_factory=list)
    # Pediram a inscrição no site mas não estão na lista da Xistarca
    not_in_list: list[dict[str, Any]] = field(default_factory=list)


def _cc(v: Any) -> str | None:
    d = re.sub(r"\D", "", str(v or ""))[:8]
    return d if d and is_valid_id_number(d) else None


def _birth(v: Any) -> str | None:
    s = str(v or "").strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            d = datetime.strptime(s, fmt).date()
        except ValueError:
            continue
        return d.isoformat() if date(1920, 1, 1) <= d <= date.today() else None
    return None


def _gender(v: Any) -> str | None:
    s = str(v or "").strip().lower()[:1]
    return {"f": "Feminino", "m": "Masculino"}.get(s)


def _phone(v: Any) -> str | None:
    s = re.sub(r"\s", "", str(v or ""))
    if s.startswith("+351"):
        s = s[4:]
    return s if s and is_valid_phone(s) else None


def _email(v: Any) -> str | None:
    s = str(v or "").strip().lower()
    return s if EMAIL.match(s) else None


def _key(name: str) -> str:
    return " ".join(name_words(name))


async def import_list(c: Conn, who: Actor, edition_id: int, raw_rows: list[ListRow]) -> ImportResult:
    res = ImportResult(rows=len(raw_rows))
    athletes = [
        dict(x)
        for x in await (
            await c.execute("select id::text, code, name, birth_date::text as birth, id_number, gender, email, phone from athletes")
        ).fetchall()
    ]
    by_cc = {str(a["id_number"]).lstrip("0"): a for a in athletes if a["id_number"]}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for a in athletes:
        by_name.setdefault(_key(a["name"]), []).append(a)
    seen: set[str] = set()
    await c.execute("select set_config('app.identity_change', 'on', true)")
    for i, r in enumerate(raw_rows, start=1):
        cc, birth, gender, phone, email = _cc(r.idNumber), _birth(r.birthDate), _gender(r.gender), _phone(r.phone), _email(r.email)
        if r.idNumber and not cc:
            res.notes.append({"row": i, "name": r.name, "message": "n.º do CC/passaporte não é um CC português: não foi guardado"})
        found = by_cc.get(cc.lstrip("0")) if cc else None
        if not found:
            same = by_name.get(_key(r.name), [])
            exact = [a for a in same if birth and a["birth"] == birth]
            loose = [a for a in same if not a["birth"] or not birth]
            if len(exact) == 1:
                found = exact[0]
            elif not exact and len(loose) == 1 and not (cc and loose[0]["id_number"]):
                found = loose[0]
        if found:
            if found["id"] in seen:
                res.skipped.append({"row": i, "name": r.name, "message": f"repetido na lista (mesmo atleta que {found['name']}, {found['code']})"})
                continue
            res.matched += 1
            # Só preenche o que falta na ficha
            fill = {
                col: val
                for col, val in (("id_number", cc), ("birth_date", birth), ("gender", gender), ("email", email), ("phone", phone))
                if val and not found.get("birth" if col == "birth_date" else col)
            }
            if fill:
                sets = ", ".join(f"{col} = %s" for col in fill)
                await c.execute(f"update athletes set {sets} where id = %s", [*fill.values(), found["id"]])  # noqa: S608 — colunas fixas
                await audit(c, who, "athletes.trophy_list_fill", "athletes", found["id"], {"fields": sorted(fill)})
                res.completed += 1
            athlete_id = found["id"]
        else:
            data = AthleteIn.model_validate(
                {"name": r.name, "gender": gender, "idNumber": cc, "birthDate": birth, "email": email, "phone": phone, "sport": "atletismo"}
            )
            athlete_id, _ = await save_athlete(c, who, data)
            await c.execute("select set_config('app.identity_change', 'on', true)")
            res.created += 1
            res.created_names.append(r.name)
            row = await (await c.execute("select code from athletes where id = %s", [athlete_id])).fetchone()
            new = {"id": athlete_id, "code": row["code"] if row else "", "name": r.name, "birth": birth, "id_number": cc}
            if cc:
                by_cc[cc.lstrip("0")] = new
            by_name.setdefault(_key(r.name), []).append(new)
        seen.add(athlete_id)
        cur = await c.execute(
            """insert into race_signups (edition_id, athlete_id, requested_by, consent_at, status, sent_at, message)
               values (%s, %s, %s, now(), 'inscrito', now(), 'Na lista de inscritos da Xistarca')
               on conflict (edition_id, athlete_id) do update
                  set status = 'inscrito', sent_at = coalesce(race_signups.sent_at, now()), message = excluded.message
                where race_signups.status <> 'inscrito'
               returning id""",
            [edition_id, athlete_id, who.id],
        )
        if await cur.fetchone():
            res.marked += 1
        else:
            res.already += 1
    await c.execute("select set_config('app.identity_change', 'off', true)")
    # Pediram no site (ou a secretaria pediu) mas a Xistarca não os tem na lista
    for x in await (
        await c.execute(
            """select a.code, a.name, s.status from race_signups s join athletes a on a.id = s.athlete_id
                where s.edition_id = %s and s.status in ('pedido', 'validado', 'erro') and not (a.id::text = any(%s))
                order by a.name""",
            [edition_id, list(seen)],
        )
    ).fetchall():
        res.not_in_list.append(dict(x))
    if res.created:
        await link_results(c)
    await audit(
        c,
        who,
        "races.import_list",
        "race_editions",
        edition_id,
        {"rows": res.rows, "matched": res.matched, "created": res.created, "marked": res.marked},
    )
    return res


__all__ = ["ImportResult", "ListRow", "import_list"]
