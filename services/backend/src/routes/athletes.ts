import type { FastifyInstance, FastifyRequest } from 'fastify';
import { tx } from '../../../shared/db.ts';
import { currentSeason, isValidIdNumber, isValidNif, isValidPhone } from '../../../shared/validation.ts';
import { audit, camel, forbidden, hasRole, HttpError, notFound, requireRole, requireUser, snake } from '../core.ts';

/** Campos que o encarregado/atleta pode alterar diretamente. */
const EDITABLE = {
  email: { type: 'string', format: 'email', maxLength: 200 },
  phone: { type: 'string', maxLength: 20 },
  address: { type: 'string', maxLength: 300 },
  postalCode: { type: 'string', pattern: '^\\d{4}-\\d{3}$' },
  city: { type: 'string', maxLength: 100 },
  idExpiry: { type: 'string', format: 'date' },
  shirtSize: { type: 'string', maxLength: 5 },
  shirtType: { type: ['string', 'null'], enum: ['Normal', 'Alças', null] },
  emergencyName: { type: 'string', maxLength: 120 },
  emergencyPhone: { type: 'string', maxLength: 20 },
  consentRgpd: { type: 'boolean' },
  consentImage: { type: 'boolean' },
} as const;

/** Dados de identificação: só mudam por pedido validado pela secretaria. */
const IDENTITY = {
  name: { type: 'string', minLength: 3, maxLength: 160 },
  birthDate: { type: 'string', format: 'date' },
  gender: { type: 'string', enum: ['Feminino', 'Masculino'] },
  idNumber: { type: 'string' },
  taxNumber: { type: 'string' },
} as const;

/** Campos que o treinador não vê (minimização de dados). */
const SENSITIVE = ['idNumber', 'idExpiry', 'taxNumber', 'address', 'postalCode'];

const idParams = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

type Access = 'staff' | 'treinador' | 'encarregado' | 'co-encarregado' | 'atleta';

/** Relação de quem pede com o atleta (null = sem acesso). */
async function accessOf(app: FastifyInstance, req: FastifyRequest, athleteId: string): Promise<Access | null> {
  if (hasRole(req, 'secretaria')) return 'staff';
  if (req.actor.id) {
    const { rows } = await app.pool.query('select role from athlete_access where user_id = $1 and athlete_id = $2', [req.actor.id, athleteId]);
    if (rows[0]) return rows[0].role;
  }
  return req.actor.roles.includes('treinador') ? 'treinador' : null;
}

async function requireAccess(app: FastifyInstance, req: FastifyRequest, id: string, write = false) {
  const access = await accessOf(app, req, id);
  if (!access || (write && access === 'treinador')) throw forbidden();
  return access;
}

function missingFields(a: Record<string, unknown>) {
  const has = (k: string) => a[k] !== null && a[k] !== undefined && a[k] !== '';
  const req: [boolean, string][] = [
    [has('gender'), 'Género'],
    [has('idNumber'), 'N.º CC'],
    [has('taxNumber'), 'NIF'],
    [has('email'), 'Email'],
    [has('phone'), 'Telemóvel'],
    [has('address') && has('postalCode') && has('city'), 'Morada'],
    [has('shirtSize'), 'Tamanho da t-shirt'],
    [has('emergencyName') && has('emergencyPhone'), 'Contacto de emergência'],
    [a['consentRgpd'] === true, 'Consentimento RGPD'],
  ];
  return req.filter(([ok]) => !ok).map(([, l]) => l);
}

