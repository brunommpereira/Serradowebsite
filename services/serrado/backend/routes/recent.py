"""
Novas entradas: tudo o que chegou pelo site nos últimos dias, numa só lista (mais recente primeiro).
Propostas de sócio e de atleta (também as que ainda esperam pela confirmação do email), pré-inscrições,
fichas de atleta novas, inscrições em eventos e contas criadas no site. Cada pessoa da equipa vê só o
que as suas permissões deixam ver.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request

from ...db.pool import fetch
from ..core import can, pool, require

REG_STATUS = {"por_confirmar": "À espera do email", "pendente": "Por decidir", "aceite": "Aceite", "recusada": "Recusada"}
SPORTS = {"atletismo": "Atletismo", "futsal": "Futsal", "rugby": "Rugby", "formacao": "Formação", "escola-de-desporto": "Escola de Desporto"}


def register(r: APIRouter) -> None:
    @r.get("/recent-entries", tags=["Novas entradas"], summary="Entradas dos últimos dias (propostas, pré-inscrições, atletas, eventos, contas)")
    async def recent(req: Request, days: Annotated[int, Query(ge=1, le=365)] = 30) -> list[dict[str, Any]]:
        require(req)  # equipa (o que cada um vê depende das permissões)
        db = pool(req)
        out: list[dict[str, Any]] = []
        if can(req, "registrations.manage"):
            for x in await fetch(
                db,
                """select id::text, kind, status, signed_at as at, coalesce(data->>'name', signer_name) as name, signer_email as email,
                          data->>'sport' as sport
                     from registrations where signed_at > now() - make_interval(days => %s)""",
                [days],
            ):
                sport = SPORTS.get(str(x["sport"] or ""), "")
                out.append(
                    {
                        "type": "proposta-atleta" if x["kind"] == "athlete" else "proposta-socio",
                        "id": x["id"],
                        "at": x["at"],
                        "name": x["name"],
                        "email": x["email"],
                        "detail": ("Inscrição de atleta" + (f" · {sport}" if sport else "")) if x["kind"] == "athlete" else "Proposta de sócio",
                        "status": REG_STATUS.get(x["status"], x["status"]),
                        "attention": x["status"] in ("por_confirmar", "pendente"),
                        "link": "/admin/registos",
                    }
                )
            for x in await fetch(
                db,
                """select id, sport, child_name, guardian_name, email, status, created_at as at
                     from interest_signups where created_at > now() - make_interval(days => %s)""",
                [days],
            ):
                out.append(
                    {
                        "type": "pre-inscricao",
                        "id": str(x["id"]),
                        "at": x["at"],
                        "name": x["child_name"],
                        "email": x["email"],
                        "detail": f"Pré-inscrição · {SPORTS.get(x['sport'], x['sport'])} · encarregado {x['guardian_name']}",
                        "status": str(x["status"]).capitalize(),
                        "attention": x["status"] == "novo",
                        "link": "/admin/pre-inscricoes",
                    }
                )
        if can(req, "athletes.view", "athletes.manage"):
            for x in await fetch(
                db,
                """select a.id::text, a.code, a.name, a.email, a.sport_slug, a.created_at as at,
                          exists (select 1 from athlete_access x where x.athlete_id = a.id) as linked
                     from athletes a where a.created_at > now() - make_interval(days => %s)""",
                [days],
            ):
                out.append(
                    {
                        "type": "atleta",
                        "id": x["id"],
                        "at": x["at"],
                        "name": x["name"],
                        "email": x["email"] or "",
                        "detail": f"Ficha de atleta {x['code']} · {SPORTS.get(x['sport_slug'], x['sport_slug'] or '')}",
                        "status": "Com conta ligada" if x["linked"] else "Sem conta ligada",
                        "attention": False,
                        "link": f"/admin/atletas?q={x['code']}",
                    }
                )
        if can(req, "registrations.manage", "payments.manage"):
            for x in await fetch(
                db,
                """select r.id, r.name, r.email, r.people, r.status, r.created_at as at, e.title
                     from event_registrations r join cms_events e on e.id = r.event_id
                    where r.created_at > now() - make_interval(days => %s)""",
                [days],
            ):
                out.append(
                    {
                        "type": "evento",
                        "id": str(x["id"]),
                        "at": x["at"],
                        "name": x["name"],
                        "email": x["email"],
                        "detail": f"{x['title']} · {x['people']} pessoa(s)",
                        "status": str(x["status"]).capitalize(),
                        "attention": False,
                        "link": "/admin/inscricoes-eventos",
                    }
                )
        if can(req, "users.manage"):
            # Contas criadas no site: quem não tem ficha de atleta, de sócio nem papel na equipa precisa de ser identificado
            for x in await fetch(
                db,
                """select u.id::text, u.name, u.email, u.created_at as at,
                          exists (select 1 from athlete_access x where x.user_id = u.id) as athlete,
                          exists (select 1 from members m where m.user_id = u.id) as member,
                          exists (select 1 from user_roles r where r.user_id = u.id) as staff
                     from users u where u.created_at > now() - make_interval(days => %s)""",
                [days],
            ):
                linked = [w for w, ok in (("atleta", x["athlete"]), ("sócio", x["member"]), ("equipa", x["staff"])) if ok]
                out.append(
                    {
                        "type": "conta",
                        "id": x["id"],
                        "at": x["at"],
                        "name": x["name"],
                        "email": x["email"],
                        "detail": "Conta criada no site",
                        "status": "Ligada a " + " e ".join(linked) if linked else "Sem ficha (nem atleta nem sócio)",
                        "attention": not linked,
                        "link": "/admin/utilizadores",
                    }
                )
        out.sort(key=lambda e: str(e["at"]), reverse=True)
        return out
