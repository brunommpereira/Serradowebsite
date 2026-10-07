import type { FastifyInstance, FastifyRequest } from 'fastify';

const CMS = ['news', 'events', 'pages', 'partners'] as const;

/**
 * Backoffice (/api/v1/admin). Cada grupo exige papéis (admin passa sempre);
 * o backend volta a verificar. Escritas no CMS limpam a cache do conteúdo público.
 */
export async function adminRoutes(app: FastifyInstance) {
  const typeParams = { type: 'object', properties: { type: { type: 'string', enum: [...CMS] } } } as const;
  const entryParams = { type: 'object', properties: { type: { type: 'string', enum: [...CMS] }, id: { type: 'integer', minimum: 1 } } } as const;
  const p = (req: FastifyRequest) => req.params as { type: string; id: number; rev: number };

  // ---------------------------------------------------------------- dashboard (agregação)
  app.get('/dashboard', { schema: { tags: ['Backoffice'], summary: 'Indicadores + atividade recente + o que precisa de atenção (agregado)' } }, async (req) => {
    const s = await app.staff(req, 'editor', 'secretaria', 'treinador');
    const isSec = s.roles.some((r) => r === 'admin' || r === 'secretaria');
    const [stats, activity, requests, documents] = await Promise.all([
      app.backend.call<Record<string, number>>('GET', '/stats', { actor: s }),
      app.backend.call<unknown[]>('GET', '/audit', { actor: s, query: { limit: 8 } }),
      isSec ? app.backend.call<unknown[]>('GET', '/change-requests', { actor: s }) : Promise.resolve([]),
      isSec ? app.backend.call<unknown[]>('GET', '/documents', { actor: s }) : Promise.resolve([]),
    ]);
    return { user: { name: s.name, roles: s.roles }, stats, activity, attention: { requests: requests.slice(0, 5), documents: documents.slice(0, 5) } };
  });

  // ---------------------------------------------------------------- Imagens (biblioteca do CMS)
  const mediaTags = ['Backoffice · Imagens'];
  const mediaParams = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } as const;
  const mediaId = (req: FastifyRequest) => (req.params as { id: number }).id;
  app.get('/media', { schema: { tags: mediaTags, summary: 'Lista as imagens', querystring: { type: 'object', properties: { q: { type: 'string', maxLength: 100 } } } } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('GET', '/cms/media', { actor: s, query: req.query as Record<string, unknown> });
  });
  app.post('/media', { bodyLimit: 8 * 1024 * 1024, schema: { tags: mediaTags, summary: 'Carrega uma imagem (base64; o browser reduz e converte antes)', body: { type: 'object' } } }, async (req, reply) => {
    const s = await app.staff(req, 'editor');
    return reply.status(201).send(await app.backend.call('POST', '/cms/media', { actor: s, body: req.body }));
  });
  app.patch('/media/:id', { schema: { tags: mediaTags, summary: 'Altera o texto alternativo', params: mediaParams, body: { type: 'object' } } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('PATCH', `/cms/media/${mediaId(req)}`, { actor: s, body: req.body });
  });
  app.get('/media/:id/usage', { schema: { tags: mediaTags, summary: 'Onde a imagem é usada', params: mediaParams } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('GET', `/cms/media/${mediaId(req)}/usage`, { actor: s });
  });
  app.delete('/media/:id', { schema: { tags: mediaTags, summary: 'Apaga (recusa se estiver a ser usada)', params: mediaParams } }, async (req, reply) => {
    const s = await app.staff(req, 'editor');
    await app.backend.call('DELETE', `/cms/media/${mediaId(req)}`, { actor: s });
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- CMS
  const cmsTags = ['Backoffice · CMS'];
  app.get('/cms/:type', { schema: { tags: cmsTags, summary: 'Lista (todos os estados)', params: typeParams, querystring: { type: 'object', properties: { status: { type: 'string' }, q: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' } } } } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('GET', `/cms/${p(req).type}`, { actor: s, query: req.query as Record<string, unknown> });
  });
  app.get('/cms/:type/:id', { schema: { tags: cmsTags, summary: 'Detalhe', params: entryParams } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('GET', `/cms/${p(req).type}/${p(req).id}`, { actor: s });
  });
  app.post('/cms/:type', { schema: { tags: cmsTags, summary: 'Criar rascunho', params: typeParams, body: { type: 'object' } } }, async (req, reply) => {
    const s = await app.staff(req, 'editor');
    const out = await app.backend.call('POST', `/cms/${p(req).type}`, { actor: s, body: req.body });
    app.cache.invalidate('content:');
    return reply.status(201).send(out);
  });
  app.put('/cms/:type/:id', { schema: { tags: cmsTags, summary: 'Guardar (nova revisão)', params: entryParams, body: { type: 'object' } } }, async (req) => {
    const s = await app.staff(req, 'editor');
    const out = await app.backend.call('PUT', `/cms/${p(req).type}/${p(req).id}`, { actor: s, body: req.body });
    app.cache.invalidate('content:');
    return out;
  });
  app.delete('/cms/:type/:id', { schema: { tags: cmsTags, summary: 'Apagar', params: entryParams } }, async (req, reply) => {
    const s = await app.staff(req, 'editor');
    await app.backend.call('DELETE', `/cms/${p(req).type}/${p(req).id}`, { actor: s });
    app.cache.invalidate('content:');
    return reply.status(204).send();
  });
  for (const action of ['publish', 'unpublish', 'archive'] as const) {
    app.post(`/cms/:type/:id/${action}`, { schema: { tags: cmsTags, summary: { publish: 'Publicar', unpublish: 'Despublicar', archive: 'Arquivar' }[action], params: entryParams } }, async (req) => {
      const s = await app.staff(req, 'editor');
      const out = await app.backend.call('POST', `/cms/${p(req).type}/${p(req).id}/${action}`, { actor: s });
      app.cache.invalidate('content:');
      return out;
    });
  }
  app.get('/cms/:type/:id/revisions', { schema: { tags: cmsTags, summary: 'Histórico de versões', params: entryParams } }, async (req) => {
    const s = await app.staff(req, 'editor');
    return app.backend.call('GET', `/cms/${p(req).type}/${p(req).id}/revisions`, { actor: s });
  });
  app.post('/cms/:type/:id/revisions/:rev/restore', { schema: { tags: cmsTags, summary: 'Repor versão', params: { type: 'object', properties: { type: { type: 'string', enum: [...CMS] }, id: { type: 'integer' }, rev: { type: 'integer' } } } } }, async (req) => {
    const s = await app.staff(req, 'editor');
    const out = await app.backend.call('POST', `/cms/${p(req).type}/${p(req).id}/revisions/${p(req).rev}/restore`, { actor: s });
    app.cache.invalidate('content:');
    return out;
  });

  // ---------------------------------------------------------------- atletas, documentos, pedidos
  const aTags = ['Backoffice · Atletas'];
  app.get('/athletes', { schema: { tags: aTags, summary: 'Todos os atletas (filtros: q, sport, pending)', querystring: { type: 'object', properties: { q: { type: 'string' }, sport: { type: 'string' }, pending: { type: 'string' } } } } }, async (req) => {
    const s = await app.staff(req, 'secretaria', 'treinador');
    return app.backend.call('GET', '/athletes', { actor: s, query: { ...(req.query as object), scope: 'all' } });
  });
  app.get('/athletes/:id', { schema: { tags: aTags, summary: 'Ficha (treinador sem dados sensíveis)', params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (req) => {
    const s = await app.staff(req, 'secretaria', 'treinador');
    return app.backend.call('GET', `/athletes/${(req.params as { id: string }).id}`, { actor: s });
  });
  app.get('/change-requests', { schema: { tags: aTags, summary: 'Pedidos de alteração', querystring: { type: 'object', properties: { status: { type: 'string' } } } } }, async (req) => {
    const s = await app.staff(req, 'secretaria');
    return app.backend.call('GET', '/change-requests', { actor: s, query: req.query as Record<string, unknown> });
  });
  app.get('/documents', { schema: { tags: aTags, summary: 'Documentos por estado', querystring: { type: 'object', properties: { status: { type: 'string' } } } } }, async (req) => {
    const s = await app.staff(req, 'secretaria');
    return app.backend.call('GET', '/documents', { actor: s, query: req.query as Record<string, unknown> });
  });
  for (const [path, verb] of [
    ['/change-requests/:id/approve', 'Aprovar pedido'],
    ['/change-requests/:id/reject', 'Rejeitar pedido (note)'],
    ['/documents/:id/approve', 'Aprovar documento'],
    ['/documents/:id/reject', 'Rejeitar documento (note)'],
  ] as const) {
    app.post(path, { schema: { tags: aTags, summary: verb, params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } }, body: { type: 'object' } } }, async (req) => {
      const s = await app.staff(req, 'secretaria');
      return app.backend.call('POST', path.replace(':id', String((req.params as { id: number }).id)), { actor: s, body: req.body ?? {} });
    });
  }

  // ---------------------------------------------------------------- resultados, utilizadores, auditoria
  app.post('/results/import', { bodyLimit: 5 * 1024 * 1024, schema: { tags: ['Backoffice · Resultados'], summary: 'Importar resultados do Troféu de Almada', body: { type: 'object' } } }, async (req) => {
    const s = await app.staff(req, 'secretaria');
    return app.backend.call('POST', '/results/import', { actor: s, body: req.body });
  });
  app.get('/users', { schema: { tags: ['Backoffice · Gestão'], summary: 'Utilizadores e papéis' } }, async (req) => {
    const s = await app.staff(req);
    return app.backend.call('GET', '/users', { actor: s });
  });
  app.put('/users/:id/roles', { schema: { tags: ['Backoffice · Gestão'], summary: 'Definir papéis', params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }, body: { type: 'object' } } }, async (req) => {
    const s = await app.staff(req);
    return app.backend.call('PUT', `/users/${(req.params as { id: string }).id}/roles`, { actor: s, body: req.body });
  });
  app.get('/audit', { schema: { tags: ['Backoffice · Gestão'], summary: 'Auditoria', querystring: { type: 'object', properties: { limit: { type: 'integer' } } } } }, async (req) => {
    const s = await app.staff(req, 'editor', 'secretaria', 'treinador');
    return app.backend.call('GET', '/audit', { actor: s, query: req.query as Record<string, unknown> });
  });
}
