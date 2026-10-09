"""Ligações de uso único enviadas por email: repor a password (1 h) ou definir a primeira (convite, 7 dias)."""

import hashlib
import secrets
from datetime import timedelta
from typing import Literal

from ..config import config
from ..db.pool import Conn
from ..mail import enqueue, layout

Purpose = Literal["reset", "invite"]
LIFETIME = {"reset": timedelta(hours=1), "invite": timedelta(days=7)}
MIN_PASSWORD = 10


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def send_link(c: Conn, *, user_id: str, email: str, name: str, purpose: Purpose) -> None:
    """Cria o token (só o hash fica na base de dados), anula os anteriores do mesmo tipo e põe o email na fila."""
    token = secrets.token_urlsafe(32)
    await c.execute("update password_tokens set used_at = now() where user_id = %s and purpose = %s and used_at is null", [user_id, purpose])
    await c.execute(
        "insert into password_tokens (token_hash, user_id, purpose, expires_at) values (%s, %s, %s, now() + %s)",
        [token_hash(token), user_id, purpose, LIFETIME[purpose]],
    )
    url = f"{config.oauth.site_url}/entrar/nova-password?token={token}"
    if purpose == "reset":
        subject = "Repor a password — Serrado FC"
        html = layout(
            "Repor a password",
            [
                f"Olá {name},",
                "Pediste para repor a password da tua conta no site do Serrado FC. A ligação é válida durante 1 hora e só pode ser usada uma vez.",
            ],
            ("Escolher nova password", url),
            "Se não foste tu, ignora este email: a tua password continua a mesma.",
        )
    else:
        subject = "A tua conta no site do Serrado FC"
        html = layout(
            "Bem-vindo ao Serrado FC",
            [
                f"Olá {name},",
                "Foi criada uma conta para ti no site do Serrado FC. Escolhe a tua password para entrares. A ligação é válida durante 7 dias.",
            ],
            ("Definir password", url),
            "Também podes entrar com a conta Google ou Microsoft deste email, se o clube as tiver ativas.",
        )
    await enqueue(c, to_email=email, to_name=name, subject=subject, html_body=html)
