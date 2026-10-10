"""
Página de Facebook do clube → site (Graph API da Meta).

As publicações da página passam a notícias, os eventos da página a eventos do CMS e os reels e
histórias aparecem no site (tabela social_items: só a miniatura; o vídeo fica no Facebook).
Corre de 15 em 15 minutos no servidor (serrado-facebook.timer) ou à mão:

    python -m serrado.facebook check    # confirma o token e mostra o nome da página
    python -m serrado.facebook sync     # importa agora

Regras:
- Cada publicação/evento entra uma vez (tabela cms_external). Se mudar no Facebook, a entrada
  do site é atualizada — exceto se alguém já a tiver editado no backoffice (a edição do site ganha).
- FACEBOOK_SYNC_MODE=publish publica logo; =draft deixa em rascunho para a equipa rever.
- FACEBOOK_SYNC_TAG (opcional, ex.: site) importa só as publicações com essa hashtag.
- Partilhas de publicações de outras páginas não entram. Eventos cancelados são arquivados.
- Reels: os mais recentes (até 25). Histórias: só se veem no site nas 24 h seguintes; ao fim de
  7 dias saem da base de dados (com a miniatura). Com FACEBOOK_SYNC_MODE=draft entram escondidos.
"""

import asyncio
import html
import json
import logging
import re
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .backend.core import Actor, audit, camel
from .backend.routes.cms import revision
from .backend.routes.media import EXT, MAX_IMAGE_BYTES, sniff_image
from .config import FacebookConfig, config
from .db.pool import Conn, Pool, create_pool
from .db.seed import slugify
from .html import sanitize_body

# O httpx regista os endereços pedidos (com o token na query) ao nível INFO: nunca nos registos
logging.getLogger("httpx").setLevel(logging.WARNING)

LISBON = ZoneInfo("Europe/Lisbon")
SOURCE = "facebook"
SYSTEM = Actor()  # escritas feitas pela sincronização (sem utilizador)
LOCK_ID = 7_301_978  # pg_advisory_lock: uma sincronização de cada vez

CATEGORY_TAGS = {
    "futsal": "Futsal",
    "atletismo": "Atletismo",
    "rugby": "Rugby",
    "formacao": "Formação",
    "formação": "Formação",
    "comunidade": "Comunidade",
    "parceiros": "Parceiros",
    "comunicado": "Comunicados",
}
EVENT_KINDS = (
    ("caminhada", "Caminhada"),
    ("corrida", "Corrida"),
    ("torneio", "Torneio"),
    ("solidári", "Solidário"),
    ("solidari", "Solidário"),
    ("criança", "Crianças"),
    ("crianca", "Crianças"),
)
SPORTS = ("atletismo", "futsal", "rugby")


class FacebookError(Exception):
    pass


