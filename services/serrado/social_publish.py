"""
Backoffice → Facebook e Instagram do clube (Graph API da Meta, com o token da página).

A equipa escreve o texto, escolhe a imagem e a hora em «Publicar nas redes». Cada rede é uma
linha em social_posts. «Agora» publica logo (o backend chama dispatch() depois de responder);
as agendadas saem quando a sincronização com o Facebook corre (de 15 em 15 minutos) ou à mão:

    python -m serrado.social_publish send     # publica as que já chegaram à hora
    python -m serrado.social_publish check    # mostra a página e a conta de Instagram ligadas

Regras:
- O token é o da página (FACEBOOK_PAGE_TOKEN) e precisa também de pages_manage_posts e, para o
  Instagram, de instagram_basic e instagram_content_publish. A conta de Instagram tem de ser
  profissional e estar ligada à página.
- A imagem passa sempre a JPEG (o Instagram não aceita outro formato) e, se for muito larga ou
  muito alta, ganha margens brancas para caber nas proporções do Instagram (4:5 a 1,91:1).
- Uma publicação feita no Facebook a partir de uma notícia fica ligada a essa notícia
  (cms_external), para a sincronização não a importar outra vez como notícia nova.
- Até 3 tentativas, com 5 minutos entre elas. Uma publicação interrompida a meio não se repete
  (podia duplicar): fica como falhada, para a equipa confirmar nas redes.
"""

import asyncio
import io
import json
import logging
import re
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
from PIL import Image, ImageOps

from .backend.core import Actor, audit
from .config import FacebookConfig, config
from .db.pool import Conn, Pool, create_pool
from .facebook import ORIGIN_SITE, FacebookError, GraphClient

log = logging.getLogger("serrado.social")

LOCK_ID = 7_301_979  # pg_advisory_lock: uma publicação de cada vez
MAX_ATTEMPTS = 3
JPEG_MAX_WIDTH = 1440
IG_MIN_RATIO, IG_MAX_RATIO = 0.8, 1.91  # largura / altura aceites pelo Instagram
SYSTEM = Actor()

# Nos testes: Graph API falsa e sem esperas
TRANSPORT: httpx.AsyncBaseTransport | None = None
SLEEP: Callable[[float], Awaitable[None]] = asyncio.sleep


@dataclass
class Summary:
    published: int = 0
    failed: int = 0
    retry: int = 0
    errors: list[str] = field(default_factory=list)


def configured(cfg: FacebookConfig | None = None) -> bool:
    cfg = cfg or config.facebook
    return bool(cfg.page_id and cfg.page_token)


def client_for(cfg: FacebookConfig) -> GraphClient:
    return GraphClient(cfg, transport=TRANSPORT)


