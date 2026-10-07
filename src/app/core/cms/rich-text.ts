/**
 * Texto dos conteúdos do CMS. O editor visual grava HTML (limpo pelo backend);
 * os conteúdos antigos são texto simples com parágrafos separados por uma linha em branco.
 * Espelha services/shared/html.ts. No site, o HTML passa ainda pelo sanitizador do Angular ([innerHTML]).
 */
export const isHtml = (body: string) => /^\s*</.test(body);

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto do CMS → HTML (o texto simples passa a parágrafos). */
export function bodyToHtml(body: unknown): string {
  const text = String(body ?? '');
  if (isHtml(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** HTML → texto simples (contagens e pré-visualizações curtas). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h[23]|\/li|\/blockquote)\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
