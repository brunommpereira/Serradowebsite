import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { AthleteAreaService } from '../../../core/services/athlete-area.service';
import { ContentService } from '../../../core/services/content.service';
import { CmsStore } from '../../../core/cms/cms-store';
import { DemoAdminSource } from './demo-admin-source';

describe('Backoffice (modo demonstração)', () => {
  let auth: AuthService;
  let admin: DemoAdminSource;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DemoAdminSource] });
    auth = TestBed.inject(AuthService);
    admin = TestBed.inject(DemoAdminSource);
    TestBed.inject(CmsStore).demoReset();
    TestBed.inject(AthleteAreaService).reset();
  });
  afterEach(() => auth.logout());

  it('notícia criada fica em rascunho e só aparece no site depois de publicada', async () => {
    await auth.login('editor@serradofc.pt', 'editor2026');
    const content = TestBed.inject(ContentService);
    const e = await admin.cmsCreate('news', { slug: 'teste-cms', title: 'Teste CMS', category: 'Clube', summary: 'Resumo', body: 'Um\n\nDois', coverUrl: null, author: 'Teste' });
    expect(e.status).toBe('draft');
    expect(content.article('teste-cms')).toBeUndefined();
    await admin.cmsStatus('news', e.id, 'publish');
    expect(content.article('teste-cms')?.bodyHtml).toBe('<p>Um</p><p>Dois</p>');
  });

  it('imagens: carregar, descrever e não apagar enquanto estiverem em uso', async () => {
    await auth.login('editor@serradofc.pt', 'editor2026');
    const img = await admin.mediaUpload({ name: 'equipa.webp', mime: 'image/webp', base64: 'UklGRg==', width: 10, height: 5, alt: ' Equipa ' });
    expect(img.url).toBe('data:image/webp;base64,UklGRg==');
    expect(img.alt).toBe('Equipa');
    expect((await admin.mediaList('equi')).length).toBe(1);
    expect((await admin.mediaUpdate(img.id, 'Equipa sub-11')).alt).toBe('Equipa sub-11');

    const e = await admin.cmsCreate('news', { slug: 'com-capa', title: 'Com capa', category: 'Clube', summary: '', body: '<p>Olá</p>', coverUrl: img.url, author: 'Teste' });
    expect((await admin.mediaUsage(img.id)).map((u) => u.title)).toEqual(['Com capa']);
    await expect(admin.mediaDelete(img.id)).rejects.toThrow(/Com capa/);
    await admin.cmsDelete('news', e.id);
    await admin.mediaDelete(img.id);
    expect(await admin.mediaList()).toEqual([]);
  });

  it('imagens: só para quem edita conteúdos', async () => {
    await auth.login('secretaria@serradofc.pt', 'secretaria2026');
    await expect(admin.mediaList()).rejects.toThrow(/permissão/);
  });

  it('guarda revisões e repõe versões anteriores', async () => {
    await auth.login('editor@serradofc.pt', 'editor2026');
    const e = await admin.cmsCreate('pages', { slug: 'pagina-teste', title: 'V1', summary: '', body: '' });
    await admin.cmsUpdate('pages', e.id, { slug: 'pagina-teste', title: 'V2', summary: '', body: '' });
    const revs = await admin.cmsRevisions('pages', e.id);
    expect(revs.map((r) => r.title)).toEqual(['V2', 'V1']);
    const restored = await admin.cmsRestore('pages', e.id, revs[1].id);
    expect(restored['title']).toBe('V1');
  });

  it('slug repetido é recusado', async () => {
    await auth.login('editor@serradofc.pt', 'editor2026');
    await expect(admin.cmsCreate('news', { slug: 'nova-epoca-futsal', title: 'x', category: 'Clube' })).rejects.toThrow();
  });

  it('permissões por papel', async () => {
    await auth.login('editor@serradofc.pt', 'editor2026');
    await expect(admin.changeRequests()).rejects.toThrow(/Sem permissão/);
    await auth.login('secretaria@serradofc.pt', 'secretaria2026');
    await expect(admin.cmsList('news', {})).rejects.toThrow(/Sem permissão/);
    await expect(admin.users()).rejects.toThrow(/Sem permissão/);
  });

  it('secretaria aprova pedido de alteração e a ficha muda', async () => {
    await auth.login('secretaria@serradofc.pt', 'secretaria2026');
    const [req] = await admin.changeRequests();
    expect(req.changes['name']).toBe('Inês Maria Exemplo');
    await admin.resolveChange(req.id, true);
    const area = TestBed.inject(AthleteAreaService);
    expect(area.allAthletes().find((a) => a.id === 'atl-2')?.name).toBe('Inês Maria Exemplo');
    expect(await admin.changeRequests()).toEqual([]);
    expect((await admin.audit())[0].action).toBe('change_requests.approve');
  });

  it('treinador vê fichas sem dados sensíveis', async () => {
    await auth.login('treinador@serradofc.pt', 'treinador2026');
    const d = await admin.athlete('atl-1');
    expect(d['taxNumber']).toBeUndefined();
    expect(d['idNumber']).toBeUndefined();
    expect(d.name).toBe('Tomás Exemplo');
  });
});
