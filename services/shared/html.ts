import sanitizeHtml from 'sanitize-html';

/**
 * Texto dos conteúdos do CMS. O editor visual produz HTML; os conteúdos antigos são
 * texto simples, com parágrafos separados por uma linha em branco.
 */
export const isHtml = (body: string) => /^\s*</.test(body);

/** Endereços aceites em imagens: as do próprio site (biblioteca de imagens) ou https. */
export const MEDIA_PATH = '/api/v1/media/';
export const IMAGE_URL = /^(https:\/\/|\/api\/v1\/media\/)[^\s"'<>]+$/;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  // Títulos: só h2 e h3 (o h1 é o título da página)
  transformTags: {
    h1: 'h2',
    h4: 'h3',
    b: 'strong',
    i: 'em',
    a: (tagName, attribs) => {
      const out: sanitizeHtml.Attributes = { href: attribs['href'] ?? '' };
      if (attribs['target'] === '_blank') Object.assign(out, { target: '_blank', rel: 'noopener noreferrer' });
      return { tagName, attribs: out };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !IMAGE_URL.test(frame.attribs.src ?? ''),
};

/** HTML vindo do editor → só as etiquetas e os atributos permitidos (sem scripts, estilos nem eventos). */
export function sanitizeBody(body: string): string {
  if (!isHtml(body)) return body;
  return sanitizeHtml(body, OPTIONS).trim();
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto do CMS → HTML para o site (o texto simples antigo passa a parágrafos). */
export function toHtml(body: unknown): string {
  const text = String(body ?? '');
  if (isHtml(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
