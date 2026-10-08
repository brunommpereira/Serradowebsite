import type { FastifyInstance } from 'fastify';
import { DUMMY_HASH, verifyPassword } from '../../../shared/password.ts';
import { ROLES } from '../../../shared/config.ts';
import { tx } from '../../../shared/db.ts';
import { audit, forbidden, HttpError, notFound, requireRole } from '../core.ts';

const user = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    member: {
      type: ['object', 'null'],
      properties: { memberNumber: { type: 'string' }, category: { type: 'string' }, status: { type: 'string' }, joinedOn: { type: 'string' } },
    },
    athletes: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } } },
    },
  },
} as const;

/** Perfil completo de um utilizador: papéis, sócio (opcional) e atletas a que tem acesso. */
export async function loadProfile(app: FastifyInstance, id: string) {
  const { rows } = await app.pool.query(
    `select u.id, u.email, u.name,
       coalesce((select array_agg(role order by role) from user_roles where user_id = u.id), '{}') as roles,
       (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status, 'joinedOn', m.joined_on)
          from members m where m.user_id = u.id) as member,
       coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'role', aa.role) order by a.name)
          from athlete_access aa join athletes a on a.id = aa.athlete_id where aa.user_id = u.id), '[]') as athletes
     from users u where u.id = $1 and not u.disabled`,
    [id],
  );
  return rows[0] ?? null;
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/verify',
    {
      schema: {
        tags: ['Sessão'],
        summary: 'Valida credenciais (email ou n.º de sócio + password)',
        body: { type: 'object', required: ['login', 'password'], properties: { login: { type: 'string', minLength: 1, maxLength: 200 }, password: { type: 'string', minLength: 1, maxLength: 200 } } },
        response: { 200: user, 401: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } } },
      },
    },
    async (req, reply) => {
      const { login, password } = req.body as { login: string; password: string };
      const id = login.trim().toLowerCase();
      const number = /^\d+$/.test(id) ? id.padStart(5, '0') : null;
      const { rows } = await app.pool.query(
        `select u.id, u.password_hash from users u left join members m on m.user_id = u.id
          where not u.disabled and (u.email = $1 or m.member_number = $2) limit 1`,
        [id, number],
      );
      // Mesmo trabalho com ou sem conta: não revela se o email existe
      const ok = await verifyPassword(password, rows[0]?.password_hash ?? DUMMY_HASH);
      if (!rows[0] || !ok) return reply.status(401).send({ error: 'invalid_credentials', message: 'Credenciais inválidas' });
      await app.pool.query('update users set last_login_at = now() where id = $1', [rows[0].id]);
      return loadProfile(app, rows[0].id);
    },
  );

  app.post(
    '/auth/oauth',
    {
      schema: {
        tags: ['Sessão'],
        summary: 'Entrada com uma conta externa (Google, Microsoft…) já validada pelo middleware',
        description:
          'Procura a conta ligada a (provider, subject). Na primeira vez, liga-a à conta do clube com o mesmo email, ' +
          'só se o fornecedor garantir que o email está verificado. Não cria contas novas.',
        body: {
          type: 'object',
          required: ['provider', 'subject', 'email', 'emailVerified'],
          properties: {
            provider: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' },
            subject: { type: 'string', minLength: 1, maxLength: 255 },
            email: { type: ['string', 'null'], maxLength: 200 },
            emailVerified: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        response: { 200: user },
      },
    },
    async (req) => {
      const { provider, subject, email, emailVerified } = req.body as { provider: string; subject: string; email: string | null; emailVerified: boolean };
      const userId = await tx(app.pool, async (c) => {
        const linked = await c.query('select i.user_id, u.disabled from user_identities i join users u on u.id = i.user_id where i.provider = $1 and i.subject = $2', [provider, subject]);
        if (linked.rows[0]) {
          if (linked.rows[0].disabled) return null;
          await c.query('update user_identities set last_used_at = now() where provider = $1 and subject = $2', [provider, subject]);
          return linked.rows[0].user_id as string;
        }
        // Primeira entrada com esta conta: só com email verificado pelo fornecedor e igual ao da conta do clube
        if (!emailVerified || !email) return null;
        const found = await c.query('select id from users where email = $1 and not disabled', [email.trim().toLowerCase()]);
        const id = found.rows[0]?.id as string | undefined;
        if (!id) return null;
        const other = await c.query('select 1 from user_identities where user_id = $1 and provider = $2', [id, provider]);
        if (other.rows[0]) throw new HttpError(409, 'other_identity_linked', 'Esta conta do clube já está ligada a outra conta deste fornecedor');
        await c.query('insert into user_identities (provider, subject, user_id, email, last_used_at) values ($1, $2, $3, $4, now())', [provider, subject, id, email.trim().toLowerCase()]);
        await audit(c, { id, roles: [] }, 'users.identity.link', 'users', id, { provider });
        return id;
      });
      // Mesma resposta para «não existe» e «desativada»: não revela que contas existem
      if (!userId) throw new HttpError(403, 'no_account', 'Não há nenhuma conta do clube associada a este email');
      await app.pool.query('update users set last_login_at = now() where id = $1', [userId]);
      return loadProfile(app, userId);
    },
  );

  const identityParams = { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, provider: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' } } } as const;

  app.get(
    '/users/:id/identities',
    {
      schema: {
        tags: ['Sessão'],
        summary: 'Contas externas ligadas (o próprio ou admin)',
        params: identityParams,
        response: { 200: { type: 'array', items: { type: 'object', properties: { provider: { type: 'string' }, email: { type: ['string', 'null'] }, linkedAt: { type: 'string' }, lastUsedAt: { type: ['string', 'null'] } } } } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      if (req.actor.id !== id && !req.actor.roles.includes('admin')) throw forbidden();
      const { rows } = await app.pool.query(
        `select provider, email, linked_at as "linkedAt", last_used_at as "lastUsedAt" from user_identities where user_id = $1 order by provider`,
        [id],
      );
      return rows;
    },
  );

  app.delete('/users/:id/identities/:provider', { schema: { tags: ['Sessão'], summary: 'Desligar uma conta externa (o próprio ou admin)', params: identityParams } }, async (req) => {
    const { id, provider } = req.params as { id: string; provider: string };
    if (req.actor.id !== id && !req.actor.roles.includes('admin')) throw forbidden();
    await tx(app.pool, async (c) => {
      const r = await c.query('delete from user_identities where user_id = $1 and provider = $2', [id, provider]);
      if (!r.rowCount) throw notFound('Ligação');
      await audit(c, req.actor, 'users.identity.unlink', 'users', id, { provider });
    });
    return { ok: true };
  });

  app.get('/users/:id', { schema: { tags: ['Sessão'], summary: 'Perfil de um utilizador', params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: user } } }, async (req) => {
    const { id } = req.params as { id: string };
    if (req.actor.id !== id && !req.actor.roles.includes('admin')) throw forbidden();
    const p = await loadProfile(app, id);
    if (!p) throw notFound('Utilizador');
    return p;
  });

  app.get('/users', { schema: { tags: ['Gestão'], summary: 'Lista de utilizadores (admin)', response: { 200: { type: 'array', items: user } } } }, async (req) => {
    requireRole(req, 'admin');
    const { rows } = await app.pool.query(
      `select u.id, u.email, u.name, coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles,
         (select json_build_object('memberNumber', m.member_number, 'category', m.category, 'status', m.status) from members m where m.user_id = u.id) as member,
         '[]'::json as athletes
       from users u left join user_roles r on r.user_id = u.id group by u.id order by u.name`,
    );
    return rows;
  });

  app.put(
    '/users/:id/roles',
    {
      schema: {
        tags: ['Gestão'],
        summary: 'Define os papéis de backoffice de um utilizador (admin)',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: { type: 'object', required: ['roles'], properties: { roles: { type: 'array', uniqueItems: true, items: { type: 'string', enum: [...ROLES] } } } },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const { id } = req.params as { id: string };
      const { roles } = req.body as { roles: string[] };
      if (id === req.actor.id && !roles.includes('admin')) throw forbidden(); // não remover o próprio acesso de admin
      await tx(app.pool, async (c) => {
        await c.query('delete from user_roles where user_id = $1', [id]);
        for (const r of roles) await c.query('insert into user_roles values ($1, $2)', [id, r]);
        await audit(c, req.actor, 'users.roles', 'users', id, { roles });
      });
      return { id, roles };
    },
  );
}
