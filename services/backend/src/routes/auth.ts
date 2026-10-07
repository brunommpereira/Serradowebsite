import type { FastifyInstance } from 'fastify';
import { DUMMY_HASH, verifyPassword } from '../../../shared/password.ts';
import { ROLES } from '../../../shared/config.ts';
import { tx } from '../../../shared/db.ts';
import { audit, forbidden, notFound, requireRole } from '../core.ts';

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
