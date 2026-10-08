import type { FastifyInstance } from 'fastify';
import { tx } from '../../../shared/db.ts';
import { audit, camel, HttpError, notFound, requireRole } from '../core.ts';

/**
 * Biblioteca de imagens do CMS. O browser reduz e converte as imagens antes de as enviar,
 * o que também apaga os metadados (EXIF, localização GPS). Aqui confirma-se o tipo real
 * pelo conteúdo do ficheiro e o tamanho.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Tipo de imagem pelos primeiros bytes (não confia no nome nem no tipo declarado). */
export function sniffImage(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

const COLUMNS = 'id, key, name, mime, size_bytes, width, height, alt, created_at, (select name from users where id = uploaded_by) as uploaded_by_name';

/** Onde a imagem está a ser usada (texto ou capa de notícias, eventos e páginas). */
async function usage(app: FastifyInstance, key: string) {
  const { rows } = await app.pool.query(
    `select 'news' as type, id, title from cms_news where body like $1 or cover_url like $1
     union all select 'events', id, title from cms_events where body like $1 or cover_url like $1
     union all select 'pages', id, title from cms_pages where body like $1`,
    [`%${key}%`],
  );
  return rows as { type: string; id: number; title: string }[];
}

export async function mediaRoutes(app: FastifyInstance) {
  const tags = ['Imagens'];
  const idParams = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } as const;

  app.get(
    '/cms/media',
    {
      schema: {
        tags,
        summary: 'Lista as imagens (sem o conteúdo)',
        querystring: { type: 'object', properties: { q: { type: 'string', maxLength: 100 }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 } } },
      },
    },
    async (req) => {
      requireRole(req, 'editor');
      const { q, limit } = req.query as { q?: string; limit: number };
      const { rows } = await app.pool.query(
        `select ${COLUMNS} from cms_media where ($1::text is null or name ilike '%' || $1 || '%' or alt ilike '%' || $1 || '%') order by created_at desc limit $2`,
        [q || null, limit],
      );
      return rows.map((r) => camel(r));
    },
  );

  app.post(
    '/cms/media',
    {
      bodyLimit: 8 * 1024 * 1024,
      schema: {
        tags,
        summary: 'Carrega uma imagem (conteúdo em base64)',
        body: {
          type: 'object',
          required: ['name', 'data'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            data: { type: 'string', minLength: 8, maxLength: 7_100_000 },
            alt: { type: 'string', maxLength: 300 },
            width: { type: 'integer', minimum: 1, maximum: 10000 },
            height: { type: 'integer', minimum: 1, maximum: 10000 },
          },
        },
      },
    },
    async (req, reply) => {
      requireRole(req, 'editor');
      const body = req.body as { name: string; data: string; alt?: string; width?: number; height?: number };
      const bytes = Buffer.from(body.data, 'base64');
      if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'too_large', 'A imagem tem mais de 5 MB');
      const mime = sniffImage(bytes);
      if (!mime) throw new HttpError(415, 'unsupported_type', 'Formato não suportado. Usa JPEG, PNG, WebP ou GIF.');
      const name = body.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 200) || 'imagem';
      const row = await tx(app.pool, async (c) => {
        const { rows } = await c.query(
          `insert into cms_media (name, mime, size_bytes, width, height, alt, data, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning ${COLUMNS}`,
          [name, mime, bytes.length, body.width ?? null, body.height ?? null, body.alt?.trim() ?? '', bytes, req.actor.id],
        );
        await audit(c, req.actor, 'cms.media.upload', 'cms_media', rows[0].id, { name, size: bytes.length });
        return rows[0];
      });
      return reply.status(201).send(camel(row));
    },
  );

  app.patch(
    '/cms/media/:id',
    {
      schema: {
        tags,
        summary: 'Altera o texto alternativo',
        params: idParams,
        body: { type: 'object', required: ['alt'], additionalProperties: false, properties: { alt: { type: 'string', maxLength: 300 } } },
      },
    },
    async (req) => {
      requireRole(req, 'editor');
      const { id } = req.params as { id: number };
      const { alt } = req.body as { alt: string };
      return tx(app.pool, async (c) => {
        const { rows } = await c.query(`update cms_media set alt = $1 where id = $2 returning ${COLUMNS}`, [alt.trim(), id]);
        if (!rows[0]) throw notFound('Imagem');
        await audit(c, req.actor, 'cms.media.update', 'cms_media', id, {});
        return camel(rows[0]);
      });
    },
  );

  app.get('/cms/media/:id/usage', { schema: { tags, summary: 'Conteúdos que usam a imagem', params: idParams } }, async (req) => {
    requireRole(req, 'editor');
    const { rows } = await app.pool.query('select key from cms_media where id = $1', [(req.params as { id: number }).id]);
    if (!rows[0]) throw notFound('Imagem');
    return usage(app, rows[0].key);
  });

  app.delete('/cms/media/:id', { schema: { tags, summary: 'Apaga (recusa se estiver a ser usada)', params: idParams } }, async (req, reply) => {
    requireRole(req, 'editor');
    const { id } = req.params as { id: number };
    const { rows } = await app.pool.query('select key, name from cms_media where id = $1', [id]);
    if (!rows[0]) throw notFound('Imagem');
    const used = await usage(app, rows[0].key);
    if (used.length) throw new HttpError(409, 'in_use', `A imagem está a ser usada em: ${used.map((u) => u.title).join(', ')}`);
    await tx(app.pool, async (c) => {
      await c.query('delete from cms_media where id = $1', [id]);
      await audit(c, req.actor, 'cms.media.delete', 'cms_media', id, { name: rows[0].name });
    });
    return reply.status(204).send();
  });

  // Público (o middleware serve a imagem ao site): só pelo endereço aleatório, sem listagem
  app.get(
    '/media/:key',
    {
      schema: {
        tags,
        summary: 'Conteúdo de uma imagem (base64)',
        params: { type: 'object', properties: { key: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } } },
      },
    },
    async (req) => {
      const { rows } = await app.pool.query('select mime, data from cms_media where key = $1', [(req.params as { key: string }).key]);
      if (!rows[0]) throw notFound('Imagem');
      return { mime: rows[0].mime, data: (rows[0].data as Buffer).toString('base64') };
    },
  );
}
