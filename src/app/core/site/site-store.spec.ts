import { TestBed } from '@angular/core/testing';
import { DemoAdminSource } from '../../features/admin/data/demo-admin-source';
import { AuthService } from '../services/auth.service';
import { ContentService } from '../services/content.service';
import { BLOCKS } from './site-blocks';
import { SITE_DEFAULTS } from './site-defaults';
import { SiteStore } from './site-store';

describe('Conteúdos do site (blocos)', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DemoAdminSource] });
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => auth.logout());

  it('cada bloco do editor tem conteúdo original e só usa campos desse conteúdo', () => {
    for (const b of BLOCKS) {
      const base = SITE_DEFAULTS[b.key as keyof typeof SITE_DEFAULTS] as unknown as Record<
        string,
        unknown
      >;
      expect(base, b.key).toBeTruthy();
      for (const f of b.fields) expect(Object.keys(base), `${b.key}.${f.key}`).toContain(f.key);
    }
  });

  it('sem edições o site mostra o original; um campo editado substitui só esse campo', () => {
    const site = TestBed.inject(SiteStore);
    const content = TestBed.inject(ContentService);
    expect(content.club.phone).toBe(SITE_DEFAULTS.contacts.phone);
    site.demoSave('contacts', { phone: '+351 212 345 678', campoAntigo: 'x' }, 'Teste');
    expect(content.club.phone).toBe('+351 212 345 678');
    expect(content.club.email).toBe(SITE_DEFAULTS.contacts.email);
    expect(
      (site.data('contacts') as unknown as Record<string, unknown>)['campoAntigo'],
    ).toBeUndefined();
    site.demoSave('contacts', null, 'Teste');
    expect(content.club.phone).toBe(SITE_DEFAULTS.contacts.phone);
  });

  it('jogos, classificações e órgãos sociais no formato das páginas', () => {
    const site = TestBed.inject(SiteStore);
    const content = TestBed.inject(ContentService);
    site.demoSave(
      'matches',
      {
        items: [
          {
            sportSlug: 'futsal',
            team: 'Seniores',
            opponent: 'B',
            date: '2099-01-02T10:00',
            venue: '',
            homeAway: 'casa',
            competition: '',
            season: '',
            status: 'agendado',
            scoreHome: null,
            scoreAway: null,
          },
          {
            sportSlug: 'futsal',
            team: 'Seniores',
            opponent: 'A',
            date: '2099-01-01T10:00',
            venue: '',
            homeAway: 'fora',
            competition: '',
            season: '',
            status: 'agendado',
            scoreHome: null,
            scoreAway: null,
          },
        ],
      },
      'Teste',
    );
    expect(content.upcomingMatches('futsal').map((m) => m.opponent)).toEqual(['A', 'B']);
    site.demoSave(
      'standings',
      {
        tables: [
          {
            sportSlug: 'futsal',
            competition: 'Distrital',
            rows: ['Serrado FC | 4 | 10', ' Outro |3| 7 ', ''],
          },
        ],
      },
      'Teste',
    );
    expect(content.standings('futsal')[0].rows).toEqual([
      { pos: 1, team: 'Serrado FC', played: 4, points: 10 },
      { pos: 2, team: 'Outro', played: 3, points: 7 },
    ]);
    site.demoSave(
      'boards',
      {
        members: [
          { group: 'Direção', role: 'Presidente', name: 'Pessoa A' },
          { group: 'Conselho Fiscal', role: 'Presidente', name: 'Pessoa B' },
          { group: 'Direção', role: 'Tesoureiro', name: 'Pessoa C' },
        ],
      },
      'Teste',
    );
    expect(content.boards().map((b) => [b.name, b.members.length])).toEqual([
      ['Direção', 2],
      ['Conselho Fiscal', 1],
    ]);
  });

  it('só quem edita conteúdos grava, e cada gravação fica no histórico', async () => {
    const admin = TestBed.inject(DemoAdminSource);
    await auth.login('tesouraria@serradofc.pt', 'tesouraria2026');
    await expect(admin.siteSave('shop', { notice: 'x' })).rejects.toThrow(/Sem permissão/);
    auth.logout();
    await auth.login('editor@serradofc.pt', 'editor2026');
    await admin.siteSave('shop', { notice: 'Encomendas na sede.' });
    await admin.siteSave('shop', { notice: 'Encomendas por email.' });
    expect(TestBed.inject(ContentService).shopNotice()).toBe('Encomendas por email.');
    const revs = await admin.siteRevisions('shop');
    expect(revs).toHaveLength(2);
    await admin.siteRestore('shop', revs[1].id);
    expect(TestBed.inject(ContentService).shopNotice()).toBe('Encomendas na sede.');
    await expect(admin.siteSave('nao-existe', {})).rejects.toThrow(/desconhecido/);
  });
});
