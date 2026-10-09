"""
Sócios e atletas criados ou alterados no backoffice: à mão (um de cada vez) ou por ficheiro.

As mesmas regras servem os dois caminhos. Na importação, o ficheiro é lido no browser, as
linhas chegam já em JSON e são todas validadas antes de se gravar; com algum erro, não se
grava nada (e o relatório diz a linha e o campo).

Contas no site: um sócio ou um encarregado com email fica ligado à conta com esse email
(criada se não existir, sem password: a pessoa define-a com o convite, «Esqueci-me da
password» ou a entrada com Google/Microsoft).
"""

import re
import unicodedata
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError, field_validator

from .backend.core import Actor, audit
from .db.pool import Conn
from .validation import is_valid_id_number, is_valid_nif, is_valid_phone, is_valid_postal_code
from .web import HttpError

NO_PASSWORD = "!"  # noqa: S105 — não é uma password: um valor que nunca coincide (ver password.verify_password)
SPORTS = ("atletismo", "futsal", "rugby", "formacao", "escola-de-desporto")
MAX_ROWS = 2000


# ------------------------------------------------------------------ normalização (o que vem dos ficheiros vem de muitas formas)
def _blank(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _to_date(v: Any) -> str | None:
    v = _blank(v)
    if v is None:
        return None
    if isinstance(v, date | datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError("data inválida (usa AAAA-MM-DD ou DD/MM/AAAA)")


def _digits(v: Any) -> str | None:
    v = _blank(v)
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"[\s.\-]", "", str(v))


def _phone_text(v: Any) -> str | None:
    v = _blank(v)
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"[\s.\-()]", "", str(v))


def _email(v: Any) -> str | None:
    v = _blank(v)
    if v is None:
        return None
    v = str(v).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v) or len(v) > 200:
        raise ValueError("email inválido")
    return v


def _member_number(v: Any) -> str | None:
    v = _digits(v)
    if v is None:
        return None
    if not re.fullmatch(r"\d{1,8}", v):
        raise ValueError("n.º de sócio: só algarismos")
    return v.zfill(5)


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower())


_GENDERS = {"f": "Feminino", "feminino": "Feminino", "m": "Masculino", "masculino": "Masculino"}
_SPORTS = {_key(s): s for s in SPORTS} | {"escoladefutsal": "futsal", "escoladerugby": "rugby", "escoladedesporto": "escola-de-desporto"}
_STATUS = {"ativo": "Ativo", "pendente": "Pendente", "suspenso": "Suspenso"}

Text = Annotated[Annotated[str, Field(max_length=300)] | None, BeforeValidator(_blank)]
Name = Annotated[str, BeforeValidator(_blank), Field(min_length=3, max_length=160)]
DateStr = Annotated[str | None, BeforeValidator(_to_date)]
Email = Annotated[str | None, BeforeValidator(_email)]
Digits = Annotated[str | None, BeforeValidator(_digits)]
Phone = Annotated[Annotated[str, Field(max_length=20)] | None, BeforeValidator(_phone_text)]
MemberNumber = Annotated[str | None, BeforeValidator(_member_number)]


