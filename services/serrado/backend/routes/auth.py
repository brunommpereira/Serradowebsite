"""Sessão: credenciais, entrada com Google/Microsoft, perfis, contas ligadas e papéis."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Request
from pydantic import BaseModel, ConfigDict, Field

from ...config import ROLES
from ...db.pool import Pool, execute, fetch, fetch_one, tx
from ...password import DUMMY_HASH, verify_password
from ..core import Actor, HttpError, actor, audit, forbidden, not_found, pool, require_role

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
UserId = Annotated[str, Path(pattern=UUID_PATTERN)]
Provider = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,32}$")]


async def load_profile(db: Pool, user_id: str) -> dict[str, Any] | None:
    """Perfil completo de um utilizador: papéis, sócio (opcional) e atletas a que tem acesso."""
    return await fetch_one(
        db,
        """select u.id, u.email, u.name,
             coalesce((select array_agg(role order by role) from user_roles where user_id = u.id), '{}') as roles,
             (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status, 'joinedOn', m.joined_on)
                from members m where m.user_id = u.id) as member,
             coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'role', aa.role) order by a.name)
                from athlete_access aa join athletes a on a.id = aa.athlete_id where aa.user_id = u.id), '[]') as athletes
           from users u where u.id = %s and not u.disabled""",
        [user_id],
    )


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


class RolesBody(BaseModel):
    roles: list[Literal["admin", "editor", "secretaria", "treinador"]]


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
        if who.id != id and "admin" not in who.roles:
            raise forbidden()
        return await fetch(
            pool(req),
            'select provider, email, linked_at as "linkedAt", last_used_at as "lastUsedAt" from user_identities where user_id = %s order by provider',
            [id],
        )

    @r.delete("/users/{id}/identities/{provider}", tags=["Sessão"], summary="Desligar uma conta externa (o próprio ou admin)")
    async def unlink(req: Request, id: UserId, provider: Provider) -> dict[str, bool]:
        who = actor(req)
        if who.id != id and "admin" not in who.roles:
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
        if who.id != id and "admin" not in who.roles:
            raise forbidden()
        profile = await load_profile(pool(req), id)
        if not profile:
            raise not_found("Utilizador")
        return profile

    @r.get("/users", tags=["Gestão"], summary="Lista de utilizadores (admin)")
    async def users(req: Request) -> list[dict[str, Any]]:
        require_role(req, "admin")
        return await fetch(
            pool(req),
            """select u.id, u.email, u.name, coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles,
                 (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status) from members m where m.user_id = u.id) as member,
                 '[]'::json as athletes
               from users u left join user_roles r on r.user_id = u.id group by u.id order by u.name""",
        )

    @r.put("/users/{id}/roles", tags=["Gestão"], summary="Define os papéis de backoffice de um utilizador (admin)")
    async def set_roles(req: Request, id: UserId, body: RolesBody) -> dict[str, Any]:
        require_role(req, "admin")
        if len(set(body.roles)) != len(body.roles):
            raise HttpError(400, "validation", "roles: valores repetidos")
        who = actor(req)
        if id == who.id and "admin" not in body.roles:
            raise forbidden()  # não remover o próprio acesso de admin
        async with tx(pool(req)) as c:
            await c.execute("delete from user_roles where user_id = %s", [id])
            for role in body.roles:
                await c.execute("insert into user_roles values (%s, %s)", [id, role])
            await audit(c, who, "users.roles", "users", id, {"roles": body.roles})
        return {"id": id, "roles": body.roles}


assert set(ROLES) == {"admin", "editor", "secretaria", "treinador"}
