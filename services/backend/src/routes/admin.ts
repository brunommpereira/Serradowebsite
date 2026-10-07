import type { FastifyInstance } from 'fastify';
import { currentSeason } from '../../../shared/validation.ts';
import { camel, hasRole, requireRole } from '../core.ts';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/stats', { schema: { tags: ['Gestão'], summary: 'Indicadores do backoffice (contagens)' } }, async (req) => {
    requireRole(req, 'editor', 'secretaria', 'treinador');
    const { rows } = await app.pool.query(
      `select
         (select count(*)::int from cms_news where status = 'published') as news_published,
         (select count(*)::int from cms_news where status = 'draft') as news_drafts,
         (select count(*)::int from cms_events where status = 'published' and starts_at >= now()) as events_upcoming,
         (select count(*)::int from cms_pages where status = 'draft') + (select count(*)::int from cms_events where status = 'draft')
           + (select count(*)::int from cms_partners where status = 'draft') as other_drafts,
         (select count(*)::int from athletes) as athletes,
         (select count(*)::int from athletes where confirmed_at is null or confirmed_at < $1::date) as athletes_to_confirm,
         (select count(*)::int from athlete_documents where status = 'Em análise') as documents_to_review,
         (select count(*)::int from athlete_change_requests where status = 'pendente') as change_requests,
         (select count(*)::int from members where status = 'Ativo') as members_active,
         (select count(*)::int from results) as results`,
      [currentSeason().start],
    );
    return { ...camel<Record<string, unknown>>(rows[0]), season: currentSeason().label };
  });

  app.get(
    '/audit',
    { schema: { tags: ['Gestão'], summary: 'Registo de auditoria (admin; restantes staff veem o próprio)', querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 } } } } },
    async (req) => {
      requireRole(req, 'editor', 'secretaria', 'treinador');
      const all = hasRole(req); // só admin (hasRole sem papéis extra = admin)
      const { rows } = await app.pool.query(
        `select l.id, l.at, l.action, l.entity, l.entity_id, l.details, u.name as actor
           from audit_log l left join users u on u.id = l.actor_id
          ${all ? '' : 'where l.actor_id = $2'} order by l.at desc, l.id desc limit $1`,
        all ? [(req.query as { limit: number }).limit] : [(req.query as { limit: number }).limit, req.actor.id],
      );
      return rows.map((r) => camel(r));
    },
  );
}