class _Person(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Name
    email: Email = None
    phone: Phone = None
    taxNumber: Digits = None
    birthDate: DateStr = None
    address: Text = None
    postalCode: Text = None
    city: Annotated[Annotated[str, Field(max_length=100)] | None, BeforeValidator(_blank)] = None

    @field_validator("taxNumber")
    @classmethod
    def _nif(cls, v: str | None) -> str | None:
        if v is not None and not is_valid_nif(v):
            raise ValueError("NIF inválido")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is not None and not is_valid_phone(v):
            raise ValueError("telemóvel inválido")
        return v

    @field_validator("postalCode")
    @classmethod
    def _postal(cls, v: str | None) -> str | None:
        if v is not None and not is_valid_postal_code(v):
            raise ValueError("código postal inválido (0000-000)")
        return v


class MemberIn(_Person):
    """Sócio. Sem n.º, recebe o seguinte livre."""

    memberNumber: MemberNumber = None
    category: Annotated[str, BeforeValidator(_blank), Field(min_length=2, max_length=40)] = "Efetivo"
    status: Annotated[Literal["Ativo", "Pendente", "Suspenso"], BeforeValidator(lambda v: _STATUS.get(_key(str(v)), v) if _blank(v) else "Ativo")] = (
        "Ativo"
    )
    joinedOn: DateStr = None
    notes: Annotated[str, BeforeValidator(lambda v: _blank(v) or ""), Field(max_length=1000)] = ""


class AthleteIn(_Person):
    """Atleta. Sem código, recebe o seguinte (SFC-0001…)."""

    code: Annotated[Annotated[str, Field(pattern=r"^[A-Za-z]{2,5}-?\d{1,6}$")] | None, BeforeValidator(_blank)] = None
    gender: Annotated[Literal["Feminino", "Masculino"] | None, BeforeValidator(lambda v: _GENDERS.get(_key(str(v)), v) if _blank(v) else None)] = None
    sport: Annotated[str, BeforeValidator(lambda v: _SPORTS.get(_key(str(v)), str(v)) if _blank(v) else "atletismo")] = "atletismo"
    category: Annotated[Annotated[str, Field(max_length=40)] | None, BeforeValidator(_blank)] = None
    memberNumber: MemberNumber = None
    idNumber: Digits = None
    idExpiry: DateStr = None
    guardianName: Annotated[Annotated[str, Field(max_length=160)] | None, BeforeValidator(_blank)] = None
    guardianEmail: Email = None
    accountEmail: Email = None  # atleta adulto com conta própria no site

    @field_validator("sport")
    @classmethod
    def _sport(cls, v: str) -> str:
        if v not in SPORTS:
            raise ValueError(f"modalidade desconhecida (usa: {', '.join(SPORTS)})")
        return v

    @field_validator("idNumber")
    @classmethod
    def _cc(cls, v: str | None) -> str | None:
        if v is not None and not is_valid_id_number(v[:8]):
            raise ValueError("n.º do CC inválido")
        return v


# ------------------------------------------------------------------ contas no site
async def account_for(c: Conn, email: str, name: str) -> tuple[str, bool]:
    """Conta com este email (criada sem password se não existir). Devolve (id, criada)."""
    cur = await c.execute("select id from users where email = %s", [email])
    row = await cur.fetchone()
    if row:
        return str(row["id"]), False
    cur = await c.execute("insert into users (email, name, password_hash) values (%s, %s, %s) returning id", [email, name, NO_PASSWORD])
    row = await cur.fetchone()
    assert row is not None
    return str(row["id"]), True


# ------------------------------------------------------------------ sócios
async def next_member_number(c: Conn) -> str:
    for _ in range(50):
        cur = await c.execute("select lpad(nextval('member_number_seq')::text, 5, '0') as n")
        row = await cur.fetchone()
        assert row is not None
        if not await (await c.execute("select 1 from members where member_number = %s", [row["n"]])).fetchone():
            return str(row["n"])
    raise HttpError(409, "conflict", "Não foi possível atribuir um n.º de sócio livre")


async def _bump_member_seq(c: Conn) -> None:
    await c.execute(
        """select setval('member_number_seq', greatest(nextval('member_number_seq'),
                  coalesce((select max(member_number::int) from members where member_number ~ '^\\d{1,8}$'), 0) + 1), false)"""
    )


MEMBER_FIELDS = {
    "name": "name",
    "email": "email",
    "phone": "phone",
    "taxNumber": "tax_number",
    "birthDate": "birth_date",
    "address": "address",
    "postalCode": "postal_code",
    "city": "city",
    "category": "category",
    "status": "status",
    "notes": "notes",
}


async def save_member(c: Conn, who: Actor, m: MemberIn, *, number: str | None = None, link_account: bool = True) -> tuple[str, str]:
    """Cria ou atualiza (pelo n.º; ou pelo email, se o n.º não vier). Devolve (n.º, «created»|«updated»)."""
    number = number or m.memberNumber
    existing = None
    if number:
        existing = await (await c.execute("select * from members where member_number = %s for update", [number])).fetchone()
    elif m.email:
        existing = await (await c.execute("select * from members where email = %s order by member_number limit 1 for update", [m.email])).fetchone()
        number = existing["member_number"] if existing else None
    data = m.model_dump(exclude_unset=True, exclude={"memberNumber", "joinedOn"})
    values = {MEMBER_FIELDS[k]: v for k, v in data.items() if k in MEMBER_FIELDS}
    if existing:
        if values:
            sets = ", ".join(f"{col} = %s" for col in values)
            await c.execute(f"update members set {sets} where member_number = %s", [*values.values(), number])
        if m.joinedOn:
            await c.execute("update members set joined_on = %s where member_number = %s", [m.joinedOn, number])
        result = "updated"
    else:
        number = number or await next_member_number(c)
        values.setdefault("category", m.category)
        values.setdefault("status", m.status)
        cols = ["member_number", *values, "joined_on"]
        await c.execute(
            f"insert into members ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})",
            [number, *values.values(), m.joinedOn or date.today().isoformat()],
        )
        result = "created"
    assert number is not None
    if link_account and m.email:
        await _link_member_account(c, number, m.email, m.name)
    await audit(c, who, f"members.{'create' if result == 'created' else 'update'}", "members", number, {"fields": sorted(data)})
    return number, result


async def _link_member_account(c: Conn, number: str, email: str, name: str) -> None:
    row = await (await c.execute("select user_id from members where member_number = %s", [number])).fetchone()
    if row and row["user_id"]:
        return
    user_id, _ = await account_for(c, email, name)
    taken = await (await c.execute("select member_number from members where user_id = %s", [user_id])).fetchone()
    if not taken:
        await c.execute("update members set user_id = %s where member_number = %s", [user_id, number])


# ------------------------------------------------------------------ atletas
async def next_athlete_code(c: Conn) -> str:
    for _ in range(50):
        cur = await c.execute("select 'SFC-' || lpad(nextval('athlete_code_seq')::text, 4, '0') as code")
        row = await cur.fetchone()
        assert row is not None
        if not await (await c.execute("select 1 from athletes where code = %s", [row["code"]])).fetchone():
            return str(row["code"])
    raise HttpError(409, "conflict", "Não foi possível atribuir um código de atleta livre")


ATHLETE_FIELDS = {
    "name": "name",
    "birthDate": "birth_date",
    "gender": "gender",
    "idNumber": "id_number",
    "idExpiry": "id_expiry",
    "taxNumber": "tax_number",
    "email": "email",
    "phone": "phone",
    "address": "address",
    "postalCode": "postal_code",
    "city": "city",
    "sport": "sport_slug",
    "category": "category",
    "memberNumber": "member_number",
}


async def save_athlete(c: Conn, who: Actor, a: AthleteIn, *, athlete_id: str | None = None) -> tuple[str, str]:
    """Cria ou atualiza (pelo id; ou pelo código; ou pelo nome + data de nascimento). Devolve (id, «created»|«updated»)."""
    existing = None
    if athlete_id:
        existing = await (await c.execute("select id, code from athletes where id = %s for update", [athlete_id])).fetchone()
        if not existing:
            raise HttpError(404, "not_found", "Atleta não encontrado")
    elif a.code:
        existing = await (await c.execute("select id, code from athletes where upper(code) = upper(%s) for update", [a.code])).fetchone()
    elif a.birthDate:
        existing = await (
            await c.execute("select id, code from athletes where lower(name) = lower(%s) and birth_date = %s for update", [a.name, a.birthDate])
        ).fetchone()
    if a.memberNumber and not await (await c.execute("select 1 from members where member_number = %s", [a.memberNumber])).fetchone():
        raise HttpError(400, "unknown_member", f"memberNumber: não há sócio n.º {a.memberNumber}")
    data = a.model_dump(exclude_unset=True, exclude={"code", "guardianName", "guardianEmail", "accountEmail"})
    values = {ATHLETE_FIELDS[k]: v for k, v in data.items() if k in ATHLETE_FIELDS}
    # Quem gere os atletas é quem valida a identificação: pode corrigi-la aqui (fica na auditoria)
    await c.execute("select set_config('app.identity_change', 'on', true)")
    if existing:
        athlete_id = str(existing["id"])
        if values:
            sets = ", ".join(f"{col} = %s" for col in values)
            await c.execute(f"update athletes set {sets} where id = %s", [*values.values(), athlete_id])
        result = "updated"
    else:
        values.setdefault("sport_slug", a.sport)
        code = a.code.upper() if a.code else await next_athlete_code(c)
        cols = ["code", *values]
        cur = await c.execute(
            f"insert into athletes ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) returning id", [code, *values.values()]
        )
        row = await cur.fetchone()
        assert row is not None
        athlete_id = str(row["id"])
        result = "created"
    await c.execute("select set_config('app.identity_change', 'off', true)")
    if a.guardianEmail:
        await grant_access(c, athlete_id, a.guardianEmail, a.guardianName or a.guardianEmail.split("@")[0], "encarregado")
    if a.accountEmail:
        await grant_access(c, athlete_id, a.accountEmail, a.name, "atleta")
    await audit(c, who, f"athletes.{'create' if result == 'created' else 'admin_update'}", "athletes", athlete_id, {"fields": sorted(data)})
    return athlete_id, result


async def grant_access(c: Conn, athlete_id: str, email: str, name: str, role: str) -> str:
    user_id, _ = await account_for(c, email, name)
    await c.execute(
        "insert into athlete_access (user_id, athlete_id, role) values (%s, %s, %s) on conflict (user_id, athlete_id) do update set role = excluded.role",
        [user_id, athlete_id, role],
    )
    return user_id


# ------------------------------------------------------------------ importação
def validate_rows(kind: Literal["members", "athletes"], rows: list[dict[str, Any]]) -> tuple[list[BaseModel], list[dict[str, Any]]]:
    """Valida todas as linhas (n.º de linha = posição no ficheiro, a começar em 1)."""
    model: type[MemberIn] | type[AthleteIn] = MemberIn if kind == "members" else AthleteIn
    key_field = "memberNumber" if kind == "members" else "code"
    ok: list[BaseModel] = []
    errors: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    for i, raw in enumerate(rows, start=1):
        clean = {k: v for k, v in raw.items() if _blank(v) is not None}
        try:
            item = model.model_validate(clean)
        except ValidationError as e:
            for err in e.errors():
                field = ".".join(str(p) for p in err["loc"]) or "linha"
                msg = str(err["msg"]).removeprefix("Value error, ")
                if err["type"] == "missing":
                    msg = "obrigatório"
                elif err["type"] == "extra_forbidden":
                    msg = "coluna desconhecida"
                errors.append({"row": i, "field": field, "message": msg})
            continue
        key = getattr(item, key_field, None)
        if key:
            key = str(key).upper()
            if key in seen:
                errors.append({"row": i, "field": key_field, "message": f"repetido (linha {seen[key]})"})
                continue
            seen[key] = i
        ok.append(item)
    return ok, errors


async def import_rows(c: Conn, who: Actor, kind: Literal["members", "athletes"], rows: list[BaseModel]) -> dict[str, int]:
    out = {"created": 0, "updated": 0}
    for m in rows:
        if kind == "members":
            assert isinstance(m, MemberIn)
            _, result = await save_member(c, who, m)
        else:
            assert isinstance(m, AthleteIn)
            _, result = await save_athlete(c, who, m)
        out[result] += 1
    if kind == "members":
        await _bump_member_seq(c)
    return out


__all__ = ["MAX_ROWS", "AthleteIn", "MemberIn", "account_for", "grant_access", "import_rows", "save_athlete", "save_member", "validate_rows"]
