"""
Email individual a todos os atletas (e encarregados) do clube, com o texto escrito no backoffice.

- Um email por endereço: famílias que partilham o mesmo endereço recebem uma só mensagem.
- Cada campanha só chega uma vez a cada endereço (`email_campaign_sent`); para voltar a enviar, muda-se a referência da campanha.
- Pré-visualização (só contagens), envio de teste para um endereço (nada é marcado) e envio a sério.
"""

import re
from dataclasses import dataclass, field
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .backend.core import Actor, audit
from .db.pool import Conn
from .mail import enqueue, layout
from .trophy_mail import _minor

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
Para = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1500)]


class Button(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=90)]
    url: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^https://[^\s]{4,400}$")]


class AthleteMail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dryRun: bool = True
    testTo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")] | None = None
    campaign: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9][a-z0-9-]{2,59}$")]
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=150)]
    paragraphs: Annotated[list[Para], Field(min_length=1, max_length=14)]
    button: Button | None = None
    button2: Button | None = None
    sport: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{2,40}$")] | None = None


@dataclass
class Plan:
    athletes: int = 0
    ready: list[dict[str, Any]] = field(default_factory=list)
    no_email: list[str] = field(default_factory=list)
    already: int = 0


async def plan(c: Conn, p: AthleteMail) -> Plan:
    rows = await (
        await c.execute(
            """select a.name, a.birth_date,
                      coalesce(nullif(btrim(a.email), ''),
                               (select u.email from athlete_access x join users u on u.id = x.user_id
                                 where x.athlete_id = a.id and coalesce(btrim(u.email), '') <> '' order by x.user_id limit 1)) as email
                 from athletes a where (%s::text is null or a.sport_slug = %s) order by a.name""",
            [p.sport, p.sport],
        )
    ).fetchall()
    sent = {r["email"] for r in await (await c.execute("select email from email_campaign_sent where campaign = %s", [p.campaign])).fetchall()}
    out = Plan(athletes=len(rows))
    by_email: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        e = str(r["email"] or "").strip().lower()
        if not EMAIL.match(e):
            out.no_email.append(r["name"])
            continue
        by_email.setdefault(e, []).append(r)
    for e, group in by_email.items():
        if e in sent:
            out.already += 1
            continue
        # Nome só quando o endereço é de um único atleta adulto; caso contrário, uma saudação geral
        solo = group[0] if len(group) == 1 and not _minor(group[0]["birth_date"]) else None
        out.ready.append({"email": e, "name": solo["name"] if solo else None, "label": group[0]["name"]})
    return out


def compose(p: AthleteMail, name: str | None) -> tuple[str, str]:
    first = name.split()[0] if name and name.split() else None
    greeting = f"Olá {first}," if first else "Olá,"
    btn = (p.button.label, p.button.url) if p.button else None
    btn2 = (p.button2.label, p.button2.url) if p.button2 else None
    html = layout(
        p.subject,
        [greeting, *p.paragraphs],
        btn,
        "Este email foi enviado pelo Serrado FC aos seus atletas e encarregados de educação.",
        button2=btn2,
    )
    return p.subject, html


async def send_athletes(c: Conn, who: Actor, p: AthleteMail) -> dict[str, Any]:
    pl = await plan(c, p)
    base = {
        "athletes": pl.athletes,
        "ready": len(pl.ready),
        "already": pl.already,
        "noEmail": len(pl.no_email),
        "noEmailNames": pl.no_email[:80],
    }
    if p.testTo:
        subject, html = compose(p, pl.ready[0]["name"] if pl.ready else "Nome Exemplo")
        await enqueue(c, to_email=p.testTo, to_name="Teste", subject=f"[TESTE] {subject}", html_body=html)
        await audit(c, who, "athletes.broadcast_mail_test", "email_campaign", p.campaign, {"to": p.testTo})
        return {**base, "test": True, "sentTo": p.testTo, "dryRun": False}
    if p.dryRun:
        return {**base, "dryRun": True, "sent": 0}
    for r in pl.ready:
        subject, html = compose(p, r["name"])
        await enqueue(c, to_email=r["email"], to_name=r["name"] or r["label"], subject=subject, html_body=html)
        await c.execute("insert into email_campaign_sent (campaign, email) values (%s, %s) on conflict do nothing", [p.campaign, r["email"]])
    await audit(c, who, "athletes.broadcast_mail", "email_campaign", p.campaign, {"sent": len(pl.ready), "sport": p.sport})
    return {**base, "dryRun": False, "sent": len(pl.ready)}


__all__ = ["AthleteMail", "send_athletes"]
