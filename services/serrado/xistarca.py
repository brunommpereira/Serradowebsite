"""
Inscrições no Troféu de Almada pela Xistarca (checkout.xistarca.pt), sem browser.

A Xistarca não tem API pública: este cliente faz os mesmos pedidos que a página do checkout faz
(js/funcoes-checkout.js), com a conta Xistarca do clube (XISTARCA_EMAIL / XISTARCA_PASSWORD):

    1. GET  /evento/<slug>                       → sessão, id do evento e modalidades
    2. POST /ajax/include-popup-login.php        → acao=login
    3. POST /checkout-inscricao?id=<evento>      → página do passo 3, já com o 1.º atleta
    4. POST /ajax/adiciona_atleta.php            → mais um atleta (devolve o bloco HTML)
       POST /ajax/busca_usuarios.php             → importa os dados de quem já tem conta Xistarca
       POST /ajax/valida_atleta.php              → confirma cada atleta
    5. POST /ajax/checkout-inscricao.php         → fecha o passo 3
       → checkout-adicionais → /ajax/checkout-pagamento.php (valor 0 €)

Uma inscrição na 1.ª prova do Troféu vale para todas as provas da época. Em modo «test» faz tudo
até ao passo 4 (valida os atletas na Xistarca) e não submete. Fila: tabela race_signups; corre de
10 em 10 minutos (serrado-xistarca.timer) ou à mão:

    python -m serrado.xistarca check            # login + lê o evento da edição ativa
    python -m serrado.xistarca run              # processa os pedidos em fila
    python -m serrado.xistarca discover         # mostra os formulários de cada passo (sem dados pessoais)

A password nunca aparece nos registos nem nas mensagens de erro.
"""

import asyncio
import json
import logging
import re
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from .config import XistarcaConfig, config
from .db.pool import Conn, Pool, create_pool, fetch, fetch_one

logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("serrado.xistarca")

BASE = "https://checkout.xistarca.pt/"
LOCK_ID = 7_301_980  # pg_advisory_lock: um envio de cada vez
UA = "Mozilla/5.0 (X11; Linux x86_64) SerradoFC-inscricoes/1.0 (+https://www.serradofc.pt)"


class XistarcaError(Exception):
    pass


# ------------------------------------------------------------------ formulários HTML
@dataclass
class Control:
    name: str
    kind: str  # text, hidden, radio, checkbox, select, number, ...
    value: str
    checked: bool = False
    disabled: bool = False
    options: list[tuple[str, str]] = field(default_factory=list)  # select: (value, texto)
    label: str = ""  # último <label> antes do campo


@dataclass
class Form:
    id: str
    action: str
    controls: list[Control] = field(default_factory=list)

    def serialize(self) -> dict[str, str]:
        """Como o jQuery .serialize(): radios/checkboxes só se marcados; select = opção escolhida (ou a 1.ª)."""
        return serialize(self.controls)


def serialize(controls: list[Control]) -> dict[str, str]:
    out: dict[str, str] = {}
    for c in controls:
        if not c.name or c.disabled or c.kind in ("submit", "button", "file", "image", "reset"):
            continue
        if c.kind in ("radio", "checkbox"):
            if c.checked:
                out[c.name] = c.value or "on"
        else:
            out[c.name] = c.value
    return out


