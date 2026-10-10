import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { excelDate, headerKey } from '../../../shared/tabular';

export const SPORT_OPTIONS: [string, string][] = [
  ['atletismo', 'Atletismo'],
  ['futsal', 'Escola de Futsal'],
  ['rugby', 'Escola de Rugby'],
  ['formacao', 'Formação'],
  ['escola-de-desporto', 'Escola de Desporto'],
];
export const MEMBER_STATUS = ['Ativo', 'Pendente', 'Suspenso'] as const;
export const PAY_METHODS: [string, string][] = [
  ['cash', 'Numerário'],
  ['transfer', 'Transferência'],
  ['mb_way', 'MB WAY'],
  ['multibanco', 'Multibanco'],
  ['card', 'Cartão (TPA)'],
  ['cheque', 'Cheque'],
];

export interface MemberRow {
  memberNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  category: string;
  status: string;
  joinedOn: string;
  hasAccount: boolean;
  athletes: number;
  overdue: number;
}

export interface MemberDetail {
  memberNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  birthDate: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  category: string;
  status: string;
  joinedOn: string;
  notes: string;
  userId: string | null;
  accountEmail: string | null;
  accountHasPassword: boolean | null;
  accountLastLogin: string | null;
  athletes: { id: string; code: string; name: string; sport: string; category: string | null }[];
  quotas: { id: number; period: string; amount: number; dueDate: string; paidAt: string | null; paymentMethod: string | null; receiptNumber: string | null; status: string }[];
}

export interface AthleteSuggestion {
  id: string;
  code: string;
  name: string;
  sport: string;
  category: string | null;
  birthDate: string | null;
  memberNumber: string | null;
  score: number;
  reason: string;
}

export interface AthleteAccess {
  userId: string;
  name: string;
  email: string;
  role: 'encarregado' | 'co-encarregado' | 'atleta';
  hasPassword: boolean;
}

export interface PendingItem {
  kind: 'quota' | 'fee';
  id: number;
  label: string;
  period: string;
  amount: number;
  dueDate: string;
  memberNumber: string | null;
  who: string;
  payerName: string;
  payerEmail: string;
  payerNif: string | null;
  inProgress: boolean;
}

export interface QuotaPlan {
  category: string;
  amount: number;
  periodicity: 'mensal' | 'anual';
  active: boolean;
  members?: number;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  kind: 'members' | 'athletes';
  total: number;
  valid: number;
  errors: ImportError[];
  dryRun: boolean;
  creates?: number;
  updates?: number;
  created?: number;
  updated?: number;
}

export type ImportKind = 'members' | 'athletes';

/** Campos que se podem importar, com os nomes de coluna aceites (comparados sem acentos nem pontuação). */
export interface ImportField {
  key: string;
  label: string;
  aliases: string[];
  date?: boolean;
  required?: boolean;
}

const PERSON: ImportField[] = [
  { key: 'name', label: 'Nome', aliases: ['nome', 'nomecompleto'], required: true },
  { key: 'email', label: 'Email', aliases: ['email', 'mail', 'correioeletronico'] },
  { key: 'phone', label: 'Telemóvel', aliases: ['telemovel', 'telefone', 'telm', 'contacto', 'contactotelefonico'] },
  { key: 'taxNumber', label: 'NIF', aliases: ['nif', 'contribuinte', 'ncontribuinte', 'numerodecontribuinte'] },
  { key: 'birthDate', label: 'Data de nascimento', aliases: ['datadenascimento', 'nascimento', 'datanascimento', 'dn'], date: true },
  { key: 'address', label: 'Morada', aliases: ['morada', 'endereco'] },
  { key: 'postalCode', label: 'Código postal', aliases: ['codigopostal', 'cp', 'codpostal'] },
  { key: 'city', label: 'Localidade', aliases: ['localidade', 'cidade'] },
];

export const IMPORT_FIELDS: Record<ImportKind, ImportField[]> = {
  members: [
    { key: 'memberNumber', label: 'N.º sócio', aliases: ['nsocio', 'nosocio', 'numerodesocio', 'numerosocio', 'socion', 'sociono', 'nodesocio', 'socio'] },
    ...PERSON,
    { key: 'category', label: 'Categoria', aliases: ['categoria', 'tipo', 'tipodesocio'] },
    { key: 'status', label: 'Estado', aliases: ['estado', 'situacao'] },
    { key: 'joinedOn', label: 'Sócio desde', aliases: ['sociodesde', 'datadeadmissao', 'admissao', 'datadeinscricao', 'inscricao'], date: true },
    { key: 'notes', label: 'Observações', aliases: ['observacoes', 'notas', 'obs'] },
  ],
  athletes: [
    { key: 'code', label: 'Código', aliases: ['codigo', 'codigoatleta', 'codatleta'] },
    ...PERSON,
    { key: 'gender', label: 'Género', aliases: ['genero', 'sexo'] },
    { key: 'sport', label: 'Modalidade', aliases: ['modalidade', 'desporto'] },
    { key: 'category', label: 'Escalão', aliases: ['escalao', 'categoria'] },
    { key: 'memberNumber', label: 'N.º sócio', aliases: ['nsocio', 'nosocio', 'numerodesocio', 'numerosocio', 'socion', 'sociono', 'nodesocio'] },
    { key: 'idNumber', label: 'N.º CC', aliases: ['cc', 'ncc', 'nocc', 'nodocc', 'cartaodecidadao', 'numerodocc', 'bi', 'ndocumento', 'documento'] },
    { key: 'idExpiry', label: 'Validade do CC', aliases: ['validadecc', 'validadedocc', 'validade', 'validadedocumento'], date: true },
    { key: 'guardianName', label: 'Encarregado (nome)', aliases: ['encarregado', 'encarregadodeeducacao', 'nomeencarregado', 'nomedoencarregado'] },
    { key: 'guardianEmail', label: 'Encarregado (email)', aliases: ['emailencarregado', 'emaildoencarregado', 'emailencarregadodeeducacao'] },
    { key: 'accountEmail', label: 'Conta do atleta (email)', aliases: ['contadoatleta', 'emailconta', 'contaatleta'] },
  ],
};

