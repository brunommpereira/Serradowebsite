"""
Emails do site: por SMTP (a caixa de email do próprio domínio, por exemplo no dominios.pt)
ou pela API transacional da Brevo (https://api.brevo.com/v3/smtp/email).

Quem precisa de enviar um email chama `enqueue` dentro da sua transação; o envio é feito
depois, por `python -m serrado.mail send` (timer do systemd, a cada minuto), com novas
tentativas espaçadas. Assim um problema no servidor de email nunca falha o pedido de quem está no site.
"""

import asyncio
import base64
import hashlib
import html
import logging
import re
import smtplib
import ssl
import sys
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Any, Protocol

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


# A assinatura (Backoffice → Conteúdos do site → Assinatura dos emails) entra no momento do envio
SIGNATURE_MARK = "<!--assinatura-->"
DEFAULT_SIGNATURE: dict[str, Any] = {
    "text": "\n".join(
        [
            "**SERRADO FUTEBOL CLUBE**",
            "*Desporto • Formação • Comunidade*",
            "",
            '🥈 **Vice-Campeão Troféu de Atletismo de Almada "Mário Pinto Claro"** | 2025/2026',
            "🏆 **Campeão Distrital de Futebol de Salão** | 1999/2000",
            "🥈 **Vice-Campeão Nacional Futebol Salão** | 2001/2002",
            "🏆 **Campeão Distrital de Futsal** | 2002/2003",
            "",
            "🏅 **Medalha de Prata de Mérito Desportivo**",
            "Câmara Municipal de Almada",
        ]
    ),
    "showLogo": True,
    "logoUrl": None,
    "logoSize": 90,
}
DEFAULT_LOGO = "/brand/email-logo.png"
_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC = re.compile(r"(?<![*\w])\*(?!\*)(.+?)(?<!\*)\*(?![*\w])")


def inline(text: str) -> str:
    """Texto escapado com **negrito** e *itálico* (o resto fica tal e qual)."""
    out = _BOLD.sub(r"<strong>\1</strong>", html.escape(text))
    return _ITALIC.sub(r"<em>\1</em>", out)


LOGO_PATH = "/api/v1/email/logo.png"


def signature_html(sig: dict[str, Any] | None, site_url: str) -> str:
    """Texto (uma linha por linha) e, no fim, o símbolo. Tudo escapado; a imagem só com endereço absoluto."""
    s = {**DEFAULT_SIGNATURE, **(sig or {})}
    e = html.escape
    # Linhas seguidas ficam no mesmo parágrafo; uma linha em branco começa outro
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", str(s.get("text") or "").replace("\r", "")) if p.strip()]
    out = '<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e5e5;font-size:14px;line-height:1.45;color:#333">'
    for p in paragraphs:
        out += '<p style="margin:0 0 12px">' + "<br>".join(inline(ln.strip()) for ln in p.splitlines()) + "</p>"
    if s.get("showLogo") and site_url.startswith("https://"):
        try:
            size = max(24, min(240, int(s.get("logoSize") or 90)))
        except (TypeError, ValueError):
            size = 90
        # Símbolo próprio: servido em PNG (os clientes de email nem sempre mostram WebP); a versão evita caches antigas
        custom = str(s.get("logoUrl") or "")
        src = f"{site_url}{LOGO_PATH}?v={hashlib.sha256(custom.encode()).hexdigest()[:10]}" if custom else f"{site_url}{DEFAULT_LOGO}"
        out += f'<img src="{e(src, quote=True)}" alt="Serrado FC" width="{size}" style="display:block;width:{size}px;height:auto;border:0">'
    return out + "</div>"


async def load_signature(pool: Pool) -> str:
    rows = await fetch(pool, "select data from site_blocks where key = 'email'")
    return signature_html(rows[0]["data"] if rows else None, config.oauth.site_url)


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
        f'<h1 style="font-size:20px;margin:0 0 16px">{e(title)}</h1>{body}{SIGNATURE_MARK}</div>'
        '<p style="font-size:12px;color:#777;text-align:center">Serrado Futebol Clube</p></div></body></html>'
    )


