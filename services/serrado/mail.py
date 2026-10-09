"""
Emails do site pela API transacional da Brevo (https://api.brevo.com/v3/smtp/email).

Quem precisa de enviar um email chama `enqueue` dentro da sua transação; o envio é feito
depois, por `python -m serrado.mail send` (timer do systemd, a cada minuto), com novas
tentativas espaçadas. Assim um problema na Brevo nunca falha o pedido de quem está no site.
"""

import asyncio
import html
import logging
import sys
from dataclasses import dataclass, field
from typing import Any

import httpx
from psycopg.types.json import Jsonb

from .config import MailConfig, config
from .db.pool import Conn, Pool, create_pool, fetch

API = "https://api.brevo.com/v3/smtp/email"
MAX_ATTEMPTS = 6
LOCK = 7301980

log = logging.getLogger("serrado.mail")


async def enqueue(c: Conn, *, to_email: str, to_name: str, subject: str, html_body: str, attachments: list[dict[str, str]] | None = None) -> None:
    """Põe um email na fila (attachments: [{name, content em base64}])."""
    await c.execute(
        "insert into email_outbox (to_email, to_name, subject, html, attachments) values (%s, %s, %s, %s, %s)",
        [to_email, to_name, subject, html_body, Jsonb(attachments or [])],
    )


def layout(title: str, paragraphs: list[str], button: tuple[str, str] | None = None, footer: str = "") -> str:
    """HTML simples e legível em qualquer cliente de email. O texto é sempre escapado."""
    e = html.escape
    body = "".join(f'<p style="margin:0 0 16px">{e(p)}</p>' for p in paragraphs)
    if button:
        label, url = button
        body += (
            f'<p style="margin:24px 0"><a href="{e(url, quote=True)}" style="background:#0b5d3b;color:#fff;padding:12px 20px;'
            f'border-radius:6px;text-decoration:none;font-weight:600">{e(label)}</a></p>'
            f'<p style="margin:0 0 16px;font-size:13px;color:#555">Se o botão não abrir, copia este endereço: {e(url)}</p>'
        )
    if footer:
        body += f'<p style="margin:24px 0 0;font-size:13px;color:#555">{e(footer)}</p>'
    return (
        '<!doctype html><html lang="pt"><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1a1a">'
        '<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:8px;padding:24px">'
        f'<h1 style="font-size:20px;margin:0 0 16px">{e(title)}</h1>{body}</div>'
        '<p style="font-size:12px;color:#777;text-align:center">Serrado Futebol Clube</p></div></body></html>'
    )


@dataclass
class MailSummary:
    sent: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


class BrevoClient:
    def __init__(self, cfg: MailConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.cfg = cfg
        self.http = httpx.AsyncClient(transport=transport, timeout=20.0, headers={"api-key": cfg.brevo_api_key, "accept": "application/json"})

    async def send(self, row: dict[str, Any]) -> None:
        payload: dict[str, Any] = {
            "sender": {"email": self.cfg.from_email, "name": self.cfg.from_name},
            "to": [{"email": row["to_email"], **({"name": row["to_name"]} if row["to_name"] else {})}],
            "subject": row["subject"],
            "htmlContent": row["html"],
        }
        if row["attachments"]:
            payload["attachment"] = [{"name": a["name"], "content": a["content"]} for a in row["attachments"]]
        try:
            res = await self.http.post(API, json=payload)
        except httpx.HTTPError as e:
            raise RuntimeError(f"sem ligação à Brevo ({type(e).__name__})") from None
        if res.status_code >= 300:
            detail = ""
            try:
                detail = str(res.json().get("message", ""))[:200]
            except ValueError:
                pass
            raise RuntimeError(f"Brevo respondeu {res.status_code} {detail}".strip())


async def send_pending(pool: Pool, cfg: MailConfig, client: BrevoClient, limit: int = 50) -> MailSummary:
    """Envia a fila (novas tentativas a 2, 4, 6… minutos, até 6). Só corre um envio de cada vez."""
    summary = MailSummary()
    if not cfg.enabled:
        return summary
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(%s) as ok", [LOCK])).fetchone()
        if not got or not got["ok"]:
            return summary
        try:
            todo = await fetch(
                pool,
                """select id, to_email, to_name, subject, html, attachments from email_outbox
                    where status = 'pending' or (status = 'failed' and attempts < %s and tried_at < now() - attempts * interval '2 minutes')
                    order by created_at limit %s""",
                [MAX_ATTEMPTS, limit],
            )
            for row in todo:
                try:
                    await client.send(row)
                except Exception as e:  # fica registado e volta a tentar
                    summary.failed += 1
                    summary.errors.append(f"{row['id']}: {e}")
                    log.warning("mail: email %s falhou: %s", row["id"], e)
                    await fetch(
                        pool,
                        "update email_outbox set status = 'failed', attempts = attempts + 1, tried_at = now(), error = %s where id = %s",
                        [str(e)[:500], row["id"]],
                    )
                    continue
                # Enviado: o conteúdo (pode ter dados pessoais ou ligações de uso único) deixa de ser preciso
                await fetch(
                    pool,
                    "update email_outbox set status = 'sent', sent_at = now(), error = null, html = '', attachments = '[]' where id = %s",
                    [row["id"]],
                )
                summary.sent += 1
            # Limpeza: enviados há mais de 30 dias e falhados de vez há mais de 90
            await fetch(
                pool,
                """delete from email_outbox where (status = 'sent' and sent_at < now() - interval '30 days')
                     or (status = 'failed' and attempts >= %s and tried_at < now() - interval '90 days')""",
                [MAX_ATTEMPTS],
            )
        finally:
            await lock.execute("select pg_advisory_unlock(%s)", [LOCK])
    return summary


async def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not argv or argv[0] not in ("send", "test") or (argv[0] == "test" and len(argv) != 2):
        print("uso: python -m serrado.mail send | test <endereço>", file=sys.stderr)
        return 2
    if not config.mail.enabled:
        print("Email não configurado (BREVO_API_KEY e MAIL_FROM_EMAIL): nada a fazer.")
        return 0
    pool = create_pool(max_size=2)
    await pool.open()
    try:
        if argv[0] == "test":
            async with pool.connection() as c:
                await enqueue(
                    c,
                    to_email=argv[1],
                    to_name="",
                    subject="Teste — site do Serrado FC",
                    html_body=layout("Email de teste", ["Se recebeste este email, o envio pela Brevo está a funcionar."]),
                )
        s = await send_pending(pool, config.mail, BrevoClient(config.mail))
        if s.sent or s.failed:
            print(f"enviados {s.sent}, falhados {s.failed}")
        for err in s.errors:
            print(f"  {err}", file=sys.stderr)
        return 1 if s.failed else 0
    finally:
        await pool.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