class GraphClient:
    """Pedidos à Graph API com o token da página (o token nunca aparece nas mensagens de erro)."""

    def __init__(self, cfg: FacebookConfig, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.cfg = cfg
        self.http = httpx.AsyncClient(transport=transport, timeout=20.0, follow_redirects=True)

    async def get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        url = f"https://graph.facebook.com/{self.cfg.graph_version}/{path.lstrip('/')}"
        try:
            res = await self.http.get(url, params={**(params or {}), "access_token": self.cfg.page_token})
        except httpx.HTTPError as e:
            raise FacebookError(f"sem ligação à Graph API ({type(e).__name__})") from None
        data = res.json() if res.content else {}
        if res.status_code != 200 or "error" in data:
            err = data.get("error", {}) if isinstance(data, dict) else {}
            raise FacebookError(f"{err.get('type', 'erro')} {err.get('code', res.status_code)}: {err.get('message', 'pedido recusado')}")
        return data  # type: ignore[no-any-return]

    async def items(self, path: str, params: dict[str, str], max_pages: int = 3) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        after: str | None = None
        for _ in range(max_pages):
            page = await self.get(path, {**params, **({"after": after} if after else {})})
            out += [x for x in page.get("data", []) if isinstance(x, dict)]
            after = page.get("paging", {}).get("cursors", {}).get("after") if page.get("paging", {}).get("next") else None
            if not after:
                break
        return out

    async def image(self, url: str) -> tuple[bytes, str] | None:
        """Descarrega uma imagem (só https, até 5 MB, tipo confirmado pelo conteúdo)."""
        if not url.startswith("https://"):
            return None
        try:
            async with self.http.stream("GET", url) as res:
                if res.status_code != 200:
                    return None
                data = b""
                async for chunk in res.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_IMAGE_BYTES:
                        return None
        except httpx.HTTPError:
            return None
        mime = sniff_image(data)
        return (data, mime) if mime else None


@dataclass
class Summary:
    news_created: int = 0
    news_updated: int = 0
    events_created: int = 0
    events_updated: int = 0
    events_archived: int = 0
    reels_created: int = 0
    reels_updated: int = 0
    stories_created: int = 0
    stories_removed: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


# ------------------------------------------------------------------ conversão
def _parse_time(value: str | int | None) -> datetime | None:
    """Datas da Graph API: «2026-10-01T09:00:00+0000» ou, nas histórias, segundos desde 1970."""
    if value is None or value == "":
        return None
    if isinstance(value, int) or str(value).isdigit():
        return datetime.fromtimestamp(int(value), UTC)
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        return None


def facebook_url(link: str | None) -> str | None:
    """Os vídeos devolvem o permalink relativo («/reel/123»): passa a endereço completo."""
    if not link:
        return None
    full = f"https://www.facebook.com{link}" if link.startswith("/") else link
    return full if re.match(r"^https://(www\.|m\.)?facebook\.com/", full) else None


def best_thumbnail(video: dict[str, Any]) -> str | None:
    thumbs = [t for t in (video.get("thumbnails") or {}).get("data", []) if isinstance(t, dict) and t.get("uri")]
    preferred = next((t for t in thumbs if t.get("is_preferred")), thumbs[0] if thumbs else None)
    return str(preferred["uri"]) if preferred else (str(video["picture"]) if video.get("picture") else None)


def _hashtags(text: str) -> set[str]:
    return {t.lower() for t in re.findall(r"#([\wÀ-ÿ]+)", text)}


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"#[\wÀ-ÿ]+", "", line)).strip(" -–—:|")


