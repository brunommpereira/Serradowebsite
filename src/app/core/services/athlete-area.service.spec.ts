import { TestBed } from '@angular/core/testing';
import { ageOn, AthleteAreaService, formatClock, timeToSeconds } from './athlete-area.service';
import { MemberAuthService } from './member-auth.service';

describe('AthleteAreaService', () => {
  let service: AthleteAreaService;
  let auth: MemberAuthService;
  beforeEach(() => {
    localStorage.removeItem('sfc.athletes.v2');
    auth = TestBed.inject(MemberAuthService);
    auth.login('00482', 'serrado1978'); // encarregado de educação
    service = TestBed.inject(AthleteAreaService);
    service.reset();
  });
  afterEach(() => auth.logout());

  it('o encarregado vê só os educandos; a atleta vê só o seu registo', () => {
    expect(service.role()).toBe('encarregado');
    expect(service.athletes().map((a) => a.id)).toEqual(['atl-1', 'atl-2']);
    auth.login('00731', 'atleta2026');
    expect(service.role()).toBe('atleta');
    expect(service.athletes().map((a) => a.id)).toEqual(['atl-3']);
    expect(service.isSelf('atl-3')).toBe(true);
    auth.logout();
    expect(service.athletes()).toEqual([]);
  });

  it('compara o tempo só com a mesma distância e o ritmo quando a distância muda', () => {
    auth.login('00731', 'atleta2026');
    const egas = service.raceEvolution('atl-3').find((r) => r.race === 'Corrida Egas Moniz')!;
    const [first, second, third] = egas.editions;
    expect(first.delta).toBeNull();
    expect(second.sameDistance).toBe(true); // 9 km → 9 km: diferença de tempo
    expect(second.delta).toBeCloseTo(timeToSeconds('46:20.73') - timeToSeconds('48:10.42'), 2);
    expect(third.sameDistance).toBe(false); // 9 km → 7 km: diferença de ritmo por km
    expect(third.delta).toBeCloseTo(timeToSeconds('35:40.17') / 7 - timeToSeconds('46:20.73') / 9, 2);
  });

  it('converte e formata tempos', () => {
    expect(timeToSeconds('38:15.02')).toBeCloseTo(2295.02, 2);
    expect(timeToSeconds('1:02:03')).toBe(3723);
    expect(formatClock(225.4)).toBe('3:45');
    expect(formatClock(3723)).toBe('1:02:03');
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