/** Exemplo fictício para o modelo a descarregar. */
export const IMPORT_EXAMPLE: Record<ImportKind, string[]> = {
  members: ['01001', 'Maria Exemplo', 'maria@exemplo.pt', '912345678', '123456789', '1985-04-12', 'Rua do Exemplo, 1', '2825-000', 'Charneca', 'Efetivo', 'Ativo', '2024-09-01', ''],
  athletes: ['', 'Tiago Exemplo', '', '', '', '2014-06-20', '', '', '', 'Masculino', 'futsal', 'Sub-13', '01001', '', '', 'Maria Exemplo', 'maria@exemplo.pt', ''],
};

/** Liga as colunas do ficheiro aos campos (pelo nome do cabeçalho). */
export function mapColumns(kind: ImportKind, header: string[]): (ImportField | null)[] {
  const used = new Set<string>();
  return header.map((h) => {
    const key = headerKey(h);
    const f = IMPORT_FIELDS[kind].find((x) => !used.has(x.key) && (x.aliases.includes(key) || headerKey(x.label) === key));
    if (f) used.add(f.key);
    return f ?? null;
  });
}

/** Linhas da tabela → objetos com os campos reconhecidos (as colunas ignoradas não seguem). */
export function toRows(table: string[][], columns: (ImportField | null)[]): Record<string, string>[] {
  return table.slice(1).map((r) => {
    const o: Record<string, string> = {};
    columns.forEach((f, i) => {
      const v = (r[i] ?? '').trim();
      if (f && v) o[f.key] = f.date ? excelDate(v) : v;
    });
    return o;
  });
}

/** Backoffice de sócios e atletas: só com a API (o modo demonstração não grava). */
@Injectable({ providedIn: 'root' })
export class RegistryApi {
  private readonly api = inject(ApiClient);
  readonly enabled = this.api.enabled;

  members(filter: { q?: string; status?: string; category?: string }) {
    return this.api.get<MemberRow[]>('/admin/members', filter);
  }
  member(number: string) {
    return this.api.get<MemberDetail>(`/admin/members/${number}`);
  }
  createMember(body: Partial<MemberDetail>) {
    return this.api.post<MemberDetail>('/admin/members', body);
  }
  updateMember(number: string, body: Partial<MemberDetail>) {
    return this.api.put<MemberDetail>(`/admin/members/${number}`, body);
  }
  addQuota(number: string, body: { period: string; amount: number; dueDate: string }) {
    return this.api.post(`/admin/members/${number}/quotas`, body);
  }
  invite(userId: string) {
    return this.api.post(`/admin/users/${userId}/invite`);
  }
  /** Atletas que podem ser deste sócio (pelo nome ou por ser encarregado); com q, pesquisa por nome. */
  athleteSuggestions(number: string, q?: string) {
    return this.api.get<AthleteSuggestion[]>(`/admin/members/${number}/athlete-suggestions`, q ? { q } : {});
  }
  linkAthlete(number: string, athleteId: string, force = false) {
    return this.api.post<MemberDetail & { completed?: { member: string[]; athlete: string[] } }>(
      `/admin/members/${number}/athletes/${athleteId}${force ? '?force=true' : ''}`,
    );
  }
  unlinkAthlete(number: string, athleteId: string) {
    return this.api.delete<MemberDetail>(`/admin/members/${number}/athletes/${athleteId}`);
  }

  createAthlete(body: Record<string, unknown>) {
    return this.api.post<{ id: string; code: string; name: string }>('/admin/athletes', body);
  }
  updateAthlete(id: string, body: Record<string, unknown>) {
    return this.api.put(`/admin/athletes/${id}`, body);
  }
  access(id: string) {
    return this.api.get<AthleteAccess[]>(`/admin/athletes/${id}/access`);
  }
  grantAccess(id: string, body: { email: string; name: string; role: string }) {
    return this.api.post(`/admin/athletes/${id}/access`, body);
  }
  revokeAccess(id: string, userId: string) {
    return this.api.delete(`/admin/athletes/${id}/access/${userId}`);
  }

  import(kind: ImportKind, rows: Record<string, string>[], dryRun: boolean) {
    return this.api.post<ImportResult>('/admin/registry/import', { kind, rows, dryRun });
  }

  pending(q?: string) {
    return this.api.get<PendingItem[]>('/admin/payments/pending', { q });
  }
  recordPayment(body: Record<string, unknown>) {
    return this.api.post<{ id: string; amount: number; receiptStatus: string }>('/admin/payments/manual', body);
  }
  quotaPlans() {
    return this.api.get<QuotaPlan[]>('/admin/quota-plans');
  }
  saveQuotaPlan(p: QuotaPlan) {
    return this.api.put(`/admin/quota-plans/${encodeURIComponent(p.category)}`, { amount: p.amount, periodicity: p.periodicity, active: p.active });
  }
}
