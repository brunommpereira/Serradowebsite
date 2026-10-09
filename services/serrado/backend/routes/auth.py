"""Sessão: credenciais, entrada com Google/Microsoft, perfis, contas ligadas e papéis."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from ...config import config
from ...db.pool import Pool, execute, fetch, fetch_one, tx
from ...password import DUMMY_HASH, hash_password, verify_password
from ...permissions import ADMIN, PERMISSIONS, effective
from ...registry import NO_PASSWORD, _email
from ..accounts import MIN_PASSWORD, send_link, token_hash
from ..core import Actor, HttpError, actor, audit, can, forbidden, not_found, pool, require

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
UserId = Annotated[str, Path(pattern=UUID_PATTERN)]
Provider = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,32}$")]


async def load_profile(db: Pool, user_id: str) -> dict[str, Any] | None:
    """Perfil completo de um utilizador: papéis, permissões, sócio (opcional) e atletas a que tem acesso."""
    row = await fetch_one(
        db,
        """select u.id, u.email, u.name,
             coalesce((select array_agg(role order by role) from user_roles where user_id = u.id), '{}') as roles,
             coalesce((select array_agg(distinct rp.permission) from user_roles ur join role_permissions rp on rp.role = ur.role
                        where ur.user_id = u.id), '{}') as permissions,
             (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status, 'joinedOn', m.joined_on)
                from members m where m.user_id = u.id) as member,
             coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'role', aa.role) order by a.name)
                from athlete_access aa join athletes a on a.id = aa.athlete_id where aa.user_id = u.id), '[]') as athletes
           from users u where u.id = %s and not u.disabled""",
        [user_id],
    )
    if row:
        row["permissions"] = sorted(effective(list(row["roles"]), set(row["permissions"])))
    return row


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class ExternalIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(pattern=r"^[a-z0-9-]{1,32}$")
    subject: str = Field(min_length=1, max_length=255)
    email: str | None = Field(max_length=200)
    emailVerified: bool


RoleKey = Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]{1,30}$")]


class RolesBody(BaseModel):
    roles: list[RoleKey] = Field(max_length=20)


class NewUser(RolesBody):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=3, max_length=160)
    email: Annotated[str, BeforeValidator(_email)]
    invite: bool = True


class RoleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(default="", max_length=300)
    permissions: list[Annotated[str, Field(max_length=40)]] = Field(max_length=len(PERMISSIONS))


class NewRole(RoleBody):
    key: RoleKey


class Forgot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=200)


class Reset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=100)
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)


def mail_required() -> None:
    if not config.mail.enabled:
        raise HttpError(503, "mail_disabled", "O envio de emails não está configurado. Contacta a secretaria.")


async def check_roles(req: Request, roles: list[str], user_id: str | None) -> None:
    """Quem pode dar que papéis: só um admin dá «admin»; os outros só dão papéis com permissões que eles próprios têm."""
    if len(set(roles)) != len(roles):
        raise HttpError(400, "validation", "roles: valores repetidos")
    who = actor(req)
    if user_id == who.id and "admin" in who.roles and "admin" not in roles:
        raise forbidden()  # não remover o próprio acesso de admin
    if "admin" in roles and "admin" not in who.roles:
        raise forbidden()  # só um admin dá o papel de admin
    known = {
        r["key"]: set(r["permissions"])
        for r in await fetch(
            pool(req),
            "select key, coalesce((select array_agg(permission) from role_permissions where role = key), '{}') as permissions from roles",
        )
    }
    if not set(roles) <= set(known):
        raise HttpError(400, "unknown_role", f"Papel desconhecido: {', '.join(sorted(set(roles) - set(known)))}")
    if ADMIN not in who.roles:
        current = {r["role"] for r in await fetch(pool(req), "select role from user_roles where user_id = %s", [user_id])} if user_id else set()
        if any(not known[k] <= who.permissions for k in set(roles) - current):
            raise forbidden()  # só se atribuem papéis com permissões que o próprio tem


def check_permissions(perms: list[str]) -> list[str]:
    unknown = sorted(set(perms) - set(PERMISSIONS))
    if unknown:
        raise HttpError(400, "unknown_permission", f"Permissão desconhecida: {', '.join(unknown)}")
    return sorted(set(perms))


def register(r: APIRouter) -> None:
    @r.post("/auth/verify", tags=["Sessão"], summary="Valida credenciais (email ou n.º de sócio + password)")
    async def verify(req: Request, body: Credentials) -> dict[str, Any]:
        login = body.login.strip().lower()
        number = login.zfill(5) if login.isdigit() else None
        row = await fetch_one(
            pool(req),
            """select u.id, u.password_hash from users u left join members m on m.user_id = u.id
                where not u.disabled and (u.email = %s or m.member_number = %s) limit 1""",
            [login, number],
        )
        # Mesmo trabalho com ou sem conta: não revela se o email existe
        ok = await verify_password(body.password, row["password_hash"] if row else DUMMY_HASH)
        if not row or not ok:
            raise HttpError(401, "invalid_credentials", "Credenciais inválidas")
        await execute(pool(req), "update users set last_login_at = now() where id = %s", [row["id"]])
        profile = await load_profile(pool(req), row["id"])
        if not profile:
            raise HttpError(401, "invalid_credentials", "Credenciais inválidas")
        return profile

    @r.post("/auth/password/forgot", tags=["Sessão"], summary="Envia por email uma ligação para repor a password", status_code=202)
    async def forgot(req: Request, body: Forgot) -> dict[str, bool]:
        mail_required()
        email = body.email.strip().lower()
        async with tx(pool(req)) as c:
            cur = await c.execute("select id, name, email from users where email = %s and not disabled", [email])
            row = await cur.fetchone()
            # No máximo um email de reposição a cada 2 minutos por conta (não enche a caixa de ninguém)
            recent = (
                row
                and await (
                    await c.execute(
                        "select 1 from password_tokens where user_id = %s and purpose = 'reset' and created_at > now() - interval '2 minutes'",
                        [row["id"]],
                    )
                ).fetchone()
            )
            if row and not recent:
                await send_link(c, user_id=row["id"], email=row["email"], name=row["name"], purpose="reset")
                await audit(c, Actor(id=row["id"]), "auth.password_forgot", "users", row["id"], {})
        return {"ok": True}  # a mesma resposta com ou sem conta: não revela que emails existem

    @r.post("/auth/password/reset", tags=["Sessão"], summary="Define a password com a ligação recebida por email (reposição ou convite)")
    async def reset(req: Request, body: Reset) -> dict[str, Any]:
        password_hash = await hash_password(body.password)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                """update password_tokens set used_at = now()
                    where token_hash = %s and used_at is null and expires_at > now() returning user_id, purpose""",
                [token_hash(body.token)],
            )
            tok = await cur.fetchone()
            if not tok:
                raise HttpError(400, "invalid_token", "A ligação é inválida, já foi usada ou expirou. Pede uma nova.")
            cur = await c.execute(
                "update users set password_hash = %s, password_changed_at = now() where id = %s and not disabled returning email",
                [password_hash, tok["user_id"]],
            )
            user = await cur.fetchone()
            if not user:
                raise HttpError(400, "invalid_token", "A ligação é inválida, já foi usada ou expirou. Pede uma nova.")
            # As outras ligações deixam de valer e as sessões abertas terminam (password_changed_at)
            await c.execute("update password_tokens set used_at = now() where user_id = %s and used_at is null", [tok["user_id"]])
            await audit(c, Actor(id=tok["user_id"]), f"auth.password_{tok['purpose']}", "users", tok["user_id"], {})
        return {"ok": True, "email": user["email"]}

    @r.post(
        "/auth/oauth",
        tags=["Sessão"],
        summary="Entrada com uma conta externa (Google, Microsoft…) já validada pelo middleware",
        description="Procura a conta ligada a (provider, subject). Na primeira vez, liga-a à conta do clube com o mesmo email, "
        "só se o fornecedor garantir que o email está verificado. Não cria contas novas.",
    )
    async def oauth_login(req: Request, body: ExternalIdentity) -> dict[str, Any]:
        user_id: str | None = None
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "select i.user_id, u.disabled from user_identities i join users u on u.id = i.user_id where i.provider = %s and i.subject = %s",
                [body.provider, body.subject],
            )
            linked = await cur.fetchone()
            if linked:
                if not linked["disabled"]:
                    await c.execute(
                        "update user_identities set last_used_at = now() where provider = %s and subject = %s", [body.provider, body.subject]
                    )
                    user_id = linked["user_id"]
            elif body.emailVerified and body.email:
                # Primeira entrada com esta conta: só com email verificado pelo fornecedor e igual ao da conta do clube
                email = body.email.strip().lower()
                cur = await c.execute("select id from users where email = %s and not disabled", [email])
                found = await cur.fetchone()
                if found:
                    cur = await c.execute("select 1 from user_identities where user_id = %s and provider = %s", [found["id"], body.provider])
                    if await cur.fetchone():
                        raise HttpError(409, "other_identity_linked", "Esta conta do clube já está ligada a outra conta deste fornecedor")
                    await c.execute(
                        "insert into user_identities (provider, subject, user_id, email, last_used_at) values (%s, %s, %s, %s, now())",
                        [body.provider, body.subject, found["id"], email],
                    )
                    await audit(c, Actor(id=found["id"]), "users.identity.link", "users", found["id"], {"provider": body.provider})
                    user_id = found["id"]
        # Mesma resposta para «não existe» e «desativada»: não revela que contas existem
        if not user_id:
            raise HttpError(403, "no_account", "Não há nenhuma conta do clube associada a este email")
        await execute(pool(req), "update users set last_login_at = now() where id = %s", [user_id])
        profile = await load_profile(pool(req), user_id)
        if not profile:
            raise HttpError(403, "no_account", "Não há nenhuma conta do clube associada a este email")
        return profile

    @r.get("/users/{id}/identities", tags=["Sessão"], summary="Contas externas ligadas (o próprio ou admin)")
    async def identities(req: Request, id: UserId) -> list[dict[str, Any]]:
        who = actor(req)
        if who.id != id and not can(req, "users.manage"):
            raise forbidden()
        return await fetch(
            pool(req),
            'select provider, email, linked_at as "linkedAt", last_used_at as "lastUsedAt" from user_identities where user_id = %s order by provider',
            [id],
        )

    @r.delete("/users/{id}/identities/{provider}", tags=["Sessão"], summary="Desligar uma conta externa (o próprio ou admin)")
    async def unlink(req: Request, id: UserId, provider: Provider) -> dict[str, bool]:
        who = actor(req)
        if who.id != id and not can(req, "users.manage"):
            raise forbidden()
        async with tx(pool(req)) as c:
            cur = await c.execute("delete from user_identities where user_id = %s and provider = %s", [id, provider])
            if not cur.rowcount:
                raise not_found("Ligação")
            await audit(c, who, "users.identity.unlink", "users", id, {"provider": provider})
        return {"ok": True}

    @r.get("/users/{id}", tags=["Sessão"], summary="Perfil de um utilizador")
    async def user(req: Request, id: UserId) -> dict[str, Any]:
        who = actor(req)
        if who.id != id and not can(req, "users.manage"):
            raise forbidden()
        profile = await load_profile(pool(req), id)
        if not profile:
            raise not_found("Utilizador")
        return profile

    @r.post("/users/{id}/invite", tags=["Gestão"], summary="Envia por email o convite para definir a password", status_code=202)
    async def invite(req: Request, id: UserId) -> dict[str, bool]:
        require(req, "users.manage", "members.manage", "athletes.manage")
        mail_required()
        async with tx(pool(req)) as c:
            cur = await c.execute("select id, name, email from users where id = %s and not disabled", [id])
            row = await cur.fetchone()
            if not row:
                raise not_found("Utilizador")
            await send_link(c, user_id=row["id"], email=row["email"], name=row["name"], purpose="invite")
            await audit(c, actor(req), "users.invite", "users", id, {})
        return {"ok": True}

    @r.get("/users", tags=["Gestão"], summary="Lista de utilizadores (gestão de utilizadores)")
    async def users(req: Request) -> list[dict[str, Any]]:
        require(req, "users.manage")
        return await fetch(
            pool(req),
            """select u.id, u.email, u.name, coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles,
                 (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status) from members m where m.user_id = u.id) as member,
                 '[]'::json as athletes
               from users u left join user_roles r on r.user_id = u.id group by u.id order by u.name""",
        )

    @r.post("/users", tags=["Gestão"], summary="Cria uma conta (sem password) com papéis e envia o convite", status_code=201)
    async def create_user(req: Request, body: NewUser) -> dict[str, Any]:
        require(req, "users.manage")
        await check_roles(req, body.roles, None)
        who = actor(req)
        name = " ".join(body.name.split())
        invited = body.invite and config.mail.enabled
        async with tx(pool(req)) as c:
            if await (await c.execute("select 1 from users where email = %s", [body.email])).fetchone():
                raise HttpError(409, "email_exists", "Já existe uma conta com este email. Procura-a na lista e muda os papéis.")
            cur = await c.execute("insert into users (email, name, password_hash) values (%s, %s, %s) returning id", [body.email, name, NO_PASSWORD])
            row = await cur.fetchone()
            assert row is not None
            uid = str(row["id"])
            for role in body.roles:
                await c.execute("insert into user_roles values (%s, %s)", [uid, role])
            if invited:
                await send_link(c, user_id=uid, email=body.email, name=name, purpose="invite")
            await audit(c, who, "users.create", "users", uid, {"roles": body.roles, "invited": invited})
        return {"id": uid, "invited": invited}

    @r.put("/users/{id}/roles", tags=["Gestão"], summary="Define os papéis de backoffice de um utilizador")
    async def set_roles(req: Request, id: UserId, body: RolesBody) -> dict[str, Any]:
        require(req, "users.manage")
        await check_roles(req, body.roles, id)
        who = actor(req)
        async with tx(pool(req)) as c:
            await c.execute("delete from user_roles where user_id = %s", [id])
            for role in body.roles:
                await c.execute("insert into user_roles values (%s, %s)", [id, role])
            await audit(c, who, "users.roles", "users", id, {"roles": body.roles})
        return {"id": id, "roles": body.roles}

    # ------------------------------------------------------------- papéis e permissões
    @r.get("/permissions", tags=["Gestão"], summary="Catálogo de permissões (fixo no código)")
    async def permissions(req: Request) -> list[dict[str, str]]:
        require(req, "users.manage")
        return [{"key": k, "description": v} for k, v in PERMISSIONS.items()]

    @r.get("/roles", tags=["Gestão"], summary="Papéis, as suas permissões e quantos utilizadores têm cada um")
    async def roles(req: Request) -> list[dict[str, Any]]:
        require(req, "users.manage")
        rows = await fetch(
            pool(req),
            """select r.key, r.name, r.description, r.builtin,
                      coalesce((select array_agg(permission order by permission) from role_permissions where role = r.key), '{}') as permissions,
                      (select count(*)::int from user_roles where role = r.key) as users
                 from roles r order by r.builtin desc, r.name""",
        )
        for row in rows:
            if row["key"] == ADMIN:
                row["permissions"] = sorted(PERMISSIONS)
        return rows

    async def _save_permissions(c: Any, key: str, perms: list[str]) -> None:
        await c.execute("delete from role_permissions where role = %s", [key])
        for p in perms:
            await c.execute("insert into role_permissions values (%s, %s)", [key, p])

    @r.post("/roles", tags=["Gestão"], summary="Cria um papel", status_code=201)
    async def create_role(req: Request, body: NewRole) -> dict[str, Any]:
        require(req, "users.manage")
        perms = check_permissions(body.permissions)
        who = actor(req)
        if ADMIN not in who.roles and not set(perms) <= who.permissions:
            raise forbidden()  # ninguém dá permissões que não tem
        async with tx(pool(req)) as c:
            await c.execute("insert into roles (key, name, description) values (%s, %s, %s)", [body.key, body.name, body.description])
            await _save_permissions(c, body.key, perms)
            await audit(c, who, "roles.create", "roles", body.key, {"permissions": perms})
        return {"key": body.key, "name": body.name, "description": body.description, "builtin": False, "permissions": perms, "users": 0}

    @r.put("/roles/{key}", tags=["Gestão"], summary="Altera o nome, a descrição e as permissões de um papel")
    async def update_role(req: Request, key: Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{1,30}$")], body: RoleBody) -> dict[str, Any]:
        require(req, "users.manage")
        perms = check_permissions(body.permissions)
        who = actor(req)
        if key == ADMIN:
            perms = sorted(PERMISSIONS)  # o admin tem sempre tudo
        elif ADMIN not in who.roles and not set(perms) <= who.permissions:
            raise forbidden()  # ninguém dá permissões que não tem
        async with tx(pool(req)) as c:
            cur = await c.execute("update roles set name = %s, description = %s where key = %s", [body.name, body.description, key])
            if not cur.rowcount:
                raise not_found("Papel")
            if key != ADMIN:
                await _save_permissions(c, key, perms)
            await audit(c, who, "roles.update", "roles", key, {"permissions": perms})
        return {"key": key, "name": body.name, "description": body.description, "permissions": perms}

    @r.delete("/roles/{key}", tags=["Gestão"], summary="Apaga um papel criado no backoffice (os de origem não se apagam)", status_code=204)
    async def delete_role(req: Request, key: Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{1,30}$")]) -> None:
        require(req, "users.manage")
        async with tx(pool(req)) as c:
            cur = await c.execute("select builtin from roles where key = %s for update", [key])
            row = await cur.fetchone()
            if not row:
                raise not_found("Papel")
            if row["builtin"]:
                raise HttpError(409, "builtin_role", "Os papéis de origem não se apagam; podes mudar as permissões")
            await c.execute("delete from roles where key = %s", [key])
            await audit(c, actor(req), "roles.delete", "roles", key, {})
