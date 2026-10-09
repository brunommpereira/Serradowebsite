/**
 * Permissões do backoffice. O catálogo é fixo (o servidor tem o mesmo, em serrado/permissions.py);
 * os papéis e as permissões de cada papel configuram-se no backoffice (Gestão → Papéis e permissões).
 */
export const PERMISSIONS = {
  'cms.edit': 'Conteúdos do site: notícias, eventos, páginas, parceiros e imagens',
  'athletes.view': 'Ver atletas (fichas sem dados sensíveis)',
  'athletes.sensitive': 'Ver dados sensíveis dos atletas (CC, NIF, morada)',
  'athletes.manage': 'Criar e alterar atletas e encarregados; validar pedidos e documentos',
  'members.view': 'Ver sócios e quotas',
  'members.manage': 'Criar e alterar sócios; importar sócios e atletas',
  'payments.view': 'Ver pagamentos e descarregar recibos',
  'payments.manage': 'Registar pagamentos, emitir recibos, valores de quotas e mensalidades',
  'results.import': 'Importar resultados de provas',
  'registrations.manage': 'Documentos legais (condições, RGPD, imagem) e registos online',
  'users.manage': 'Utilizadores, papéis e permissões',
  'audit.all': 'Ver toda a auditoria (os outros veem só as suas ações)',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const ADMIN_ROLE = 'admin';

/** Grupos para mostrar o catálogo de forma legível. */
export const PERMISSION_GROUPS: { title: string; prefix: string }[] = [
  { title: 'Conteúdos', prefix: 'cms.' },
  { title: 'Atletas', prefix: 'athletes.' },
  { title: 'Sócios', prefix: 'members.' },
  { title: 'Pagamentos', prefix: 'payments.' },
  { title: 'Resultados', prefix: 'results.' },
  { title: 'Registos', prefix: 'registrations.' },
  { title: 'Gestão', prefix: 'users.' },
  { title: 'Auditoria', prefix: 'audit.' },
];

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  builtin: boolean;
  permissions: Permission[];
  users?: number;
}

/** Papéis de origem (iguais aos da migração 010 do servidor). */
export const DEFAULT_ROLES: RoleDef[] = [
  { key: 'admin', name: 'Administração', description: 'Acesso total, incluindo utilizadores, papéis e permissões', builtin: true, permissions: ALL_PERMISSIONS },
  {
    key: 'secretaria',
    name: 'Secretaria',
    description: 'Sócios, atletas, validações, resultados e registos',
    builtin: true,
    permissions: ['athletes.view', 'athletes.sensitive', 'athletes.manage', 'members.view', 'members.manage', 'payments.view', 'results.import', 'registrations.manage'],
  },
  { key: 'tesouraria', name: 'Tesouraria', description: 'Quotas, mensalidades, pagamentos e recibos', builtin: true, permissions: ['members.view', 'payments.view', 'payments.manage'] },
  { key: 'editor', name: 'Comunicação', description: 'Conteúdos do site e imagens', builtin: true, permissions: ['cms.edit'] },
  { key: 'treinador', name: 'Treinador', description: 'Consulta dos atletas, sem dados sensíveis', builtin: true, permissions: ['athletes.view'] },
];

const DEMO_ROLES_KEY = 'sfc.roledefs.v1';

/** Modo demonstração: papéis guardados no browser (só dados de exemplo). */
export function demoRoles(): RoleDef[] {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(DEMO_ROLES_KEY);
    const list = saved ? (JSON.parse(saved) as RoleDef[]) : null;
    return Array.isArray(list) && list.some((r) => r.key === ADMIN_ROLE) ? list : DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
}

export function saveDemoRoles(list: RoleDef[]) {
  try {
    localStorage.setItem(DEMO_ROLES_KEY, JSON.stringify(list));
  } catch {
    /* armazenamento indisponível: fica só em memória até recarregar */
  }
}

/** Permissões efetivas de um conjunto de papéis (admin tem sempre todas). */
export function permissionsFor(roles: string[], defs: RoleDef[] = DEFAULT_ROLES): Permission[] {
  if (roles.includes(ADMIN_ROLE)) return [...ALL_PERMISSIONS];
  const set = new Set<Permission>();
  for (const r of defs) if (roles.includes(r.key)) r.permissions.forEach((p) => set.add(p));
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export function roleName(key: string, defs: RoleDef[] = DEFAULT_ROLES) {
  return defs.find((r) => r.key === key)?.name ?? key;
}