def _shorten(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut + "…"


def title_and_summary(message: str) -> tuple[str, str]:
    """Título: a primeira frase da primeira linha (sem hashtags). Resumo: o resto do texto."""
    lines = [x for x in (_clean_line(line) for line in message.splitlines()) if x]
    if not lines:
        return "Notícia do clube", ""
    first, others = lines[0], lines[1:]
    sentence = re.match(r"^(.{10,140}?[.!?])\s+(.+)$", first)
    title, rest = (sentence.group(1), [sentence.group(2), *others]) if sentence else (first, others)
    summary = " ".join(rest).strip() or first
    return _shorten(title.rstrip("."), 160), _shorten(summary, 300)


def body_html(text: str, link: str | None) -> str:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    out = "".join(f"<p>{html.escape(p, quote=False).replace(chr(10), '<br>')}</p>" for p in paragraphs)
    if link and link.startswith("https://"):
        out += f'<p><a href="{html.escape(link)}" target="_blank">Ver no Facebook</a></p>'
    return sanitize_body(out or "<p></p>")


def category_for(message: str) -> str:
    for tag in _hashtags(message):
        if tag in CATEGORY_TAGS:
            return CATEGORY_TAGS[tag]
    return "Clube"


def event_kind(text: str) -> str:
    low = text.lower()
    return next((kind for key, kind in EVENT_KINDS if key in low), "Convívio")


def event_sport(text: str) -> str | None:
    low = text.lower()
    return next((s for s in SPORTS if s in low), None)


def slug_for(title: str, external_id: str) -> str:
    base = slugify(title)[:90].strip("-") or "facebook"
    own = external_id.rsplit("_", 1)[-1]  # publicações: «idpágina_idpublicação»
    suffix = re.sub(r"\D", "", own)[-8:] or slugify(own)[-8:] or "fb"
    return f"{base}-{suffix}"


# ------------------------------------------------------------------ escrita no CMS
async def _external(c: Conn, external_id: str) -> dict[str, Any] | None:
    cur = await c.execute("select * from cms_external where source = %s and external_id = %s", [SOURCE, external_id])
    return await cur.fetchone()


async def _edited_on_site(c: Conn, table: str, ext: dict[str, Any]) -> bool:
    """A equipa mexeu na entrada depois da última importação? Então o site ganha."""
    cur = await c.execute(
        f"select updated_at > %s::timestamptz + interval '1 second' as edited from {table} where id = %s", [ext["synced_at"], ext["entry_id"]]
    )
    row = await cur.fetchone()
    return row is None or bool(row["edited"])


async def _store_image(c: Conn, client: GraphClient, url: str | None, name: str, alt: str) -> str | None:
    if not url:
        return None
    img = await client.image(url)
    if not img:
        return None
    data, mime = img
    cur = await c.execute(
        "insert into cms_media (name, mime, size_bytes, alt, data, uploaded_by) values (%s,%s,%s,%s,%s,null) returning id, key",
        [name[:200], mime, len(data), alt[:300], data],
    )
    row = await cur.fetchone()
    assert row is not None
    await audit(c, SYSTEM, "cms.media.upload", "cms_media", row["id"], {"name": name[:200], "size": len(data), "via": SOURCE})
    return f"/api/v1/media/{row['key']}.{EXT[mime]}"


async def _link(c: Conn, external_id: str, type_: str, entry_id: int, remote_updated: str | None) -> None:
    await c.execute(
        """insert into cms_external (source, external_id, type, entry_id, remote_updated_at, synced_at) values (%s,%s,%s,%s,%s, now())
           on conflict (source, external_id) do update set entry_id = excluded.entry_id, remote_updated_at = excluded.remote_updated_at, synced_at = now()""",
        [SOURCE, external_id, type_, entry_id, remote_updated],
    )


async def sync_posts(c: Conn, client: GraphClient, cfg: FacebookConfig, summary: Summary) -> None:
    posts = await client.items(
        f"{cfg.page_id}/posts", {"fields": "id,message,created_time,updated_time,permalink_url,full_picture,status_type", "limit": "25"}
    )
    for p in posts:
        pid, message = str(p.get("id", "")), str(p.get("message") or "").strip()
        if not pid or not message or p.get("status_type") == "shared_story" or (cfg.tag and cfg.tag not in _hashtags(message)):
            summary.skipped += 1
            continue
        title, summ = title_and_summary(message)
        fields = {
            "title": title,
            "summary": summ,
            "body": body_html(message, p.get("permalink_url")),
            "category": category_for(message),
            "author": "Serrado FC (Facebook)",
        }
        ext = await _external(c, pid)
        if ext is None:
            created = _parse_time(p.get("created_time"))
            cover = await _store_image(c, client, p.get("full_picture"), f"facebook-{pid}.jpg", title)
            publish = cfg.mode == "publish"
            cur = await c.execute(
                """insert into cms_news (slug, title, category, summary, body, cover_url, author, status, published_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *""",
                [
                    slug_for(title, pid),
                    fields["title"],
                    fields["category"],
                    fields["summary"],
                    fields["body"],
                    cover,
                    fields["author"],
                    "published" if publish else "draft",
                    created.isoformat() if (publish and created) else None,
                ],
            )
            row = await cur.fetchone()
            assert row is not None
            entry = camel(row)
            await revision(c, "news", entry, None)
            await audit(c, SYSTEM, "cms.news.create", "cms_news", entry["id"], {"slug": entry["slug"], "via": SOURCE, "post": pid})
            await _link(c, pid, "news", entry["id"], p.get("updated_time"))
            summary.news_created += 1
        elif ext["remote_updated_at"] != p.get("updated_time") and not await _edited_on_site(c, "cms_news", ext):
            cur = await c.execute(
                "update cms_news set title = %s, summary = %s, body = %s, category = %s, updated_at = now() where id = %s returning *",
                [fields["title"], fields["summary"], fields["body"], fields["category"], ext["entry_id"]],
            )
            row = await cur.fetchone()
            if row:
                await revision(c, "news", camel(row), None)
                await audit(c, SYSTEM, "cms.news.update", "cms_news", ext["entry_id"], {"slug": row["slug"], "via": SOURCE, "post": pid})
                summary.news_updated += 1
            await _link(c, pid, "news", ext["entry_id"], p.get("updated_time"))


async def sync_events(c: Conn, client: GraphClient, cfg: FacebookConfig, summary: Summary) -> None:
    events = await client.items(
        f"{cfg.page_id}/events",
        {
            "fields": "id,name,description,start_time,end_time,place{name},cover{source},is_canceled,updated_time",
            "time_filter": "upcoming",
            "limit": "25",
        },
    )
    for e in events:
        eid, name = str(e.get("id", "")), str(e.get("name") or "").strip()
        start = _parse_time(e.get("start_time"))
        if not eid or not name or not start:
            summary.skipped += 1
            continue
        ext = await _external(c, eid)
        if e.get("is_canceled"):
            if ext:
                await c.execute("update cms_events set status = 'archived', updated_at = now() where id = %s", [ext["entry_id"]])
                await audit(c, SYSTEM, "cms.events.archive", "cms_events", ext["entry_id"], {"via": SOURCE, "event": eid, "reason": "cancelado"})
                await _link(c, eid, "events", ext["entry_id"], e.get("updated_time"))
                summary.events_archived += 1
            else:
                summary.skipped += 1
            continue
        description = str(e.get("description") or "").strip()
        end = _parse_time(e.get("end_time"))
        local_start = start.astimezone(LISBON)
        place = e.get("place") or {}
        fields = {
            "title": _shorten(name, 200),
            "summary": _shorten(re.sub(r"\s+", " ", description), 400) if description else "",
            "body": body_html(description, f"https://www.facebook.com/events/{eid}/")
            if description
            else body_html(name, f"https://www.facebook.com/events/{eid}/"),
            "starts_at": local_start.strftime("%Y-%m-%dT%H:%M"),
            "end_time": end.astimezone(LISBON).strftime("%H:%M") if end and end.astimezone(LISBON).date() == local_start.date() else None,
            "location": _shorten(str(place.get("name") or "A anunciar"), 200),
        }
        if ext is None:
            cover = await _store_image(c, client, (e.get("cover") or {}).get("source"), f"facebook-evento-{eid}.jpg", name)
            publish = cfg.mode == "publish"
            cur = await c.execute(
                """insert into cms_events (slug, title, kind, sport_slug, summary, body, cover_url, starts_at, end_time, location, capacity, price,
                     registration_required, ask_shirt_size, status, published_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,0,false,false,%s,%s) returning *""",
                [
                    slug_for(name, eid),
                    fields["title"],
                    event_kind(f"{name} {description}"),
                    event_sport(f"{name} {description}"),
                    fields["summary"],
                    fields["body"],
                    cover,
                    fields["starts_at"],
                    fields["end_time"],
                    fields["location"],
                    "published" if publish else "draft",
                    datetime.now(LISBON).isoformat() if publish else None,
                ],
            )
            row = await cur.fetchone()
            assert row is not None
            entry = camel(row)
            await revision(c, "events", entry, None)
            await audit(c, SYSTEM, "cms.events.create", "cms_events", entry["id"], {"slug": entry["slug"], "via": SOURCE, "event": eid})
            await _link(c, eid, "events", entry["id"], e.get("updated_time"))
            summary.events_created += 1
        elif ext["remote_updated_at"] != e.get("updated_time") and not await _edited_on_site(c, "cms_events", ext):
            cur = await c.execute(
                """update cms_events set title = %s, summary = %s, body = %s, starts_at = %s, end_time = %s, location = %s, updated_at = now()
                   where id = %s returning *""",
                [fields["title"], fields["summary"], fields["body"], fields["starts_at"], fields["end_time"], fields["location"], ext["entry_id"]],
            )
            row = await cur.fetchone()
            if row:
                await revision(c, "events", camel(row), None)
                await audit(c, SYSTEM, "cms.events.update", "cms_events", ext["entry_id"], {"slug": row["slug"], "via": SOURCE, "event": eid})
                summary.events_updated += 1
            await _link(c, eid, "events", ext["entry_id"], e.get("updated_time"))


# ------------------------------------------------------------------ reels e histórias
async def _social(c: Conn, external_id: str) -> dict[str, Any] | None:
    cur = await c.execute("select * from social_items where source = %s and external_id = %s", [SOURCE, external_id])
    return await cur.fetchone()


async def _store_thumb(c: Conn, client: GraphClient, url: str | None, name: str, alt: str) -> tuple[str, int] | None:
    stored = await _store_image(c, client, url, name, alt)
    if not stored:
        return None
    row = await (await c.execute("select id from cms_media where key = %s::uuid", [stored.rsplit("/", 1)[-1].split(".")[0]])).fetchone()
    assert row is not None
    return stored, int(row["id"])


async def sync_reels(c: Conn, client: GraphClient, cfg: FacebookConfig, summary: Summary) -> None:
    reels = await client.items(
        f"{cfg.page_id}/video_reels",
        {"fields": "id,description,created_time,updated_time,permalink_url,length,picture,thumbnails{uri,is_preferred}", "limit": "25"},
        max_pages=1,
    )
    for v in reels:
        vid, posted = str(v.get("id", "")), _parse_time(v.get("created_time"))
        link = facebook_url(v.get("permalink_url")) or (f"https://www.facebook.com/reel/{vid}" if vid.isdigit() else None)
        if not vid or not posted or not link:
            summary.skipped += 1
            continue
        caption = _shorten(str(v.get("description") or "").strip(), 2000)
        ext = await _social(c, vid)
        if ext is None:
            thumb = await _store_thumb(c, client, best_thumbnail(v), f"facebook-reel-{vid}.jpg", _shorten(caption, 300) or "Reel do Serrado FC")
            await c.execute(
                """insert into social_items (source, kind, external_id, caption, permalink, media_type, thumb_url, thumb_media_id,
                     duration_seconds, posted_at, hidden, remote_updated_at)
                   values (%s, 'reel', %s, %s, %s, 'video', %s, %s, %s, %s, %s, %s)""",
                [
                    SOURCE,
                    vid,
                    caption,
                    link,
                    thumb and thumb[0],
                    thumb and thumb[1],
                    v.get("length"),
                    posted,
                    cfg.mode == "draft",
                    v.get("updated_time"),
                ],
            )
            summary.reels_created += 1
        elif ext["remote_updated_at"] != v.get("updated_time"):
            await c.execute(
                "update social_items set caption = %s, permalink = %s, duration_seconds = %s, remote_updated_at = %s, updated_at = now() where id = %s",
                [caption, link, v.get("length"), v.get("updated_time"), ext["id"]],
            )
            summary.reels_updated += 1


async def sync_stories(c: Conn, client: GraphClient, cfg: FacebookConfig, summary: Summary) -> None:
    # Histórias com mais de 7 dias saem (com a miniatura): no site só se mostram durante 24 horas
    old = await (
        await c.execute(
            "delete from social_items where kind = 'story' and source = %s and posted_at < now() - interval '7 days' returning thumb_media_id",
            [SOURCE],
        )
    ).fetchall()
    media = [r["thumb_media_id"] for r in old if r["thumb_media_id"]]
    if media:
        await c.execute("delete from cms_media where id = any(%s)", [media])
    summary.stories_removed += len(old)
    stories = await client.items(
        f"{cfg.page_id}/stories", {"fields": "post_id,status,creation_time,media_type,media_id,url", "limit": "25"}, max_pages=1
    )
    for st in stories:
        sid, posted = str(st.get("post_id") or st.get("id") or ""), _parse_time(st.get("creation_time"))
        if not sid or not posted or str(st.get("status", "PUBLISHED")).upper() != "PUBLISHED":
            summary.skipped += 1
            continue
        if posted < datetime.now(UTC) - timedelta(days=1) or await _social(c, sid):
            continue
        kind = "photo" if str(st.get("media_type", "")).lower() == "photo" else "video"
        thumb_url: str | None = None
        if st.get("media_id"):
            try:
                if kind == "photo":
                    photo = await client.get(str(st["media_id"]), {"fields": "images"})
                    images = sorted((i for i in photo.get("images", []) if i.get("source")), key=lambda i: -int(i.get("width") or 0))
                    # A maior que não passe de ~1080 px (as originais podem ter vários MB)
                    fit = [i for i in images if int(i.get("width") or 0) <= 1080]
                    thumb_url = str((fit or images)[0]["source"]) if images else None
                else:
                    thumb_url = best_thumbnail(await client.get(str(st["media_id"]), {"fields": "picture,thumbnails{uri,is_preferred}"}))
            except FacebookError:
                thumb_url = None
        thumb = await _store_thumb(c, client, thumb_url, f"facebook-historia-{sid}.jpg", "História do Serrado FC")
        await c.execute(
            """insert into social_items (source, kind, external_id, permalink, media_type, thumb_url, thumb_media_id, posted_at, expires_at, hidden)
               values (%s, 'story', %s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                SOURCE,
                sid,
                facebook_url(st.get("url")),
                kind,
                thumb and thumb[0],
                thumb and thumb[1],
                posted,
                posted + timedelta(days=1),
                cfg.mode == "draft",
            ],
        )
        summary.stories_created += 1


async def sync(pool: Pool, cfg: FacebookConfig | None = None, client: GraphClient | None = None) -> Summary:
    """Importa publicações e eventos. Cada parte numa transação: um erro nos eventos não perde as notícias."""
    cfg = cfg or config.facebook
    if not cfg.page_id or not cfg.page_token:
        raise FacebookError("Falta FACEBOOK_PAGE_ID ou FACEBOOK_PAGE_TOKEN")
    client = client or GraphClient(cfg)
    summary = Summary()
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(%s) as ok", [LOCK_ID])).fetchone()
        if not got or not got["ok"]:
            summary.errors.append("já há uma sincronização a correr")
            return summary
        try:
            steps = (("publicações", sync_posts), ("eventos", sync_events), ("reels", sync_reels), ("histórias", sync_stories))
            for name, step in steps:
                try:
                    async with pool.connection() as c:
                        await step(c, client, cfg, summary)
                except FacebookError as e:
                    summary.errors.append(f"{name}: {e}")
        finally:
            await lock.execute("select pg_advisory_unlock(%s)", [LOCK_ID])
    return summary


async def check(cfg: FacebookConfig | None = None, client: GraphClient | None = None) -> str:
    cfg = cfg or config.facebook
    client = client or GraphClient(cfg)
    page = await client.get(cfg.page_id, {"fields": "id,name"})
    return str(page.get("name", "?"))


async def _main(command: str, log: Callable[[str], None] = print) -> int:
    if command == "check":
        try:
            log(f"✔ Página: {await check()}")
            return 0
        except FacebookError as e:
            log(f"✘ {e}")
            return 1
    pool = create_pool(max_size=2)
    await pool.open()
    try:
        s = await sync(pool)
    except FacebookError as e:
        log(f"✘ {e}")
        return 1
    finally:
        await pool.close()
    log(json.dumps(s.__dict__, ensure_ascii=False))
    return 1 if s.errors else 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in ("sync", "check"):
        print("Uso: python -m serrado.facebook sync|check", file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(_main(cmd)))


__all__ = ["FacebookError", "GraphClient", "Summary", "check", "sync"]
