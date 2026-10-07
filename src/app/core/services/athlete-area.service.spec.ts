import { TestBed } from '@angular/core/testing';
import { ageOn, AthleteAreaService } from './athlete-area.service';

describe('AthleteAreaService', () => {
  let service: AthleteAreaService;
  beforeEach(() => {
    localStorage.removeItem('sfc.athletes.v1');
    service = TestBed.inject(AthleteAreaService);
    service.reset();
  });

  it('usa apenas atletas de demonstração', () => {
    expect(service.athletes().every((a) => a.name.endsWith('Exemplo'))).toBe(true);
  });

  it('regista e anula a resposta Vou / Não vou', () => {
    const s = service.upcoming('atl-1')[0];
    service.setRsvp(s.id, 'vou');
    expect(service.upcoming('atl-1')[0].rsvp).toBe('vou');
    service.setRsvp(s.id, null);
    expect(service.upcoming('atl-1')[0].rsvp).toBeNull();
  });

  it('calcula presenças, faltas e minutos só com sessões terminadas', () => {
    const st = service.stats('atl-1', '2026-01-01', '2026-12-31');
    expect(st.list.every((s) => s.status === 'Terminado')).toBe(true);
    expect(st.attended + st.absences).toBe(st.sessions);
    expect(st.minutes).toBe(st.list.filter((s) => s.attended).reduce((a, s) => a + s.minutes, 0));
  });

  it('limita a partilha a 2 co-encarregados e recusa duplicados', () => {
    expect(service.inviteCoGuardian('atl-2', 'AVO.exemplo@exemplo.pt')).toBe('duplicado');
    expect(service.inviteCoGuardian('atl-2', 'mae@exemplo.pt')).toBe('ok');
    expect(service.inviteCoGuardian('atl-2', 'tio@exemplo.pt')).toBe('limite');
    service.revokeCoGuardian('atl-2', 'mae@exemplo.pt');
    expect(service.athletes().find((a) => a.id === 'atl-2')?.coGuardians.length).toBe(1);
  });

  it('documento carregado fica em análise e novo atleta começa com 6 em falta', () => {
    service.uploadDocument('atl-1', 'cc-verso');
    expect(service.athletes()[0].documents.find((d) => d.id === 'cc-verso')?.status).toBe('Em análise');
    const a = service.addAthlete({ name: 'Rui Exemplo', birthDate: '2018-05-01', sportSlug: 'futsal', level: 'Sub-9' });
    expect(a.documents.length).toBe(6);
    expect(a.documents.every((d) => d.status === 'Em falta')).toBe(true);
  });

  it('calcula a idade em anos completos', () => {
    expect(ageOn('2016-03-12', new Date(2026, 2, 11))).toBe(9);
    expect(ageOn('2016-03-12', new Date(2026, 2, 12))).toBe(10);
  });
});
