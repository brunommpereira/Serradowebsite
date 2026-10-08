import type { FastifyInstance } from 'fastify';
import { ApiError } from '../app.ts';

/** Área reservada (sócio, atleta, encarregado): sempre em nome do utilizador da sessão. */
export async function meRoutes(app: FastifyInstance) {
  const uuid = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } as const;

  app.get('/me', { schema: { tags: ['Sessão'], summary: 'Utilizador atual: papéis, sócio (opcional) e atletas acompanhados' } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('GET', `/users/${s.sub}`, { actor: s });
  });

  app.get('/me/identities', { schema: { tags: ['Sessão'], summary: 'Contas Google/Microsoft ligadas a esta conta' } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('GET', `/users/${s.sub}/identities`, { actor: s });
  });

  app.delete(
    '/me/identities/:provider',
    { schema: { tags: ['Sessão'], summary: 'Desligar uma conta Google/Microsoft', params: { type: 'object', properties: { provider: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' } } } } },
    async (req) => {
      const s = await app.session(req);
      return app.backend.call('DELETE', `/users/${s.sub}/identities/${(req.params as { provider: string }).provider}`, { actor: s });
    },
  );

  app.get('/me/member', { schema: { tags: ['Área de Sócio'], summary: 'Os meus dados de sócio' } }, async (req) => {
    const s = await app.session(req);
    const me = await app.backend.call<{ member: { memberNumber: string } | null }>('GET', `/users/${s.sub}`, { actor: s });
    if (!me.member) throw new ApiError(404, 'not_member', 'Esta conta não está associada a um sócio');
    return app.backend.call('GET', `/members/${me.member.memberNumber}`, { actor: s });
  });

  app.get('/me/quotas', { schema: { tags: ['Área de Sócio'], summary: 'As minhas quotas e pagamentos' } }, async (req) => {
    const s = await app.session(req);
    const me = await app.backend.call<{ member: { memberNumber: string } | null }>('GET', `/users/${s.sub}`, { actor: s });
    if (!me.member) throw new ApiError(404, 'not_member', 'Esta conta não está associada a um sócio');
    return app.backend.call('GET', `/members/${me.member.memberNumber}/quotas`, { actor: s });
  });

  const tags = ['Área de Atletas'];
  app.get('/me/athletes', { schema: { tags, summary: 'Os meus atletas (educandos e/ou o próprio)' } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('GET', '/athletes', { actor: s, query: { scope: 'mine' } });
  });

  app.get('/athletes/:id', { schema: { tags, summary: 'Ficha do atleta', params: uuid } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('GET', `/athletes/${(req.params as { id: string }).id}`, { actor: s });
  });

  app.patch('/athletes/:id', { schema: { tags, summary: 'Alterar contactos, emergência, equipamento, consentimentos', params: uuid, body: { type: 'object' } } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('PATCH', `/athletes/${(req.params as { id: string }).id}`, { actor: s, body: req.body });
  });

  app.post('/athletes/:id/confirm', { schema: { tags, summary: 'Confirmar a ficha da época', params: uuid } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('POST', `/athletes/${(req.params as { id: string }).id}/confirm`, { actor: s });
  });

  app.post('/athletes/:id/change-requests', { schema: { tags, summary: 'Pedir alteração de dados de identificação', params: uuid, body: { type: 'object' } } }, async (req, reply) => {
    const s = await app.session(req);
    return reply.status(201).send(await app.backend.call('POST', `/athletes/${(req.params as { id: string }).id}/change-requests`, { actor: s, body: req.body }));
  });

  app.get('/athletes/:id/results', { schema: { tags, summary: 'Resultados no Troféu de Almada', params: uuid } }, async (req) => {
    const s = await app.session(req);
    return app.backend.call('GET', `/athletes/${(req.params as { id: string }).id}/results`, { actor: s });
  });
}