export async function athleteRoutes(app: FastifyInstance) {
  const tags = ['Atletas'];

  app.get(
    '/athletes',
    {
      schema: {
        tags,
        summary: 'Atletas: os acessíveis pelo utilizador, ou todos (staff com scope=all)',
        querystring: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['mine', 'all'], default: 'mine' },
            q: { type: 'string', maxLength: 100 },
            sport: { type: 'string', maxLength: 40 },
            pending: { type: 'string', enum: ['docs', 'confirm', 'requests'] },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as { scope: string; q?: string; sport?: string; pending?: string };
      const args: unknown[] = [];
      const where: string[] = [];
      if (q.scope === 'all') {
        requireRole(req, 'secretaria', 'treinador');
      } else {
        args.push(requireUser(req));
        where.push(`a.id in (select athlete_id from athlete_access where user_id = $${args.length})`);
      }
      if (q.q) {
        args.push(`%${q.q}%`);
        where.push(`(a.name ilike $${args.length} or a.code ilike $${args.length})`);
      }
      if (q.sport) {
        args.push(q.sport);
        where.push(`a.sport_slug = $${args.length}`);
      }
      args.push(currentSeason().start);
      const seasonArg = `$${args.length}`;
      if (q.pending === 'docs') where.push(`exists (select 1 from athlete_documents d where d.athlete_id = a.id and d.status in ('Em análise', 'Rejeitado', 'Em falta'))`);
      if (q.pending === 'confirm') where.push(`(a.confirmed_at is null or a.confirmed_at < ${seasonArg}::date)`);
      if (q.pending === 'requests') where.push(`exists (select 1 from athlete_change_requests r where r.athlete_id = a.id and r.status = 'pendente')`);
      const { rows } = await app.pool.query(
        `select a.id, a.code, a.name, a.birth_date, a.sport_slug, a.category, a.confirmed_at,
           (a.confirmed_at is not null and a.confirmed_at >= ${seasonArg}::date) as confirmed,
           (select count(*)::int from athlete_documents d where d.athlete_id = a.id and d.status = 'Aprovado') as docs_approved,
           (select count(*)::int from athlete_documents d where d.athlete_id = a.id) as docs_total,
           (select count(*)::int from athlete_documents d where d.athlete_id = a.id and d.status = 'Em análise') as docs_to_review,
           (select count(*)::int from athlete_change_requests r where r.athlete_id = a.id and r.status = 'pendente') as pending_requests
         from athletes a ${where.length ? 'where ' + where.join(' and ') : ''} order by a.name`,
        args,
      );
      return rows.map((r) => camel(r));
    },
  );

  app.get('/athletes/:id', { schema: { tags, summary: 'Ficha do atleta, documentos e pedidos pendentes', params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    const access = await requireAccess(app, req, id);
    const { rows } = await app.pool.query('select * from athletes where id = $1', [id]);
    if (!rows[0]) throw notFound('Atleta');
    const athlete = camel(rows[0]);
    if (access === 'treinador') for (const k of SENSITIVE) delete athlete[k];
    const docs = await app.pool.query('select id, kind, status, note, updated_at from athlete_documents where athlete_id = $1 order by id', [id]);
    const reqs = await app.pool.query("select id, changes, status, note, requested_at from athlete_change_requests where athlete_id = $1 and status = 'pendente' order by requested_at", [id]);
    const season = currentSeason();
    return {
      ...athlete,
      access,
      season: season.label,
      confirmed: !!athlete['confirmedAt'] && String(athlete['confirmedAt']) >= season.start,
      missing: missingFields(athlete),
      documents: docs.rows.map((r) => camel(r)),
      pendingRequests: reqs.rows.map((r) => camel(r)),
    };
  });

  app.patch(
    '/athletes/:id',
    { schema: { tags, summary: 'Altera contactos, emergência, equipamento e consentimentos', params: idParams, body: { type: 'object', minProperties: 1, properties: EDITABLE, additionalProperties: false } } },
    async (req) => {
      const { id } = req.params as { id: string };
      await requireAccess(app, req, id, true);
      const data = req.body as Record<string, unknown>;
      if (typeof data['phone'] === 'string' && data['phone'] && !isValidPhone(data['phone'])) throw new HttpError(400, 'invalid_phone', 'Telemóvel inválido');
      if (typeof data['emergencyPhone'] === 'string' && data['emergencyPhone'] && !isValidPhone(data['emergencyPhone'])) throw new HttpError(400, 'invalid_phone', 'Telefone de emergência inválido');
      const keys = Object.keys(data);
      return tx(app.pool, async (c) => {
        const { rows } = await c.query(`update athletes set ${keys.map((k, i) => `${snake(k)} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning *`, [...keys.map((k) => data[k]), id]);
        if (!rows[0]) throw notFound('Atleta');
        await audit(c, req.actor, 'athletes.update', 'athletes', id, { fields: keys });
        return camel(rows[0]);
      });
    },
  );

  app.post('/athletes/:id/confirm', { schema: { tags, summary: 'Confirma a ficha para a época em curso', params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    await requireAccess(app, req, id, true);
    const { rows } = await app.pool.query('select * from athletes where id = $1', [id]);
    if (!rows[0]) throw notFound('Atleta');
    const missing = missingFields(camel(rows[0]));
    if (missing.length) throw new HttpError(422, 'incomplete', `Ficha incompleta: ${missing.join(', ')}`);
    await tx(app.pool, async (c) => {
      await c.query('update athletes set confirmed_at = current_date where id = $1', [id]);
      await audit(c, req.actor, 'athletes.confirm', 'athletes', id, { season: currentSeason().label });
    });
    return { id, confirmedAt: new Date().toISOString().slice(0, 10), season: currentSeason().label };
  });

  app.post(
    '/athletes/:id/change-requests',
    { schema: { tags, summary: 'Pede alteração de dados de identificação (validação pela secretaria)', params: idParams, body: { type: 'object', required: ['changes'], properties: { changes: { type: 'object', minProperties: 1, properties: IDENTITY, additionalProperties: false } } } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await requireAccess(app, req, id, true);
      const { changes } = req.body as { changes: Record<string, string> };
      if (changes['taxNumber'] && !isValidNif(changes['taxNumber'])) throw new HttpError(400, 'invalid_nif', 'NIF inválido');
      if (changes['idNumber'] && !isValidIdNumber(changes['idNumber'])) throw new HttpError(400, 'invalid_id_number', 'N.º de CC inválido');
      const created = await tx(app.pool, async (c) => {
        const { rows } = await c.query('insert into athlete_change_requests (athlete_id, requested_by, changes) values ($1, $2, $3) returning *', [id, req.actor.id, changes]);
        await audit(c, req.actor, 'athletes.change_request', 'athletes', id, { fields: Object.keys(changes) });
        return camel(rows[0]);
      });
      return reply.status(201).send(created);
    },
  );

  app.get('/athletes/:id/results', { schema: { tags, summary: 'Resultados no Troféu de Almada', params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    await requireAccess(app, req, id);
    const { rows } = await app.pool.query(
      `select r.id, ra.season, ra.round, ra.name as race, ra.base_name as race_base, ra.race_date as date, r.category, r.place, r.time, r.time_s,
              r.distance_m, r.trophy_points
         from results r join races ra on ra.id = r.race_id where r.athlete_id = $1 order by ra.race_date desc`,
      [id],
    );
    return rows.map((r) => camel(r));
  });

  // ------------------------------------------------------------- backoffice: pedidos e documentos
  app.get(
    '/change-requests',
    { schema: { tags: ['Backoffice · Atletas'], summary: 'Pedidos de alteração (secretaria)', querystring: { type: 'object', properties: { status: { type: 'string', enum: ['pendente', 'aprovado', 'rejeitado'], default: 'pendente' } } } } },
    async (req) => {
      requireRole(req, 'secretaria');
      const { rows } = await app.pool.query(
        `select r.id, r.athlete_id, a.name as athlete_name, a.code as athlete_code, r.changes, r.status, r.note, r.requested_at, u.name as requested_by,
                json_build_object('name', a.name, 'birthDate', a.birth_date, 'gender', a.gender, 'idNumber', a.id_number, 'taxNumber', a.tax_number) as current
           from athlete_change_requests r join athletes a on a.id = r.athlete_id left join users u on u.id = r.requested_by
          where r.status = $1 order by r.requested_at`,
        [(req.query as { status: string }).status],
      );
      return rows.map((r) => camel(r));
    },
  );

  const reqParams = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } as const;

  app.post('/change-requests/:id/approve', { schema: { tags: ['Backoffice · Atletas'], summary: 'Aprova e aplica a alteração', params: reqParams } }, async (req) => {
    requireRole(req, 'secretaria');
    const { id } = req.params as { id: number };
    return tx(app.pool, async (c) => {
      const { rows } = await c.query("select * from athlete_change_requests where id = $1 and status = 'pendente' for update", [id]);
      if (!rows[0]) throw notFound('Pedido pendente');
      const changes = rows[0].changes as Record<string, unknown>;
      const keys = Object.keys(changes).filter((k) => k in IDENTITY);
      // Única via autorizada para mudar dados de identificação (ver trigger protect_identity)
      await c.query("select set_config('app.identity_change', 'on', true)");
      await c.query(`update athletes set ${keys.map((k, i) => `${snake(k)} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, [...keys.map((k) => changes[k]), rows[0].athlete_id]);
      await c.query("update athlete_change_requests set status = 'aprovado', reviewed_by = $1, reviewed_at = now() where id = $2", [req.actor.id, id]);
      await audit(c, req.actor, 'change_requests.approve', 'athletes', rows[0].athlete_id, { request: id, fields: keys });
      return { id, status: 'aprovado' };
    });
  });

  app.post(
    '/change-requests/:id/reject',
    { schema: { tags: ['Backoffice · Atletas'], summary: 'Rejeita com motivo', params: reqParams, body: { type: 'object', required: ['note'], properties: { note: { type: 'string', minLength: 3, maxLength: 500 } } } } },
    async (req) => {
      requireRole(req, 'secretaria');
      const { id } = req.params as { id: number };
      const { note } = req.body as { note: string };
      return tx(app.pool, async (c) => {
        const { rows } = await c.query("update athlete_change_requests set status = 'rejeitado', note = $1, reviewed_by = $2, reviewed_at = now() where id = $3 and status = 'pendente' returning athlete_id", [note, req.actor.id, id]);
        if (!rows[0]) throw notFound('Pedido pendente');
        await audit(c, req.actor, 'change_requests.reject', 'athletes', rows[0].athlete_id, { request: id, note });
        return { id, status: 'rejeitado' };
      });
    },
  );

  app.get(
    '/documents',
    { schema: { tags: ['Backoffice · Atletas'], summary: 'Documentos de inscrição por estado', querystring: { type: 'object', properties: { status: { type: 'string', enum: ['Em análise', 'Rejeitado', 'Em falta', 'Aprovado'], default: 'Em análise' } } } } },
    async (req) => {
      requireRole(req, 'secretaria');
      const { rows } = await app.pool.query(
        `select d.id, d.kind, d.status, d.note, d.updated_at, d.athlete_id, a.name as athlete_name, a.code as athlete_code
           from athlete_documents d join athletes a on a.id = d.athlete_id where d.status = $1 order by d.updated_at`,
        [(req.query as { status: string }).status],
      );
      return rows.map((r) => camel(r));
    },
  );

  for (const [action, status] of [
    ['approve', 'Aprovado'],
    ['reject', 'Rejeitado'],
  ] as const) {
    app.post(
      `/documents/:id/${action}`,
      {
        schema: {
          tags: ['Backoffice · Atletas'],
          summary: action === 'approve' ? 'Aprova documento' : 'Rejeita documento (motivo obrigatório)',
          params: reqParams,
          body: action === 'reject' ? { type: 'object', required: ['note'], properties: { note: { type: 'string', minLength: 3, maxLength: 300 } } } : { type: 'object' },
        },
      },
      async (req) => {
        requireRole(req, 'secretaria');
        const { id } = req.params as { id: number };
        const note = action === 'reject' ? (req.body as { note: string }).note : null;
        return tx(app.pool, async (c) => {
          const { rows } = await c.query('update athlete_documents set status = $1, note = $2, updated_at = now() where id = $3 returning athlete_id, kind', [status, note, id]);
          if (!rows[0]) throw notFound('Documento');
          await audit(c, req.actor, `documents.${action}`, 'athletes', rows[0].athlete_id, { document: id, kind: rows[0].kind, note });
          return { id, status, note };
        });
      },
    );
  }
}

