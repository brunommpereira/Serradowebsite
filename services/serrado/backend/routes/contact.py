"""
Formulário de contacto do site: guarda a mensagem e avisa o clube por email (com o email de quem escreveu,
para responder). Não envia nada para o endereço indicado no formulário (não serve para enviar spam a terceiros).
As mensagens com mais de um ano são apagadas (RGPD).
"""

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...config import config
from ...db.pool import tx
from ...mail import enqueue, layout
from ...registry import Email, Name
from ..core import HttpError, pool
from .interest import Client, club_email

SUBJECTS = ("Informações gerais", "Inscrição numa modalidade", "Ser sócio", "Parcerias e patrocínios", "Voluntariado", "Encomendas", "Outro")


class ContactForm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Name
    email: Email
    subject: str = Field(default="Informações gerais", max_length=60)
    message: str = Field(min_length=5, max_length=4000)
    consent: bool
    website: str = Field(default="", max_length=200)  # armadilha para robôs: tem de vir vazio

    @field_validator("email")
    @classmethod
    def _email_required(cls, v: str | None) -> str:
        if not v:
            raise ValueError("obrigatório")
        return v

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        return v if v in SUBJECTS else "Outro"


class ContactBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    form: ContactForm
    client: Client


def register(r: APIRouter) -> None:
    @r.post("/contact", tags=["Contactos"], summary="Mensagem do formulário de contacto (o middleware junta o IP)", status_code=201)
    async def create(req: Request, body: ContactBody) -> dict[str, Any]:
        f = body.form
        if f.website:
            raise HttpError(400, "invalid", "Pedido inválido")
        if not f.consent:
            raise HttpError(400, "validation", "consent: é preciso autorizar o tratamento dos dados")
        assert f.email
        async with tx(pool(req)) as c:
            await c.execute("delete from contact_messages where created_at < now() - interval '1 year'")
            # A mesma mensagem repetida (duplo clique) não volta a ser enviada
            dup = await (
                await c.execute(
                    "select id from contact_messages where email = %s and message = %s and created_at > now() - interval '1 day'",
                    [f.email, f.message],
                )
            ).fetchone()
            if dup:
                return {"id": dup["id"], "duplicate": True}
            cur = await c.execute(
                """insert into contact_messages (name, email, subject, message, consent_at, ip, user_agent)
                   values (%s, %s, %s, %s, now(), %s, %s) returning id""",
                [f.name, f.email, f.subject, f.message, body.client.ip, body.client.userAgent],
            )
            row = await cur.fetchone()
            assert row is not None
            if config.mail.enabled:
                await enqueue(
                    c,
                    to_email=await club_email(c),
                    to_name="Serrado FC",
                    subject=f"Contacto pelo site — {f.subject}: {f.name}",
                    html_body=layout(
                        f"Mensagem pelo site — {f.subject}",
                        [f"De: {f.name} <{f.email}>", *f.message.splitlines()],
                        ("Responder por email", f"mailto:{quote(f.email, safe='@')}?subject={quote('Re: ' + f.subject)}"),
                    ),
                )
        return {"id": row["id"], "duplicate": False}
