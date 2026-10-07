import type { FastifyInstance, FastifyRequest } from 'fastify';
import { camel, forbidden, hasRole, notFound } from '../core.ts';

const params = { type: 'object', properties: { number: { type: 'string', pattern: '^\\d{1,8}$' } } } as const;

export async function memberRoutes(app: FastifyInstance) {
  const tags = ['Sócios'];

  /** O próprio sócio, ou a secretaria/admin. */
  async function check(req: FastifyRequest, number: string) {
    const { rows } = await app.pool.query('select * from members where member_number = $1', [number]);
    if (!rows[0]) throw notFound('Sócio');
    if (rows[0].user_id !== req.actor.id && !hasRole(req, 'secretaria')) throw forbidden();
    return rows[0];
  }

  app.get('/members/:number', { schema: { tags, summary: 'Dados de sócio', params } }, async (req) => {
    const m = await check(req, (req.params as { number: string }).number);
    return camel(m);
  });

  app.get('/members/:number/quotas', { schema: { tags, summary: 'Quotas e pagamentos', params } }, async (req) => {
    const { number } = req.params as { number: string };
    await check(req, number);
    const { rows } = await app.pool.query(
      `select id, period, amount, due_date, paid_at, payment_method, receipt_number,
              case when paid_at is not null then 'Pago' when due_date < current_date then 'Em atraso' else 'Pendente' end as status
         from quotas where member_number = $1 order by due_date desc`,
      [number],
    );
    return rows.map((r) => camel(r));
  });
}
