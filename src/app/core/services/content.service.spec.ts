import { TestBed } from '@angular/core/testing';
import { ContentService } from './content.service';

describe('ContentService', () => {
  let service: ContentService;
  beforeEach(() => (service = TestBed.inject(ContentService)));

  it('tem as três modalidades principais em destaque', () => {
    expect(service.sports().filter((s) => s.featured).map((s) => s.slug)).toEqual(['atletismo', 'futsal', 'rugby']);
  });

  it('rugby aponta para o site do núcleo Almada Rugby e não tem jogos de demonstração', () => {
    expect(service.sport('rugby')?.external?.url).toBe('https://almadarugby.pt/');
    expect(service.matches().some((m) => m.sportSlug === 'rugby')).toBe(false);
  });

  it('ordena notícias da mais recente para a mais antiga', () => {
    const dates = service.news().map((n) => n.publicationDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('pesquisa ignora acentos', () => {
    const r = service.search('socio');
    expect(r.some((x) => x.link === '/socios')).toBe(true);
  });
});