# ------------------------------------------------------------------ imagem
def to_jpeg(data: bytes) -> tuple[bytes, int, int]:
    """JPEG RGB, no máximo 1440 px de largura e com margens brancas se sair das proporções do Instagram."""
    with Image.open(io.BytesIO(data)) as raw:
        img = ImageOps.exif_transpose(raw)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.getchannel("A"))
            img = bg
        else:
            img = img.convert("RGB")
    w, h = img.size
    ratio = w / h
    if ratio > IG_MAX_RATIO or ratio < IG_MIN_RATIO:
        nw, nh = (w, round(w / IG_MAX_RATIO)) if ratio > IG_MAX_RATIO else (round(h * IG_MIN_RATIO), h)
        canvas = Image.new("RGB", (nw, nh), (255, 255, 255))
        canvas.paste(img, ((nw - w) // 2, (nh - h) // 2))
        img = canvas
    if img.width > JPEG_MAX_WIDTH:
        img = img.resize((JPEG_MAX_WIDTH, round(img.height * JPEG_MAX_WIDTH / img.width)), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue(), img.width, img.height


_MEDIA = re.compile(r"^/api/v1/media/([0-9a-f-]{36})\.[a-z]+$")


async def _source_bytes(c: Conn, client: GraphClient, url: str) -> bytes:
    m = _MEDIA.match(url)
    if m:
        row = await (await c.execute("select data from cms_media where key = %s::uuid", [m.group(1)])).fetchone()
        if not row:
            raise FacebookError("a imagem escolhida já não existe na biblioteca")
        return bytes(row["data"])
    full = f"{config.oauth.public_url}{url}" if url.startswith("/") else url
    img = await client.image(full)
    if not img:
        raise FacebookError("não consegui ler a imagem (tem de ser https, até 5 MB, JPEG/PNG/WebP/GIF)")
    return img[0]


async def public_jpeg(c: Conn, client: GraphClient, post_id: int, url: str) -> str:
    """Guarda a imagem em JPEG na biblioteca e devolve o endereço público (a Meta vai buscá-la lá)."""
    if not config.oauth.public_url.startswith("https://"):
        raise FacebookError("falta PUBLIC_URL (https) na configuração do servidor")
    try:
        jpeg, width, height = to_jpeg(await _source_bytes(c, client, url))
    except (OSError, Image.DecompressionBombError):
        raise FacebookError("a imagem não é válida") from None
    cur = await c.execute(
        """insert into cms_media (name, mime, size_bytes, width, height, alt, data, uploaded_by)
           values (%s, 'image/jpeg', %s, %s, %s, 'Imagem publicada nas redes sociais', %s, null) returning key""",
        [f"redes-sociais-{post_id}.jpg", len(jpeg), width, height, jpeg],
    )
    row = await cur.fetchone()
    assert row is not None
    return f"{config.oauth.public_url}/api/v1/media/{row['key']}.jpg"


# ------------------------------------------------------------------ publicação
async def instagram_account(client: GraphClient, cfg: FacebookConfig) -> dict[str, Any] | None:
    page = await client.get(cfg.page_id, {"fields": "instagram_business_account{id,username}"})
    acc = page.get("instagram_business_account")
    return acc if isinstance(acc, dict) and acc.get("id") else None


async def _permalink(client: GraphClient, object_id: str, field_name: str) -> str | None:
    try:
        got = await client.get(object_id, {"fields": field_name})
    except FacebookError:
        return None
    link = got.get(field_name)
    return str(link) if isinstance(link, str) and link.startswith("https://") else None


async def publish_facebook(client: GraphClient, cfg: FacebookConfig, caption: str, link: str | None, image: str | None) -> tuple[str, str | None]:
    if image:
        # Foto com texto: o link vai no texto (no Facebook fica clicável)
        message = caption if not link or link in caption else f"{caption}\n\n{link}"
        res = await client.post(f"{cfg.page_id}/photos", {"url": image, "message": message})
        post_id = str(res.get("post_id") or res.get("id") or "")
    else:
        data = {"message": caption, **({"link": link} if link else {})}
        res = await client.post(f"{cfg.page_id}/feed", data)
        post_id = str(res.get("id") or "")
    if not post_id:
        raise FacebookError("a Meta não devolveu o id da publicação")
    return post_id, await _permalink(client, post_id, "permalink_url")


async def publish_instagram(client: GraphClient, cfg: FacebookConfig, caption: str, image: str) -> tuple[str, str | None]:
    acc = await instagram_account(client, cfg)
    if not acc:
        raise FacebookError("a página de Facebook não tem uma conta de Instagram profissional ligada")
    ig = str(acc["id"])
    container = str((await client.post(f"{ig}/media", {"image_url": image, "caption": caption})).get("id") or "")
    if not container:
        raise FacebookError("a Meta não criou a publicação do Instagram")
    for _ in range(20):  # a Meta prepara a imagem em segundos; espera até ~1 minuto
        state = str((await client.get(container, {"fields": "status_code"})).get("status_code") or "")
        if state == "FINISHED":
            break
        if state in ("ERROR", "EXPIRED"):
            raise FacebookError(f"o Instagram recusou a imagem ({state})")
        await SLEEP(3)
    else:
        raise FacebookError("o Instagram demorou demasiado a preparar a imagem")
    media_id = str((await client.post(f"{ig}/media_publish", {"creation_id": container})).get("id") or "")
    if not media_id:
        raise FacebookError("a Meta não devolveu o id da publicação do Instagram")
    return media_id, await _permalink(client, media_id, "permalink")


async def _publish_one(pool: Pool, client: GraphClient, cfg: FacebookConfig, post: dict[str, Any], images: dict[str, str]) -> None:
    async with pool.connection() as c:
        image: str | None = None
        if post["image_url"]:
            image = images.get(post["image_url"]) or await public_jpeg(c, client, post["id"], post["image_url"])
            images[post["image_url"]] = image
        if post["network"] == "facebook":
            external_id, permalink = await publish_facebook(client, cfg, post["caption"], post["link"], image)
        else:
            assert image is not None
            external_id, permalink = await publish_instagram(client, cfg, post["caption"], image)
        await c.execute(
            """update social_posts set status = 'published', external_id = %s, permalink = %s, error = null,
                   published_at = now(), updated_at = now() where id = %s""",
            [external_id, permalink, post["id"]],
        )
        if post["network"] == "facebook" and post["news_id"]:
            await c.execute(
                """insert into cms_external (source, external_id, type, entry_id, remote_updated_at) values ('facebook', %s, 'news', %s, %s)
                   on conflict (source, external_id) do nothing""",
                [external_id, post["news_id"], ORIGIN_SITE],
            )
        await audit(c, SYSTEM, "social.publish", "social_posts", post["id"], {"network": post["network"], "external": external_id})


async def dispatch(pool: Pool, cfg: FacebookConfig | None = None, client: GraphClient | None = None, ids: list[int] | None = None) -> Summary:
    """Publica as que já chegaram à hora (ou só as indicadas, se já chegaram à hora)."""
    cfg = cfg or config.facebook
    summary = Summary()
    if not configured(cfg):
        summary.errors.append("Falta FACEBOOK_PAGE_ID ou FACEBOOK_PAGE_TOKEN")
        return summary
    client = client or client_for(cfg)
    async with pool.connection() as lock:
        await lock.set_autocommit(True)
        got = await (await lock.execute("select pg_try_advisory_lock(%s) as ok", [LOCK_ID])).fetchone()
        if not got or not got["ok"]:
            summary.errors.append("já há uma publicação a correr")
            return summary
        try:
            # Interrompidas a meio (o processo morreu): não se repetem, podiam duplicar
            await lock.execute(
                """update social_posts set status = 'failed', updated_at = now(),
                       error = 'Interrompida a meio: confirma na rede se saiu e, se não, volta a tentar.'
                   where status = 'publishing' and updated_at < now() - interval '15 minutes'"""
            )
            cur = await lock.execute(
                f"""update social_posts set status = 'publishing', attempts = attempts + 1, updated_at = now()
                     where id in (select id from social_posts where status = 'scheduled' and scheduled_at <= now()
                                  {"and id = any(%s)" if ids else ""} order by scheduled_at, id limit 20)
                 returning id, network, news_id, caption, link, image_url, attempts""",
                [ids] if ids else [],
            )
            posts = sorted(await cur.fetchall(), key=lambda p: (p["network"] != "facebook", p["id"]))
            images: dict[str, str] = {}
            for post in posts:
                try:
                    await _publish_one(pool, client, cfg, post, images)
                    summary.published += 1
                except Exception as e:  # noqa: BLE001 — cada publicação falha sozinha; as outras seguem
                    known = isinstance(e, FacebookError)
                    if not known:
                        log.exception("publicação %s", post["id"])
                    message = str(e) if known else "erro inesperado: confirma na rede se saiu antes de voltar a tentar"
                    # Erro desconhecido: pode ter saído na rede, por isso não se repete sozinha
                    final = post["attempts"] >= MAX_ATTEMPTS or not known
                    await lock.execute(
                        f"""update social_posts set status = %s, error = %s, updated_at = now()
                               {"" if final else ", scheduled_at = now() + interval '5 minutes'"} where id = %s""",
                        ["failed" if final else "scheduled", message[:500], post["id"]],
                    )
                    summary.errors.append(f"{post['network']} #{post['id']}: {message}")
                    if final:
                        summary.failed += 1
                    else:
                        summary.retry += 1
        finally:
            await lock.execute("select pg_advisory_unlock(%s)", [LOCK_ID])
    return summary


async def accounts(cfg: FacebookConfig | None = None, client: GraphClient | None = None) -> dict[str, Any]:
    """Página e conta de Instagram ligadas (para o backoffice e para «check»)."""
    cfg = cfg or config.facebook
    client = client or client_for(cfg)
    page = await client.get(cfg.page_id, {"fields": "name,instagram_business_account{id,username}"})
    acc = page.get("instagram_business_account")
    return {
        "page": str(page.get("name") or ""),
        "instagram": str(acc.get("username") or "") if isinstance(acc, dict) and acc.get("id") else None,
    }


async def _main(command: str) -> int:
    if command == "check":
        try:
            a = await accounts()
        except FacebookError as e:
            print(f"✘ {e}")
            return 1
        print(f"✔ Facebook: {a['page']}")
        print(f"✔ Instagram: @{a['instagram']}" if a["instagram"] else "! Sem conta de Instagram profissional ligada à página")
        return 0
    pool = create_pool(max_size=2)
    await pool.open()
    try:
        s = await dispatch(pool)
    finally:
        await pool.close()
    print(json.dumps(s.__dict__, ensure_ascii=False))
    return 1 if s.failed else 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in ("send", "check"):
        print("Uso: python -m serrado.social_publish send|check", file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(_main(cmd)))


__all__ = ["Summary", "accounts", "configured", "dispatch", "publish_facebook", "publish_instagram", "to_jpeg"]
