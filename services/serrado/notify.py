"""
O que gera notificações push (cada uma vai para a fila em push_outbox, na mesma transação):

- Notícias e eventos: quando são publicados pela primeira vez.
- Jogos: resultado lançado (ou corrigido) e lembrete na véspera, por modalidade.
- Pagamentos: nova quota ou mensalidade para pagar, e pagamento recebido.
- Pedidos de gasto: a quem tem de decidir, e a quem pediu, em cada passo (as mesmas pessoas do email).
"""

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .db.pool import Conn, Pool, fetch, fetch_one
from .push import message, once, to_topic, to_users

LISBON = ZoneInfo("Europe/Lisbon")
SPORT_NAMES = {"atletismo": "Atletismo", "futsal": "Futsal", "rugby": "Rugby", "formacao": "Formação", "escola-de-desporto": "Escola de Desporto"}


def eur(v: Any) -> str:
    return f"{float(v or 0):,.2f} €".replace(",", " ").replace(".", ",")


# ------------------------------------------------------------------ notícias e eventos
async def published(c: Conn, type_: str, row: dict[str, Any]) -> None:
    if type_ not in ("news", "events") or not await once(c, f"cms:{type_}:{row['id']}"):
        return
    if type_ == "news":
        await to_topic(c, "noticias", message("Notícia · Serrado FC", str(row["title"]), f"/noticias/{row['slug']}", f"news-{row['id']}"))
    else:
        when = ""
        if row.get("starts_at"):  # hora local de Portugal (sem fuso)
            when = f"{datetime.fromisoformat(str(row['starts_at'])):%d/%m %H:%M} · "
        await to_topic(c, "eventos", message("Evento · Serrado FC", f"{when}{row['title']}", f"/eventos/{row['slug']}", f"event-{row['id']}"))


# ------------------------------------------------------------------ jogos
def _match_key(m: dict[str, Any]) -> str:
    return f"{m.get('sportSlug')}:{m.get('team')}:{m.get('date')}:{m.get('opponent')}"


def _teams(m: dict[str, Any]) -> tuple[str, str]:
    us = f"Serrado FC{' ' + str(m['team']) if m.get('team') else ''}"
    return (us, str(m.get("opponent") or "")) if m.get("homeAway") != "fora" else (str(m.get("opponent") or ""), us)


def _sport_url(m: dict[str, Any]) -> str:
    return f"/modalidades/{m.get('sportSlug') or 'futsal'}"


async def matches_saved(c: Conn, before: list[dict[str, Any]], after: list[dict[str, Any]]) -> None:
    """Resultados novos ou corrigidos (comparado com a versão anterior do bloco «Jogos»)."""
    old = {_match_key(m): m for m in before if isinstance(m, dict)}
    for m in after:
        if not isinstance(m, dict) or m.get("status") != "terminado" or m.get("scoreHome") is None or m.get("scoreAway") is None:
            continue
        prev = old.get(_match_key(m))
        if prev and prev.get("status") == "terminado" and (prev.get("scoreHome"), prev.get("scoreAway")) == (m["scoreHome"], m["scoreAway"]):
            continue
        if not await once(c, f"jogo:{_match_key(m)}:{m['scoreHome']}-{m['scoreAway']}"):
            continue
        home, away = _teams(m)
        sport = SPORT_NAMES.get(str(m.get("sportSlug")), "")
        await to_topic(
            c,
            "jogos",
            message(f"Resultado · {sport}".strip(" ·"), f"{home} {m['scoreHome']}–{m['scoreAway']} {away}", _sport_url(m), f"jogo-{_match_key(m)}"),
            str(m.get("sportSlug") or "") or None,
        )


async def match_reminders(pool: Pool, now: datetime | None = None) -> int:
    """Na véspera (a partir das 9h): «Amanhã: Serrado FC – AD Modelo, 18:00, Pavilhão…»."""
    now = (now or datetime.now(LISBON)).astimezone(LISBON)
    if now.hour < 9:
        return 0
    row = await fetch_one(pool, "select data from site_blocks where key = 'matches'")
    tomorrow = (now.date() + timedelta(days=1)).isoformat()
    sent = 0
    for m in (row or {}).get("data", {}).get("items", []) if row else []:
        if not isinstance(m, dict) or m.get("status") != "agendado" or not str(m.get("date", "")).startswith(tomorrow):
            continue
        if not await once(pool, f"jogo:{_match_key(m)}:lembrete"):
            continue
        home, away = _teams(m)
        hour = str(m.get("date", ""))[11:16]
        where = f", {m['venue']}" if m.get("venue") else ""
        sport = SPORT_NAMES.get(str(m.get("sportSlug")), "")
        await to_topic(
            pool,
            "jogos",
            message(f"Amanhã · {sport}".strip(" ·"), f"{home} – {away}{', ' + hour if hour else ''}{where}", _sport_url(m), f"jogo-{_match_key(m)}"),
            str(m.get("sportSlug") or "") or None,
        )
        sent += 1
    return sent


# ------------------------------------------------------------------ pagamentos
async def fees_created(db: Pool | Conn, fee_ids: list[int]) -> None:
    """Mensalidades novas: aos encarregados (e ao atleta com conta)."""
    if not fee_ids:
        return
    rows = await fetch(
        db,
        """select x.user_id::text as user_id, f.period, sum(f.amount) as total, count(*) as n
             from athlete_fees f join athlete_access x on x.athlete_id = f.athlete_id
            where f.id = any(%s) group by x.user_id, f.period""",
        [fee_ids],
    )
    for r in rows:
        what = "Mensalidade" if r["n"] == 1 else f"{r['n']} mensalidades"
        await to_users(
            db,
            [r["user_id"]],
            "pagamentos",
            message("Pagamentos · Serrado FC", f"{what} de {r['period']} para pagar: {eur(r['total'])}", "/area-socio", "pagamentos"),
        )


async def quotas_created(db: Pool | Conn, quota_ids: list[int]) -> None:
    """Quotas novas: ao sócio com conta no site."""
    if not quota_ids:
        return
    rows = await fetch(
        db,
        """select m.user_id::text as user_id, q.period, q.amount from quotas q join members m on m.member_number = q.member_number
            where q.id = any(%s) and m.user_id is not null""",
        [quota_ids],
    )
    for r in rows:
        await to_users(
            db,
            [r["user_id"]],
            "pagamentos",
            message("Quotas · Serrado FC", f"Quota de {r['period']} para pagar: {eur(r['amount'])}", "/area-socio", "pagamentos"),
        )


async def payment_received(c: Conn, payment: dict[str, Any]) -> None:
    if payment.get("user_id"):
        await to_users(
            c,
            [str(payment["user_id"])],
            "pagamentos",
            message("Pagamento recebido · Serrado FC", f"Recebemos {eur(payment['amount'])}. Obrigado!", "/area-socio", f"pago-{payment['id']}"),
        )


# ------------------------------------------------------------------ pedidos de gasto
async def expense(c: Conn, user_ids: list[str], title: str, body: str, expense_id: int) -> None:
    await to_users(c, user_ids, "gastos", message(title, body, f"/admin/pedidos-de-gasto?id={expense_id}", f"gasto-{expense_id}"), "high")


__all__ = ["expense", "fees_created", "match_reminders", "matches_saved", "payment_received", "published", "quotas_created"]
