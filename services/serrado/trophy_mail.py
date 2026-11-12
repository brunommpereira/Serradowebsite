"""
Email individual aos atletas inscritos no Troféu, com o dorsal e a informação da prova.

- Um email por atleta inscrito que tenha dorsal e email (o da ficha; sem ele, o de uma conta ligada à ficha).
  Nos menores, o email da ficha é o do encarregado: a mensagem fala do atleta na terceira pessoa.
- Cada inscrição só recebe o email uma vez (`bib_email_at`), a não ser que se peça para reenviar.
- Pré-visualização (só contagens), envio de teste para um endereço (nada é marcado) e envio a sério.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints

from .backend.core import Actor, audit
from .db.pool import Conn
from .mail import enqueue, layout

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SHORT = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]


class DorsalMail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dryRun: bool = True
    testTo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")] | None = None
    resend: bool = False
    raceName: SHORT = "Troféu da Caparica"
    raceDate: SHORT = "15 de novembro de 2026"
    meetTime: SHORT = "09h00"
    meetPlace: SHORT = "em frente à Junta de Freguesia da Caparica"
    regulationUrl: Annotated[str, StringConstraints(pattern=r"^https://[^\s]{4,400}$")] = (
        "https://tatletismo-almada.pt/wp-content/uploads/2026/10/TAAMPC-2026.2027-TCaparica-Regulamento.pdf"
    )


@dataclass
class Plan:
    inscribed: int = 0
    ready: list[dict[str, Any]] = field(default_factory=list)
    no_bib: list[str] = field(default_factory=list)
    no_email: list[str] = field(default_factory=list)
    already: int = 0


def _minor(birth: date | None) -> bool:
    if not birth:
        return False
    t = date.today()
    return (t.year - birth.year - ((t.month, t.day) < (birth.month, birth.day))) < 18


def compose(p: DorsalMail, *, name: str, bib: int, birth: date | None) -> tuple[str, str]:
    """(assunto, HTML) do email de um atleta."""
    first = name.split()[0] if name.split() else name
    if _minor(birth):
        opening = [
            "Olá,",
            f"O {first} está inscrito na 1.ª prova do Troféu de Almada: {p.raceName}, no dia {p.raceDate}.",
        ]
        who = f"O dorsal do {first}"
    else:
        opening = [
            f"Olá {first},",
            f"Estás inscrito na 1.ª prova do Troféu de Almada: {p.raceName}, no dia {p.raceDate}.",
        ]
        who = "O teu dorsal"
    body = [
        *opening,
        f"{who} é o seguinte:",
        f"O dorsal é entregue no dia da prova, a partir das {p.meetTime}, {p.meetPlace}. Vamos estar identificados com a bandeira do Serrado.",
        "Lê com atenção o regulamento da prova:",
        "Contamos com todos para conseguirmos ainda mais do que no ano passado!",
    ]
    html = layout(
        p.raceName,
        body,
        ("Ver o regulamento", p.regulationUrl),
        "Este email foi enviado automaticamente pelo Serrado FC aos atletas inscritos no Troféu.",
        highlight=(3, f"Dorsal n.º {bib}"),
    )
    return f"O teu dorsal para o {p.raceName} ({p.raceDate}) — Serrado FC", html


async def plan(c: Conn, edition_id: int, resend: bool) -> Plan:
    rows = await (
        await c.execute(
            """select a.name, a.birth_date, s.id as signup_id, s.bib, s.bib_email_at,
                      coalesce(nullif(btrim(a.email), ''),
                               (select u.email from athlete_access x join users u on u.id = x.user_id
                                 where x.athlete_id = a.id and coalesce(btrim(u.email), '') <> '' order by x.user_id limit 1)) as email
                 from race_signups s join athletes a on a.id = s.athlete_id
                where s.edition_id = %s and s.status = 'inscrito' order by a.name""",
            [edition_id],
        )
    ).fetchall()
    out = Plan(inscribed=len(rows))
    for r in rows:
        if not r["bib"]:
            out.no_bib.append(r["name"])
        elif not r["email"] or not EMAIL.match(str(r["email"]).strip()):
            out.no_email.append(r["name"])
        elif r["bib_email_at"] and not resend:
            out.already += 1
        else:
            out.ready.append(dict(r))
    return out


async def send_dorsais(c: Conn, who: Actor, edition_id: int, p: DorsalMail) -> dict[str, Any]:
    pl = await plan(c, edition_id, p.resend)
    base = {
        "inscribed": pl.inscribed,
        "ready": len(pl.ready),
        "already": pl.already,
        "noBib": len(pl.no_bib),
        "noEmail": len(pl.no_email),
        "noBibNames": pl.no_bib[:60],
        "noEmailNames": pl.no_email[:60],
    }
    if p.testTo:
        # Exemplo com os dados do primeiro atleta pronto (ou fictícios): vai só para o endereço pedido e não marca nada
        ex = pl.ready[0] if pl.ready else {"name": "Nome Exemplo", "bib": 123, "birth_date": None}
        subject, html = compose(p, name=ex["name"], bib=ex["bib"], birth=ex["birth_date"])
        await enqueue(c, to_email=p.testTo, to_name="Teste", subject=f"[TESTE] {subject}", html_body=html)
        await audit(c, who, "races.dorsal_mail_test", "race_editions", edition_id, {"to": p.testTo})
        return {**base, "test": True, "sentTo": p.testTo, "dryRun": False}
    if p.dryRun:
        return {**base, "dryRun": True, "sent": 0}
    for r in pl.ready:
        subject, html = compose(p, name=r["name"], bib=r["bib"], birth=r["birth_date"])
        await enqueue(c, to_email=str(r["email"]).strip(), to_name=r["name"], subject=subject, html_body=html)
        await c.execute("update race_signups set bib_email_at = now() where id = %s", [r["signup_id"]])
    await audit(c, who, "races.dorsal_mail", "race_editions", edition_id, {"sent": len(pl.ready), "resend": p.resend})
    return {**base, "dryRun": False, "sent": len(pl.ready)}


__all__ = ["DorsalMail", "send_dorsais"]