class _Parser(HTMLParser):
    """Recolhe os formulários (por id) e todos os campos da página, com o rótulo mais próximo."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[Form] = []
        self.loose: list[Control] = []  # campos fora de <form> (os blocos de atleta vêm assim)
        self._form: Form | None = None
        self._select: Control | None = None
        self._option: tuple[str, bool] | None = None
        self._option_text = ""
        self._label: list[str] | None = None
        self._last_label = ""
        self.text: list[str] = []

    def _add(self, c: Control) -> None:
        c.label = self._last_label
        (self._form.controls if self._form else self.loose).append(c)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag == "form":
            self._form = Form(a.get("id", ""), a.get("action", ""))
            self.forms.append(self._form)
        elif tag == "input":
            self._add(Control(a.get("name", ""), a.get("type", "text").lower(), a.get("value", ""), "checked" in a, "disabled" in a))
        elif tag == "textarea":
            self._add(Control(a.get("name", ""), "textarea", "", disabled="disabled" in a))
        elif tag == "select":
            self._select = Control(a.get("name", ""), "select", "", disabled="disabled" in a)
            self._add(self._select)
        elif tag == "option" and self._select is not None:
            self._option = (a.get("value", "\0"), "selected" in a)
            self._option_text = ""
        elif tag == "label":
            self._label = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "form":
            self._form = None
        elif tag == "option" and self._select is not None and self._option is not None:
            value, selected = self._option
            text = self._option_text.strip()
            value = text if value == "\0" else value
            self._select.options.append((value, text))
            if selected or len(self._select.options) == 1:
                self._select.value = value
            self._option = None
        elif tag == "select":
            self._select = None
        elif tag == "label" and self._label is not None:
            self._last_label = " ".join("".join(self._label).split())
            self._label = None

    def handle_data(self, data: str) -> None:
        if self._option is not None:
            self._option_text += data
        if self._label is not None:
            self._label.append(data)
        self.text.append(data)


def parse(html_text: str) -> _Parser:
    p = _Parser()
    p.feed(html_text)
    p.close()
    return p


def page_text(p: _Parser) -> str:
    return " ".join(" ".join(p.text).split())


# ------------------------------------------------------------------ dados de cada atleta
@dataclass
class Person:
    """O que o clube envia de cada atleta (vem da ficha do atleta)."""

    key: str  # id do pedido (race_signups.id)
    name: str
    birth_date: date | str | None
    gender: str | None  # Feminino / Masculino
    email: str | None
    phone: str | None
    id_number: str | None
    city: str | None
    emergency_name: str | None
    emergency_phone: str | None


@dataclass
class Outcome:
    key: str
    status: str  # validado, inscrito, ja_inscrito, pendente_xistarca, erro
    message: str = ""
    imported: bool = False  # dados vieram da conta Xistarca do atleta


@dataclass
class Event:
    id: str
    title: str
    action: str
    modalities: list[tuple[str, str]]  # (id, nome)
    closed: bool
    form: Form | None


def _missing(p: Person) -> list[str]:
    out = []
    if not p.birth_date:
        out.append("data de nascimento")
    if p.gender not in ("Feminino", "Masculino"):
        out.append("género")
    if not p.id_number:
        out.append("n.º do CC")
    if not (p.emergency_name and p.emergency_phone):
        out.append("contacto de emergência")
    return out


def _digits(phone: str | None) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[3:] if d.startswith("351") and len(d) == 12 else d


# ------------------------------------------------------------------ cliente
class XistarcaClient:
    def __init__(self, cfg: XistarcaConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.cfg = cfg
        self.http = httpx.AsyncClient(
            base_url=BASE,
            transport=transport,
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9"},
        )
        self.event_url = ""

    async def close(self) -> None:
        await self.http.aclose()

    async def _req(self, method: str, url: str, data: dict[str, str] | None = None, ajax: bool = False) -> str:
        headers = {"X-Requested-With": "XMLHttpRequest"} if ajax else {}
        if self.event_url:
            headers["Referer"] = self.event_url
        try:
            res = await self.http.request(method, url, data=data, headers=headers)
        except httpx.HTTPError as e:
            raise XistarcaError(f"sem ligação à Xistarca ({type(e).__name__})") from None
        if res.status_code >= 400:
            raise XistarcaError(f"a Xistarca respondeu {res.status_code} em {urlparse(url).path or url}")
        return res.text

    async def _json(self, url: str, data: dict[str, str]) -> dict[str, Any]:
        txt = (await self._req("POST", url, data, ajax=True)).strip().lstrip("﻿")
        try:
            out = json.loads(txt)
        except ValueError:
            raise XistarcaError(f"resposta inesperada de {url} (não é JSON): {txt[:120]!r}") from None
        if not isinstance(out, dict):
            raise XistarcaError(f"resposta inesperada de {url}")
        return out

    # 1. evento
    async def open_event(self, url: str) -> Event:
        if not url.startswith(BASE):
            raise XistarcaError("o endereço do evento tem de ser em https://checkout.xistarca.pt/")
        self.event_url = url
        html_text = await self._req("GET", url)
        p = parse(html_text)
        form = next((f for f in p.forms if f.id == "form-inscricoes"), None)
        title = page_text(p)
        m = re.search(r"checkout-inscricao\?id=(\d+)", form.action if form else "")
        if not form or not m:
            raise XistarcaError("página do evento sem o formulário de inscrição (o endereço está certo?)")
        mods: list[tuple[str, str]] = []
        for c in form.controls:
            mm = re.fullmatch(r"f_f_(\d+)", c.name)
            if mm:
                mods.append((mm.group(1), c.label))
        closed = "inscrições encerradas" in title.lower() or not mods
        h1 = re.search(r'class="descricao">\s*<h1>([^<]{3,200})</h1>', html_text)
        return Event(m.group(1), " ".join(h1.group(1).split()) if h1 else "", form.action, mods, closed, form)

    # 2. login
    async def login(self) -> None:
        if not self.cfg.email or not self.cfg.password:
            raise XistarcaError("Falta XISTARCA_EMAIL ou XISTARCA_PASSWORD (sudo serrado xistarca)")
        out = await self._json("ajax/include-popup-login.php", {"f_email": self.cfg.email, "f_senha": self.cfg.password, "acao": "login"})
        if out.get("js_msg"):
            raise XistarcaError(f"login recusado pela Xistarca: {out['js_msg']}")

    # 3. passo da inscrição, com o 1.º bloco de atleta
    async def start(self, event: Event, modality: str) -> tuple[Form, list[str]]:
        assert event.form is not None
        data = event.form.serialize()
        for k in list(data):
            if re.fullmatch(r"f_n?f_\d+", k):
                data[k] = "0"
        data[f"f_f_{modality}"] = "1"
        p = parse(await self._req("POST", urljoin(BASE, event.action), data))
        form = next((f for f in p.forms if f.id == "form-checkout-inscricao"), None)
        if not form:
            raise XistarcaError("a Xistarca não abriu o passo de inscrição (sessão perdida ou modalidade fechada)")
        return form, _slots(form.controls, modality)

    async def add_slot(self, event_id: str, modality: str, count: int) -> list[Control]:
        txt = await self._req(
            "POST", "ajax/adiciona_atleta.php", {"id": modality, "controle": str(count), "f_id_evento": event_id, "f_equipa": ""}, ajax=True
        )
        controls = parse(txt).loose
        if not _slots(controls, modality):
            raise XistarcaError("a Xistarca não acrescentou o atleta")
        return controls

    async def lookup(self, user: str) -> dict[str, Any]:
        return await self._json("ajax/busca_usuarios.php", {"usuario": user})

    async def validate(self, fields: dict[str, str], event_id: str) -> dict[str, Any]:
        return await self._json("ajax/valida_atleta.php", {**fields, "f_id_evento": event_id})

    # 5. fechar: passo 3 → adicionais → pagamento (0 €)
    async def checkout(self, form: Form, blocks: dict[str, str]) -> str:
        base = {k: v for k, v in form.serialize().items() if not re.match(r"f_[a-z_]+\[\d+\]\[\d+\]", k)}
        data = {**base, **blocks}
        out = await self._json("ajax/checkout-inscricao.php", data)
        if out.get("js_msg"):
            raise XistarcaError(f"a Xistarca recusou a inscrição: {out['js_msg']}")
        p = parse(await self._req("POST", f"checkout-adicionais?{out.get('js_url', '')}", data))
        add = next((f for f in p.forms if f.id == "form-checkout-adicionais"), None)
        if not add:
            raise XistarcaError("passo «adicionais» não apareceu")
        d = add.serialize()
        if d.get("f_doacao", "0") not in ("", "0"):
            d["f_doacao"] = "0"
        p = parse(await self._req("POST", urljoin(BASE, add.action or "checkout-pagamento"), d))
        pay = next((f for f in p.forms if f.id == "form-checkout-pagamento"), None)
        if not pay:
            raise XistarcaError("passo «pagamento» não apareceu")
        total = _total(page_text(p))
        if total is not None and total > 0:
            raise XistarcaError(f"a inscrição custa {total:.2f} € — não é paga automaticamente; termina na Xistarca")
        d = {**serialize(pay.controls), **serialize([c for c in p.loose if c.name.startswith("f_fat")]), "f_termos_1": "s"}
        for c in pay.controls:
            if c.name == "f_termos_1" and c.value:
                d["f_termos_1"] = c.value
        res = await self._json("ajax/checkout-pagamento.php", d)
        if res.get("js_acao") == "Redirect" and res.get("js_url"):
            await self._req("GET", str(res["js_url"]))
            return str(res["js_url"])
        if res.get("js_msg") or res.get("js_erro_gateway"):
            raise XistarcaError(f"pagamento: {res.get('js_msg') or res.get('js_erro_gateway')}")
        # Valor 0: algumas configurações fecham com a submissão normal do formulário
        await self._req("POST", urljoin(BASE, pay.action or "checkout-agradecimento"), d)
        return pay.action or "checkout-agradecimento"


def _slots(controls: list[Control], modality: str) -> list[str]:
    """Ids («aleatório») dos blocos de atleta da modalidade, pela ordem da página."""
    seen: list[str] = []
    for c in controls:
        m = re.fullmatch(rf"f_nome\[{modality}\]\[(\d+)\]", c.name)
        if m and m.group(1) not in seen:
            seen.append(m.group(1))
    return seen


def _total(text: str) -> float | None:
    m = re.search(r"total[^0-9€]{0,60}?(\d{1,4}(?:[.,]\d{2}))\s*€", text, re.I) or re.search(
        r"total[^0-9€]{0,60}?€\s*(\d{1,4}(?:[.,]\d{2}))", text, re.I
    )
    return float(m.group(1).replace(",", ".")) if m else None


def fill_block(
    controls: list[Control], modality: str, slot: str, p: Person, cfg: "Edition", email: str, imported: dict[str, Any] | None
) -> dict[str, str]:
    """Campos do bloco do atleta, como a página os enviaria depois de preenchidos."""
    prefix = f"[{modality}][{slot}]"
    mine = [c for c in controls if prefix in c.name]
    data = serialize(mine)

    def put(name: str, value: str | None) -> None:
        data[f"{name}{prefix}"] = value or ""

    if imported:
        put("f_codigo_xistarca", email)
        put("f_nome", imported.get("nome"))
        put("f_email", imported.get("email_cripto"))
        put("f_telefone", imported.get("telefone_cripto"))
        put("f_bbci", imported.get("bicc_cripto"))
        put("f_pais", imported.get("pais") or "Portugal")
        put("f_nome_acidente", imported.get("nome_contactar_acidente"))
        put("f_telefone_acidente", imported.get("telefone_contactar_acidente"))
        put("f_sexo", imported.get("sexo") or ("f" if p.gender == "Feminino" else "m"))
        put("f_paratleta", imported.get("paratleta") or "n")
        put("f_federado", imported.get("federado") or "n")
        put("f_federado_licenca", imported.get("federado_liceca"))
        put("f_socio", imported.get("socio") or "n")
        put("f_socio_registro", imported.get("socio_registro"))
        put("f_data_nascimento", imported.get("data_nascimento"))
        put("f_pre_preenchido", "s")
    else:
        put("f_codigo_xistarca", "")
        put("f_nome", p.name)
        put("f_email", email)
        put("f_telefone", _digits(p.phone))
        put("f_bbci", (p.id_number or "").replace(" ", ""))
        put("f_pais", "Portugal")
        put("f_nome_acidente", p.emergency_name)
        put("f_telefone_acidente", _digits(p.emergency_phone))
        put("f_sexo", "f" if p.gender == "Feminino" else "m")
        put("f_paratleta", "n")
        put("f_federado", data.get(f"f_federado{prefix}") or "n")
        put("f_socio", "n")
        put("f_data_nascimento", str(p.birth_date)[:10] if p.birth_date else "")  # date ou «AAAA-MM-DD» da BD
        put("f_pre_preenchido", "n")
    put("f_nome_equipe", cfg.team_name[:30])
    # Campos próprios do evento: localidade (texto) e clube de Almada (lista)
    for c in mine:
        if not c.name.startswith("f_campo_personalizado"):
            continue
        label = c.label.lower()
        if c.kind == "select":
            want = next((v for v, t in c.options if t.strip().lower() == cfg.club_option.strip().lower()), None)
            if want is not None:
                data[c.name] = want
        elif "localidade" in label:
            data[c.name] = p.city or ""
    return data


@dataclass
class Edition:
    id: int
    season: str
    name: str
    event_url: str
    modality_id: str
    team_name: str
    club_option: str
    mode: str  # test / live
    # Contacto de emergência do clube (para quem não tem um na ficha)
    emergency_name: str = ""
    emergency_phone: str = ""


async def submit(cfg: XistarcaConfig, edition: Edition, people: list[Person], client: XistarcaClient | None = None) -> tuple[list[Outcome], str]:
    """Inscreve (ou, em modo test, só valida) os atletas numa única compra. Devolve os resultados e uma nota."""
    own = client is None
    client = client or XistarcaClient(cfg)
    outcomes: list[Outcome] = []
    try:
        ready: list[Person] = []
        for p in people:
            if not (p.emergency_name and p.emergency_phone) and edition.emergency_phone:
                p.emergency_name, p.emergency_phone = edition.emergency_name or edition.team_name, edition.emergency_phone
            miss = _missing(p)
            if miss:
                outcomes.append(Outcome(p.key, "erro", "Falta: " + ", ".join(miss)))
            else:
                ready.append(p)
        if not ready:
            return outcomes, "nada a enviar"
        event = await client.open_event(edition.event_url)
        if event.closed:
            raise XistarcaError("as inscrições deste evento estão encerradas na Xistarca")
        ids = [m for m, _ in event.modalities]
        modality = edition.modality_id or (ids[0] if ids else "")
        if modality not in ids:
            raise XistarcaError(f"a modalidade {modality} não existe neste evento (há: {', '.join(f'{i} {n}' for i, n in event.modalities)})")
        await client.login()
        form, slots = await client.start(event, modality)
        controls = list(form.controls)
        blocks: dict[str, str] = {}
        used_emails: set[str] = set()
        ok: list[Outcome] = []
        count = len(slots)
        for p in ready:
            if not slots:
                count += 1
                fresh = await client.add_slot(event.id, modality, count)
                controls += fresh
                slots = _slots(fresh, modality)
            slot = slots.pop(0)
            email = (p.email or "").strip().lower()
            if email in used_emails or email == cfg.email.lower():
                email = ""  # a Xistarca não aceita o mesmo email em dois atletas da mesma compra
            imported: dict[str, Any] | None = None
            if email:
                found = await client.lookup(email)
                if "erro" not in found and found.get("usuario_logado") != "sim" and found.get("nome"):
                    imported = found
            fields = fill_block(controls, modality, slot, p, edition, email, imported)
            res = await client.validate(fields, event.id)
            msg = str(res.get("js_msg") or "")
            if msg == "usuario_cadastrado" and not imported and res.get("js_email_user"):
                # O email já tem conta Xistarca: importa os dados dessa conta (como a página propõe)
                found = await client.lookup(str(res["js_email_user"]))
                if "erro" not in found and found.get("nome"):
                    imported = found
                    fields = fill_block(controls, modality, slot, p, edition, str(res["js_email_user"]), imported)
                    res = await client.validate(fields, event.id)
                    msg = str(res.get("js_msg") or "")
            if msg == "usuario_modalidade_registrado":
                outcomes.append(
                    Outcome(p.key, "ja_inscrito" if str(res.get("js_status")) == "1" else "pendente_xistarca", "Já tem inscrição neste evento")
                )
                continue
            if msg and not (msg == "usuario_cadastrado" and imported):
                outcomes.append(Outcome(p.key, "erro", f"Xistarca: {msg[:300]}"))
                continue
            blocks.update(fields)
            if email:
                used_emails.add(email)
            ok.append(Outcome(p.key, "validado", "Dados aceites pela Xistarca", imported is not None))
        if not ok:
            return outcomes, "nenhum atleta aceite"
        if edition.mode != "live":
            for o in ok:
                o.message = "Modo de teste: dados aceites pela Xistarca, inscrição não submetida"
            return outcomes + ok, "modo de teste"
        ref = await client.checkout(form, blocks)
        for o in ok:
            o.status, o.message = "inscrito", "Inscrito na Xistarca"
        return outcomes + ok, ref[:200]
    finally:
        if own:
            await client.close()


# ------------------------------------------------------------------ fila (race_signups)
async def active_edition(db: Pool | Conn) -> Edition | None:
    row = await fetch_one(db, "select * from race_editions where active order by season desc limit 1")
    if not row:
        return None
    return Edition(
        row["id"],
        row["season"],
        row["name"],
        row["event_url"],
        row["modality_id"] or "",
        row["team_name"],
        row["club_option"],
        row["mode"],
        row.get("emergency_name") or "",
        row.get("emergency_phone") or "",
    )


async def run(pool: Pool, cfg: XistarcaConfig | None = None, client: XistarcaClient | None = None) -> dict[str, Any]:
    """Envia os pedidos em fila («pedido», e «validado» quando a edição já está em modo real)."""
    cfg = cfg or config.xistarca
    summary: dict[str, Any] = {"sent": 0, "ok": 0, "errors": 0, "note": ""}
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(%s) as ok", [LOCK_ID])).fetchone()
        if not got or not got["ok"]:
            summary["note"] = "já há um envio a correr"
            return summary
        try:
            edition = await active_edition(pool)
            if not edition:
                summary["note"] = "sem edição ativa"
                return summary
            if not edition.event_url:
                summary["note"] = "a edição ainda não tem o endereço do evento na Xistarca"
                return summary
            states = ["pedido", "validado"] if edition.mode == "live" else ["pedido"]
            rows = await fetch(
                pool,
                """select s.id, a.name, a.birth_date, a.gender, a.email, a.phone, a.id_number, a.city, a.emergency_name, a.emergency_phone
                     from race_signups s join athletes a on a.id = s.athlete_id
                    where s.edition_id = %s and s.status = any(%s) and s.attempts < 5
                    order by s.requested_at limit 60""",
                [edition.id, states],
            )
            if not rows:
                summary["note"] = "sem pedidos"
                return summary
            people = [
                Person(
                    str(r["id"]),
                    r["name"],
                    r["birth_date"],
                    r["gender"],
                    r["email"],
                    r["phone"],
                    r["id_number"],
                    r["city"],
                    r["emergency_name"],
                    r["emergency_phone"],
                )
                for r in rows
            ]
            summary["sent"] = len(people)
            try:
                outcomes, note = await submit(cfg, edition, people, client)
            except XistarcaError as e:
                note = str(e)
                outcomes = [Outcome(p.key, "erro", note[:300]) for p in people]
                summary["note"] = note
            else:
                summary["note"] = note
            async with pool.connection() as c:
                for o in outcomes:
                    status = "inscrito" if o.status in ("inscrito", "ja_inscrito") else o.status
                    status = "erro" if status == "pendente_xistarca" else status
                    await c.execute(
                        """update race_signups set status = %s, message = %s, attempts = attempts + (case when %s = 'erro' then 1 else 0 end),
                                  last_attempt_at = now(), sent_at = case when %s = 'inscrito' then now() else sent_at end
                            where id = %s""",
                        [status, o.message[:500], status, status, int(o.key)],
                    )
                    summary["ok" if status != "erro" else "errors"] += 1
        finally:
            await lock.execute("select pg_advisory_unlock(%s)", [LOCK_ID])
    return summary


# ------------------------------------------------------------------ comandos
async def check(cfg: XistarcaConfig | None = None, url: str | None = None, client: XistarcaClient | None = None) -> str:
    cfg = cfg or config.xistarca
    own = client is None
    client = client or XistarcaClient(cfg)
    try:
        if url:
            ev = await client.open_event(url)
            mods = ", ".join(f"{i} «{n}»" for i, n in ev.modalities) or "nenhuma"
            state = "encerradas" if ev.closed else "abertas"
            await client.login()
            return f"login ok · evento {ev.id} · inscrições {state} · modalidades: {mods}"
        await client.login()
        return "login ok"
    finally:
        if own:
            await client.close()


async def discover(cfg: XistarcaConfig, url: str, out: Callable[[str], None] = print) -> None:
    """Mostra a estrutura (nomes e tipos) dos formulários do evento e do passo 3 — sem valores pessoais."""
    client = XistarcaClient(cfg)
    try:
        ev = await client.open_event(url)
        out(f"evento {ev.id} · encerradas={ev.closed} · modalidades={ev.modalities}")
        if ev.closed or not ev.modalities:
            return
        await client.login()
        form, slots = await client.start(ev, ev.modalities[0][0])
        out(f"form-checkout-inscricao → {form.action or '(ajax)'} · blocos={slots}")
        for c in form.controls:
            opts = f" opções={[t for _, t in c.options][:15]}" if c.options and "pais" not in c.name else ""
            out(f"  {c.kind:9} {c.name}  «{c.label[:60]}»{opts}")
    finally:
        await client.close()


async def _main(argv: list[str], out: Callable[[str], None] = print) -> int:
    cmd = argv[0] if argv else ""
    cfg = config.xistarca
    if cmd in ("check", "discover"):
        url = argv[1] if len(argv) > 1 else None
        if not url:
            pool = create_pool(max_size=1)
            await pool.open()
            try:
                ed = await active_edition(pool)
            finally:
                await pool.close()
            url = ed.event_url if ed else None
        try:
            if cmd == "check":
                out(f"✔ {await check(cfg, url)}")
            elif url:
                await discover(cfg, url, out)
            else:
                out("✘ indica o endereço do evento: python -m serrado.xistarca discover <url>")
                return 2
            return 0
        except XistarcaError as e:
            out(f"✘ {e}")
            return 1
    if cmd == "run":
        pool = create_pool(max_size=2)
        await pool.open()
        try:
            s = await run(pool, cfg)
        finally:
            await pool.close()
        out(json.dumps({**s, "at": datetime.now(UTC).isoformat(timespec="seconds")}, ensure_ascii=False))
        return 1 if s["errors"] else 0
    print("Uso: python -m serrado.xistarca check [url] | run | discover [url]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(_main(sys.argv[1:])))


__all__ = ["Edition", "Outcome", "Person", "XistarcaClient", "XistarcaError", "active_edition", "check", "run", "submit"]
