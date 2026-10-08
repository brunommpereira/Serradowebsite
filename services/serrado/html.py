"""
Texto dos conteúdos do CMS. O editor visual produz HTML; os conteúdos antigos são
texto simples, com parágrafos separados por uma linha em branco.
"""

import html
import re

import nh3

MEDIA_PATH = "/api/v1/media/"
# Endereços aceites em imagens: as do próprio site (biblioteca de imagens) ou https
IMAGE_URL = re.compile(r"^(https://|/api/v1/media/)[^\s\"'<>]+$")

TAGS = {"p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "img", "hr"}
ATTRIBUTES = {"a": {"href"}, "img": {"src", "alt", "width", "height"}}
# Títulos: só h2 e h3 (o h1 é o título da página); <b>/<i> passam a <strong>/<em>
RENAME = {"h1": "h2", "h4": "h3", "b": "strong", "i": "em"}
_RENAME_RE = re.compile(r"<(/?)(h1|h4|b|i)(?=[\s/>])", re.IGNORECASE)
_IMG_WITHOUT_SRC = re.compile(r"<img(?![^>]*\ssrc=)[^>]*>")


def is_html(body: str) -> bool:
    return re.match(r"^\s*<", body) is not None


def _attribute_filter(tag: str, attr: str, value: str) -> str | None:
    if tag == "img" and attr == "src":
        return value if IMAGE_URL.match(value) else None
    if tag == "a" and attr == "href":
        # Sem endereços relativos ao protocolo («//outro-site»)
        return None if value.startswith("//") or value.startswith("\\") else value
    return value


def sanitize_body(body: str) -> str:
    """HTML vindo do editor → só as etiquetas e os atributos permitidos (sem scripts, estilos nem eventos)."""
    if not is_html(body):
        return body
    renamed = _RENAME_RE.sub(lambda m: f"<{m.group(1)}{RENAME[m.group(2).lower()]}", body)
    out = nh3.clean(
        renamed,
        tags=TAGS,
        attributes=ATTRIBUTES,
        url_schemes={"https", "http", "mailto", "tel"},
        tag_attribute_values={"a": {"target": {"_blank"}}},
        link_rel="noopener noreferrer",
        attribute_filter=_attribute_filter,
    )
    # Imagens sem um endereço aceite desaparecem por completo
    return _IMG_WITHOUT_SRC.sub("", out).strip()


def to_html(body: object) -> str:
    """Texto do CMS → HTML para o site (o texto simples antigo passa a parágrafos)."""
    text = "" if body is None else str(body)
    if is_html(text):
        return text
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text)]
    return "".join(f"<p>{html.escape(p, quote=False).replace('"', '&quot;').replace(chr(10), '<br>')}</p>" for p in paragraphs if p)
