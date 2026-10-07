import type { FastifyInstance } from 'fastify';

/**
 * Conteúdo público (site). O middleware adapta o formato do CMS ao modelo que
 * o front já usa (NewsArticle, ClubEvent, Sponsor) e guarda em cache 60 s.
 */
type Row = Record<string, unknown>;
const paragraphs = (body: unknown) =>
  String(body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const toNews = (n: Row) => ({
  id: n['id'],
  slug: n['slug'],
  title: n['title'],
  category: n['category'],
  summary: n['summary'],
  content: paragraphs(n['body']),
  author: n['author'],
  coverUrl: n['coverUrl'] ?? null,
  publicationDate: String(n['publishedAt'] ?? n['updatedAt'] ?? '').slice(0, 10),
});

export const toEvent = (e: Row) => ({
  id: e['id'],
  slug: e['slug'],
  title: e['title'],
  kind: e['kind'],
  sportSlug: e['sportSlug'] ?? undefined,
  summary: e['summary'],
  description: paragraphs(e['body']),
  date: e['startsAt'],
  endTime: e['endTime'] ?? undefined,
  location: e['location'],
  capacity: e['capacity'],
  registered: 0,
  price: e['price'],
  memberPrice: e['memberPrice'] ?? undefined,
  registrationRequired: e['registrationRequired'],
  askShirtSize: e['askShirtSize'],
});

export const toPartner = (p: Row) => ({ id: p['id'], name: p['name'], category: p['category'], website: p['website'] ?? '', description: p['description'], active: true });

export async function contentRoutes(app: FastifyInstance) {
  const tags = ['Conteúdo público'];
  const list = (type: string, limit = 200) =>
    app.cache.get(`content:${type}:${limit}`, () => app.backend.call<{ items: Row[] }>('GET', `/cms/${type}`, { query: { limit } }).then((r) => r.items));
  const bySlug = (type: string, slug: string) => app.cache.get(`content:${type}:slug:${slug}`, () => app.backend.call<Row>('GET', `/cms/${type}/slug/${encodeURIComponent(slug)}`));
  const slugParams = { type: 'object', properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{1,120}$' } } } as const;

  app.get('/content/home', { schema: { tags, summary: 'Agregado da página inicial: últimas notícias, próximos eventos e parceiros' } }, async (_req, reply) => {
    const [news, events, partners] = await Promise.all([list('news'), list('events'), list('partners')]);
    const now = new Date().toISOString().slice(0, 16);
    reply.header('cache-control', 'public, max-age=60');
    return {
      news: news.slice(0, 3).map(toNews),
      events: events.map(toEvent).filter((e) => String(e.date) >= now).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 3),
      partners: partners.map(toPartner),
    };
  });

  app.get('/content/news', { schema: { tags, summary: 'Notícias publicadas', querystring: { type: 'object', properties: { category: { type: 'string', maxLength: 40 } } } } }, async (req, reply) => {
    const { category } = req.query as { category?: string };
    reply.header('cache-control', 'public, max-age=60');
    return (await list('news')).map(toNews).filter((n) => !category || n.category === category);
  });

  app.get('/content/news/:slug', { schema: { tags, summary: 'Notícia', params: slugParams } }, async (req) => toNews(await bySlug('news', (req.params as { slug: string }).slug)));

  app.get('/content/events', { schema: { tags, summary: 'Eventos publicados' } }, async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return (await list('events')).map(toEvent).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  });

  app.get('/content/events/:slug', { schema: { tags, summary: 'Evento', params: slugParams } }, async (req) => toEvent(await bySlug('events', (req.params as { slug: string }).slug)));

  app.get('/content/pages', { schema: { tags, summary: 'Páginas institucionais publicadas' } }, async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return (await list('pages')).map((p) => ({ slug: p['slug'], title: p['title'], summary: p['summary'], paragraphs: paragraphs(p['body']), updatedAt: p['updatedAt'] }));
  });

  app.get('/content/pages/:slug', { schema: { tags, summary: 'Página institucional', params: slugParams } }, async (req) => {
    const p = await bySlug('pages', (req.params as { slug: string }).slug);
    return { slug: p['slug'], title: p['title'], summary: p['summary'], paragraphs: paragraphs(p['body']), updatedAt: p['updatedAt'] };
  });

  app.get('/content/partners', { schema: { tags, summary: 'Parceiros e patrocinadores' } }, async () => (await list('partners')).map(toPartner));
}
