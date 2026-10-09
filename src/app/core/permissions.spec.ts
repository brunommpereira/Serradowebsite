import { TestBed } from '@angular/core/testing';
import { ALL_PERMISSIONS, DEFAULT_ROLES, permissionsFor, roleName, saveDemoRoles } from './permissions';
import { AuthService } from './services/auth.service';

describe('permissões', () => {
  afterEach(() => localStorage.clear());

  it('somam as dos papéis; admin tem sempre todas', () => {
    expect(permissionsFor(['admin'])).toEqual(ALL_PERMISSIONS);
    expect(permissionsFor(['editor', 'treinador'])).toEqual(['cms.edit', 'athletes.view']);
    expect(permissionsFor(['tesouraria'])).toEqual(['members.view', 'payments.view', 'payments.manage']);
    expect(permissionsFor([])).toEqual([]);
    expect(roleName('tesouraria')).toBe('Tesouraria');
  });

  it('tesouraria gere pagamentos mas não conteúdos nem atletas (modo demonstração)', async () => {
    TestBed.configureTestingModule({});
    const auth = TestBed.inject(AuthService);
    expect(await auth.login('tesouraria@serradofc.pt', 'tesouraria2026')).toBe(true);
    expect(auth.isStaff()).toBe(true);
    expect(auth.can('payments.manage')).toBe(true);
    expect(auth.can('cms.edit', 'athletes.view')).toBe(false);
    auth.logout();
    await auth.login('socio@exemplo.pt', 'serrado1978');
    expect(auth.isStaff()).toBe(false);
    expect(auth.can()).toBe(false);
  });

  it('um papel alterado no backoffice muda logo as permissões', async () => {
    saveDemoRoles(DEFAULT_ROLES.map((r) => (r.key === 'treinador' ? { ...r, permissions: ['athletes.view', 'athletes.sensitive'] } : r)));
    TestBed.configureTestingModule({});
    const auth = TestBed.inject(AuthService);
    await auth.login('treinador@serradofc.pt', 'treinador2026');
    expect(auth.can('athletes.sensitive')).toBe(true);
  });
});
