import type { FastifyInstance, FastifyRequest } from 'fastify';
import { tx, type Client } from '../../../shared/db.ts';
import { audit, camel, hasRole, HttpError, notFound, requireRole, snake } from '../core.ts';
import { sanitizeBody } from '../../../shared/html.ts';

/**
 * CMS — conteúdos editados no backoffice.
 * Fluxo editorial: rascunho → publicado (→ arquivado). Cada gravação cria uma
 * revisão completa em cms_revisions, que pode ser reposta.
 */

type Field = { type: 'string' | 'integer' | 'number' | 'boolean'; nullable?: boolean; required?: boolean; maxLength?: number; enum?: string[]; pattern?: string; minimum?: number };

const SLUG = { type: 'string', required: true, maxLength: 120, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' } as const;
const TEXT = { type: 'string', maxLength: 200000 } as const;
// Imagem de capa: da biblioteca de imagens (/api/v1/media/…) ou um endereço https
const COVER = { type: 'string', nullable: true, maxLength: 500, pattern: '^((https://|/api/v1/media/)[^\\s"<>]+)?$' } as const;

export const CMS_TYPES = {
  news: {
    table: 'cms_news',
    label: 'Notícias',
    order: 'coalesce(published_at, updated_at) desc',
    search: ['title', 'summary'],
    fields: {
      slug: SLUG,
      title: { type: 'string', required: true, maxLength: 200 },
      category: { type: 'string', required: true, enum: ['Clube', 'Atletismo', 'Futsal', 'Rugby', 'Formação', 'Comunidade', 'Eventos', 'Parceiros', 'Comunicados'] },
      summary: { type: 'string', maxLength: 400 },
      body: TEXT,
      coverUrl: COVER,
      author: { type: 'string', maxLength: 120 },
    },
  },
  events: {
    table: 'cms_events',
    label: 'Eventos',
    order: 'starts_at desc',
    search: ['title', 'summary', 'location'],
    fields: {
      slug: SLUG,
      title: { type: 'string', required: true, maxLength: 200 },
      kind: { type: 'string', required: true, enum: ['Torneio', 'Caminhada', 'Corrida', 'Solidário', 'Convívio', 'Crianças'] },
      sportSlug: { type: 'string', nullable: true, enum: ['atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto'] },
      summary: { type: 'string', maxLength: 400 },
      body: TEXT,
      coverUrl: COVER,
      startsAt: { type: 'string', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' },
      endTime: { type: 'string', nullable: true, pattern: '^\\d{2}:\\d{2}$' },
      location: { type: 'string', required: true, maxLength: 200 },
      capacity: { type: 'integer', minimum: 0 },
      price: { type: 'number', minimum: 0 },
      memberPrice: { type: 'number', nullable: true, minimum: 0 },
      registrationRequired: { type: 'boolean' },
      askShirtSize: { type: 'boolean' },
    },
  },
  pages: {
    table: 'cms_pages',
    label: 'Páginas',
    order: 'title',
    search: ['title', 'summary'],
    fields: {
      slug: SLUG,
      title: { type: 'string', required: true, maxLength: 200 },
      summary: { type: 'string', maxLength: 400 },
      body: TEXT,
    },
  },
  partners: {
    table: 'cms_partners',
    label: 'Parceiros',
    order: 'name',
    search: ['name', 'description'],
    fields: {
      slug: SLUG,
      name: { type: 'string', required: true, maxLength: 200 },
      category: { type: 'string', required: true, enum: ['Patrocinador Principal', 'Patrocinador', 'Parceiro', 'Parceiro Institucional'] },
      website: { type: 'string', nullable: true, maxLength: 300, pattern: '^(https?://.+)?$' },
      description: { type: 'string', maxLength: 2000 },
    },
  },
} satisfies Record<string, { table: string; label: string; order: string; search: string[]; fields: Record<string, Field> }>;

export type CmsType = keyof typeof CMS_TYPES;
const STATUS = ['draft', 'published', 'archived'] as const;

function bodySchema(fields: Record<string, Field>) {
  const properties: Record<string, object> = {};
  for (const [k, f] of Object.entries(fields)) {
    const { required: _r, nullable, ...rest } = f;
    properties[k] = nullable ? { ...rest, type: [f.type, 'null'] } : rest;
  }
  return {
    type: 'object',
    required: Object.entries(fields).filter(([, f]) => f.required).map(([k]) => k),
    properties,
    additionalProperties: false,
  };
}

const idParams = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } as const;

/** Leitura de rascunhos/arquivados e escrita: editor ou admin. */
const canEdit = (req: FastifyRequest) => hasRole(req, 'editor');

async function load(c: Client | FastifyInstance['pool'], table: string, id: number) {
  const { rows } = await c.query(`select * from ${table} where id = $1`, [id]);
  return rows[0] ? camel(rows[0]) : null;
}

async function revision(c: Client, type: CmsType, entry: Record<string, unknown>, actorId: string | null) {
  await c.query('insert into cms_revisions (type, entry_id, data, author_id) values ($1, $2, $3, $4)', [type, entry['id'], entry, actorId]);
}

export async function cmsRoutes(app: FastifyInstance) {
  for (const [type, def] of Object.entries(CMS_TYPES) as [CmsType, (typeof CMS_TYPES)[CmsType]][]) {
    const base = `/cms/${type}`;
    const tags = [`CMS · ${def.label}`];
    const fields = def.fields as Record<string, Field>;
    const columns = Object.keys(fields);
    const body = bodySchema(fields);

    app.get(
      base,
      {
        schema: {
          tags,
          summary: `Lista de ${def.label.toLowerCase()} (público vê só publicados)`,
          querystring: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: [...STATUS] },
              q: { type: 'string', maxLength: 100 },
              limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
              offset: { type: 'integer', minimum: 0, default: 0 },
            },
          },
        },
      },
      async (req) => {
        const q = req.query as { status?: string; q?: string; limit: number; offset: number };
        const status = canEdit(req) ? q.status : 'published';
        const where: string[] = [];
        const args: unknown[] = [];
        if (status) {
          args.push(status);
          where.push(`status = $${args.length}`);
        }
        if (q.q) {
          args.push(`%${q.q}%`);
          where.push('(' + def.search.map((col) => `${col} ilike $${args.length}`).join(' or ') + ')');
        }
        const w = where.length ? 'where ' + where.join(' and ') : '';
        const total = (await app.pool.query(`select count(*)::int as n from ${def.table} ${w}`, args)).rows[0].n;
        args.push(q.limit, q.offset);
        const { rows } = await app.pool.query(`select * from ${def.table} ${w} order by ${def.order} limit $${args.length - 1} offset $${args.length}`, args);
        return { items: rows.map((r) => camel(r)), total };
      },
    );

    app.get(`${base}/:id`, { schema: { tags, summary: 'Detalhe por id', params: idParams } }, async (req) => {
      const entry = await load(app.pool, def.table, (req.params as { id: number }).id);
      if (!entry || (entry['status'] !== 'published' && !canEdit(req))) throw notFound('Conteúdo');
      return entry;
    });

    app.get(
      `${base}/slug/:slug`,
      { schema: { tags, summary: 'Detalhe por slug (público: só publicado)', params: { type: 'object', properties: { slug: { type: 'string', maxLength: 120 } } } } },
      async (req) => {
        const { rows } = await app.pool.query(`select * from ${def.table} where slug = $1`, [(req.params as { slug: string }).slug]);
        if (!rows[0] || (rows[0].status !== 'published' && !canEdit(req))) throw notFound('Conteúdo');
        return camel(rows[0]);
      },
    );

    app.post(base, { schema: { tags, summary: 'Cria um rascunho', body } }, async (req, reply) => {
      requireRole(req, 'editor');
      const data = clean(req.body as Record<string, unknown>);
      const keys = columns.filter((k) => k in data);
      const entry = await tx(app.pool, async (c) => {
        const { rows } = await c.query(
          `insert into ${def.table} (${[...keys.map(snake), 'updated_by'].join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}) returning *`,
          [...keys.map((k) => data[k]), req.actor.id],
        );
        const e = camel(rows[0]);
        await revision(c, type, e, req.actor.id);
        await audit(c, req.actor, `cms.${type}.create`, def.table, e['id'] as number, { slug: e['slug'] });
        return e;
      });
      return reply.status(201).send(entry);
    });

    app.put(`${base}/:id`, { schema: { tags, summary: 'Atualiza (cria revisão)', params: idParams, body } }, async (req) => {
      requireRole(req, 'editor');
      const id = (req.params as { id: number }).id;
      const data = clean(req.body as Record<string, unknown>);
      return tx(app.pool, async (c) => {
        // Campos omitidos voltam ao valor por omissão (PUT = substituição completa dos campos editáveis)
        const sets = columns.map((k, i) => `${snake(k)} = $${i + 1}`);
        const { rows } = await c.query(
          `update ${def.table} set ${sets.join(', ')}, updated_at = now(), updated_by = $${columns.length + 1} where id = $${columns.length + 2} returning *`,
          [...columns.map((k) => (k in data ? data[k] : defaultFor(fields[k]))), req.actor.id, id],
        );
        if (!rows[0]) throw notFound('Conteúdo');
        const e = camel(rows[0]);
        await revision(c, type, e, req.actor.id);
        await audit(c, req.actor, `cms.${type}.update`, def.table, id, { slug: e['slug'] });
        return e;
      });
    });

    for (const [action, status] of [
      ['publish', 'published'],
      ['unpublish', 'draft'],
      ['archive', 'archived'],
    ] as const) {
      app.post(`${base}/:id/${action}`, { schema: { tags, summary: { publish: 'Publica', unpublish: 'Volta a rascunho', archive: 'Arquiva' }[action], params: idParams } }, async (req) => {
        requireRole(req, 'editor');
        const id = (req.params as { id: number }).id;
        return tx(app.pool, async (c) => {
          const { rows } = await c.query(
            `update ${def.table} set status = $1, published_at = case when $1 = 'published' then coalesce(published_at, now()) else published_at end,
               updated_at = now(), updated_by = $2 where id = $3 returning *`,
            [status, req.actor.id, id],
          );
          if (!rows[0]) throw notFound('Conteúdo');
          await audit(c, req.actor, `cms.${type}.${action}`, def.table, id, { slug: rows[0].slug });
          return camel(rows[0]);
        });
      });
    }

    app.delete(`${base}/:id`, { schema: { tags, summary: 'Apaga (fica no histórico de auditoria)', params: idParams } }, async (req, reply) => {
      requireRole(req, 'editor');
      const id = (req.params as { id: number }).id;
      await tx(app.pool, async (c) => {
        const { rows } = await c.query(`delete from ${def.table} where id = $1 returning slug`, [id]);
        if (!rows[0]) throw notFound('Conteúdo');
        await audit(c, req.actor, `cms.${type}.delete`, def.table, id, { slug: rows[0].slug });
      });
      return reply.status(204).send();
    });

    app.get(`${base}/:id/revisions`, { schema: { tags, summary: 'Histórico de versões', params: idParams } }, async (req) => {
      requireRole(req, 'editor');
      const { rows } = await app.pool.query(
        `select r.id, r.created_at, u.name as author, r.data->>'status' as status, coalesce(r.data->>'title', r.data->>'name') as title
           from cms_revisions r left join users u on u.id = r.author_id
          where r.type = $1 and r.entry_id = $2 order by r.created_at desc, r.id desc limit 50`,
        [type, (req.params as { id: number }).id],
      );
      return rows.map((r) => camel(r));
    });

    app.post(
      `${base}/:id/revisions/:rev/restore`,
      { schema: { tags, summary: 'Repõe uma versão anterior (como nova revisão)', params: { type: 'object', properties: { id: { type: 'integer' }, rev: { type: 'integer' } } } } },
      async (req) => {
        requireRole(req, 'editor');
        const { id, rev } = req.params as { id: number; rev: number };
        return tx(app.pool, async (c) => {
          const r = await c.query('select data from cms_revisions where id = $1 and type = $2 and entry_id = $3', [rev, type, id]);
          if (!r.rows[0]) throw notFound('Versão');
          const old = r.rows[0].data as Record<string, unknown>;
          const sets = columns.map((k, i) => `${snake(k)} = $${i + 1}`);
          const { rows } = await c.query(
            `update ${def.table} set ${sets.join(', ')}, updated_at = now(), updated_by = $${columns.length + 1} where id = $${columns.length + 2} returning *`,
            [...columns.map((k) => old[k] ?? defaultFor(fields[k])), req.actor.id, id],
          );
          if (!rows[0]) throw notFound('Conteúdo');
          const e = camel(rows[0]);
          await revision(c, type, e, req.actor.id);
          await audit(c, req.actor, `cms.${type}.restore`, def.table, id, { revision: rev });
          return e;
        });
      },
    );
  }

  // Erro claro para tipos desconhecidos (em vez de 404 genérico)
  app.all('/cms/:type', { schema: { hide: true } }, async () => {
    throw new HttpError(404, 'unknown_type', `Tipo de conteúdo desconhecido. Tipos: ${Object.keys(CMS_TYPES).join(', ')}`);
  });
}

/** O HTML do editor é limpo antes de ser gravado (sem scripts, estilos nem atributos de eventos). */
function clean(data: Record<string, unknown>) {
  return typeof data['body'] === 'string' ? { ...data, body: sanitizeBody(data['body']) } : data;
}

function defaultFor(f: Field) {
  if (f.nullable) return null;
  return f.type === 'boolean' ? false : f.type === 'integer' || f.type === 'number' ? 0 : '';
}