@dataclass
class MailSummary:
    sent: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)


class Sender(Protocol):
    async def send(self, row: dict[str, Any]) -> None: ...


def build_message(cfg: MailConfig, row: dict[str, Any]) -> EmailMessage:
    """Email em HTML (com uma versão em texto para quem não lê HTML) e anexos."""
    msg = EmailMessage()
    msg["From"] = formataddr((cfg.from_name, cfg.from_email))
    msg["To"] = formataddr((row["to_name"], row["to_email"])) if row["to_name"] else row["to_email"]
    msg["Subject"] = row["subject"]
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = make_msgid(domain=cfg.from_email.split("@")[-1])
    text = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"</p>|<br\s*/?>", "\n\n", row["html"])))
    msg.set_content(re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", text)).strip())
    msg.add_alternative(row["html"], subtype="html")
    for a in row["attachments"] or []:
        subtype = "pdf" if a["name"].lower().endswith(".pdf") else "octet-stream"
        msg.add_attachment(base64.b64decode(a["content"]), maintype="application", subtype=subtype, filename=a["name"])
    return msg


class SmtpClient:
    """SMTP com TLS (porta 465, ou 587 com STARTTLS) e autenticação; o certificado do servidor é verificado."""

    def __init__(self, cfg: MailConfig, smtp_factory: Any = None) -> None:
        self.cfg = cfg
        self.factory = smtp_factory

    def _send_sync(self, msg: EmailMessage) -> None:
        cfg = self.cfg
        ctx = ssl.create_default_context()
        if self.factory:
            server = self.factory(cfg.smtp_host, cfg.smtp_port)
        elif cfg.smtp_security == "ssl":
            server = smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=ctx, timeout=30)
        else:
            server = smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30)
        with server as s:
            if cfg.smtp_security == "starttls" and not self.factory:
                s.starttls(context=ctx)
            if cfg.smtp_user:
                s.login(cfg.smtp_user, cfg.smtp_password)
            s.send_message(msg)

    async def send(self, row: dict[str, Any]) -> None:
        try:
            await asyncio.to_thread(self._send_sync, build_message(self.cfg, row))
        except smtplib.SMTPAuthenticationError:
            raise RuntimeError("o servidor de email recusou o utilizador ou a password (SMTP_USER/SMTP_PASSWORD)") from None
        except smtplib.SMTPResponseException as e:
            raise RuntimeError(f"o servidor de email respondeu {e.smtp_code}: {str(e.smtp_error)[:200]}") from None
        except (smtplib.SMTPException, OSError) as e:
            raise RuntimeError(f"sem ligação ao servidor de email ({type(e).__name__}: {str(e)[:150]})") from None


def client_for(cfg: MailConfig) -> Sender:
    return SmtpClient(cfg) if cfg.provider == "smtp" else BrevoClient(cfg)


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


async def send_pending(pool: Pool, cfg: MailConfig, client: Sender, limit: int = 50) -> MailSummary:
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
            signature = await load_signature(pool) if todo else ""
            for row in todo:
                try:
                    await client.send({**row, "html": str(row["html"]).replace(SIGNATURE_MARK, signature)})
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
        print("Email não configurado (SMTP_HOST ou BREVO_API_KEY, e MAIL_FROM_EMAIL): nada a fazer.")
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
                    html_body=layout(
                        "Email de teste",
                        [
                            f"Se recebeste este email, o envio de emails do site ({'SMTP' if config.mail.provider == 'smtp' else 'Brevo'}) está a funcionar."
                        ],
                    ),
                )
        s = await send_pending(pool, config.mail, client_for(config.mail))
        if s.sent or s.failed:
            print(f"enviados {s.sent}, falhados {s.failed}")
        for err in s.errors:
            print(f"  {err}", file=sys.stderr)
        return 1 if s.failed else 0
    finally:
        await pool.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
