/**
 * DADOS DE DEMONSTRAÇÃO — Área de Atletas (encarregados de educação).
 * Atletas, sessões, métricas e recibos são fictícios. Na fase 4/5 estes dados
 * vêm da API (GET /api/guardians/me/athletes, /api/athletes/{id}/sessions, …).
 */
import { SportSlug } from '../models';

export type SessionType = 'Treino' | 'Jogo' | 'Torneio';
export type SessionStatus = 'Agendado' | 'Terminado' | 'Cancelado';
export type Rsvp = 'vou' | 'nao-vou' | null;
export type DocStatus = 'Aprovado' | 'Em análise' | 'Rejeitado' | 'Em falta';

export interface Athlete {
  id: string;
  name: string;
  sportSlug: SportSlug;
  level: string;
  birthDate: string;
  documents: AthleteDocument[];
  coGuardians: string[];
  /** Contas dos encarregados de educação com acesso (perfil «Encarregado») */
  guardians: string[];
  /** Conta do próprio atleta, quando entra com perfil «Atleta» (não precisa de ser sócio) */
  selfAccount?: string;
  details: AthleteDetails;
  /** Última confirmação dos dados pelo encarregado/atleta (AAAA-MM-DD) */
  confirmedAt?: string;
  /** Alteração de dados de identificação à espera de validação da secretaria */
  pendingReview?: { fields: string[]; requestedAt: string; changes: IdentityChanges };
}

export type ShirtType = 'Normal' | 'Alças';

/** Dados de identificação: só mudam com validação da secretaria. */
export interface IdentityChanges {
  name?: string;
  birthDate?: string;
  gender?: AthleteDetails['gender'];
  idNumber?: string;
  taxNumber?: string;
}

/** Ficha do atleta (época em curso). */
export interface AthleteDetails {
  gender: 'Feminino' | 'Masculino' | '';
  idNumber: string; // CC / BI
  idExpiry: string;
  taxNumber: string; // NIF
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  shirtSize: string;
  shirtType: ShirtType | '';
  emergencyName: string;
  emergencyPhone: string;
  consentRgpd: boolean;
  consentImage: boolean;
}

/** Época em curso e data a partir da qual uma confirmação conta para ela. */
export const CURRENT_SEASON = { label: '2026/27', start: '2026-09-01' };

export function emptyDetails(): AthleteDetails {
  return {
    gender: '',
    idNumber: '',
    idExpiry: '',
    taxNumber: '',
    email: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    shirtSize: '',
    shirtType: '',
    emergencyName: '',
    emergencyPhone: '',
    consentRgpd: false,
    consentImage: false,
  };
}

/** Resultado oficial numa prova do Troféu Almada em Atletismo (fonte: tatletismo-almada.pt). */
export interface CompetitionResult {
  id: string;
  athleteId: string;
  season: string; // 2025/2026
  round: number; // n.º da prova na época
  race: string; // nome publicado (muda com a edição)
  raceBase: string; // nome comparável entre épocas
  date: string;
  category: string; // escalão normalizado
  place: number | null; // classificação no escalão
  time: string; // m:ss ou h:mm:ss
  distanceM: number | null; // distância do regulamento
  trophyPoints: number | null;
}

export interface AthleteDocument {
  id: string;
  name: string;
  hint: string;
  status: DocStatus;
  /** Motivo, quando rejeitado */
  note?: string;
}

export interface Session {
  id: string;
  athleteId: string;
  date: string; // AAAA-MM-DDTHH:MM
  type: SessionType;
  title: string;
  status: SessionStatus;
  minutes: number;
  location: string;
  /** Resposta do encarregado (Vou / Não vou) */
  rsvp: Rsvp;
  /** Presença registada pelo treinador (sessões terminadas) */
  attended?: boolean;
  plan?: string[];
}

export interface Metric {
  label: string;
  athlete: number;
  average: number;
}

export interface Assessment {
  moment: 'Início de época' | 'Meio de época' | 'Fim de época';
  date?: string;
  results: { test: string; value: string }[];
}

export interface AthleteReceipt {
  id: string;
  athleteId: string;
  number: string;
  period: string;
  description: string;
  amount: number;
  date: string;
}

const REQUIRED_DOCS = (): AthleteDocument[] => [
  { id: 'cc-frente', name: 'Documento de identificação (frente)', hint: 'Cartão de Cidadão ou passaporte', status: 'Em falta' },
  { id: 'cc-verso', name: 'Documento de identificação (verso)', hint: 'Cartão de Cidadão', status: 'Em falta' },
  { id: 'foto', name: 'Fotografia tipo passe', hint: 'Fundo claro, rosto visível', status: 'Em falta' },
  { id: 'rgpd', name: 'Declaração RGPD assinada', hint: 'Descarrega em «O Meu Clube»', status: 'Em falta' },
  { id: 'exame', name: 'Exame médico desportivo', hint: 'Modelo IPDJ', status: 'Em falta' },
  { id: 'ficha', name: 'Ficha de sócio', hint: 'Descarrega em «O Meu Clube»', status: 'Em falta' },
];

export function newAthleteDocuments(): AthleteDocument[] {
  return REQUIRED_DOCS();
}

export const DEMO_ATHLETES: Athlete[] = [
  {
    id: 'atl-1',
    name: 'Tomás Exemplo',
    sportSlug: 'futsal',
    level: 'Sub-11',
    birthDate: '2016-03-12',
    coGuardians: [],
    guardians: ['acc-socio'],
    // Ficha incompleta: falta o contacto de emergência — a confirmação da época está pendente
    details: {
      ...emptyDetails(),
      gender: 'Masculino',
      idNumber: '31234567',
      idExpiry: '2029-05-30',
      taxNumber: '258369140',
      email: 'socio@exemplo.pt',
      phone: '910000000',
      address: 'Rua do Exemplo, 10',
      postalCode: '2825-000',
      city: 'Caparica',
      shirtSize: '10A',
      shirtType: 'Normal',
      consentRgpd: true,
    },
    documents: REQUIRED_DOCS().map((d) => {
      if (d.id === 'cc-frente' || d.id === 'foto') return { ...d, status: 'Aprovado' };
      if (d.id === 'cc-verso') return { ...d, status: 'Rejeitado', note: 'Imagem desfocada. Volta a fotografar com boa luz' };
      if (d.id === 'exame') return { ...d, status: 'Rejeitado', note: 'Falta a assinatura do médico' };
      return d;
    }),
  },
  {
    id: 'atl-2',
    name: 'Inês Exemplo',
    sportSlug: 'atletismo',
    level: 'Sub-14',
    birthDate: '2013-07-02',
    coGuardians: ['avo.exemplo@exemplo.pt'],
    guardians: ['acc-socio'],
    details: {
      gender: 'Feminino',
      idNumber: '30987654',
      idExpiry: '2028-11-15',
      taxNumber: '246813571',
      email: 'socio@exemplo.pt',
      phone: '910000000',
      address: 'Rua do Exemplo, 10',
      postalCode: '2825-000',
      city: 'Caparica',
      shirtSize: 'XS',
      shirtType: 'Normal',
      emergencyName: 'Avó Exemplo',
      emergencyPhone: '920000000',
      consentRgpd: true,
      consentImage: true,
    },
    confirmedAt: '2026-09-10',
    // Pedido do encarregado à espera da secretaria (aparece no backoffice)
    pendingReview: { fields: ['Nome'], requestedAt: '2026-10-05', changes: { name: 'Inês Maria Exemplo' } },
    documents: REQUIRED_DOCS().map((d) => ({ ...d, status: 'Aprovado' as DocStatus })),
  },
  {
    // Atleta adulta: entra com o seu próprio perfil (conta 00731)
    id: 'atl-3',
    name: 'Rita Exemplo',
    sportSlug: 'atletismo',
    level: 'Veteranas I',
    birthDate: '1985-04-21',
    coGuardians: [],
    guardians: [],
    selfAccount: 'acc-rita',
    details: {
      gender: 'Feminino',
      idNumber: '12345678',
      idExpiry: '2027-02-28',
      taxNumber: '123456789',
      email: 'atleta@exemplo.pt',
      phone: '910000001',
      address: 'Avenida do Exemplo, 25, 3.º Esq.',
      postalCode: '2825-001',
      city: 'Costa da Caparica',
      shirtSize: 'S',
      shirtType: 'Alças',
      emergencyName: 'Pedro Exemplo',
      emergencyPhone: '930000000',
      consentRgpd: true,
      consentImage: true,
    },
    // Confirmou na época passada: tem de voltar a confirmar em 2026/27
    confirmedAt: '2025-10-02',
    documents: REQUIRED_DOCS()
      .filter((d) => d.id !== 'rgpd')
      .map((d) => (d.id === 'exame' ? { ...d, status: 'Em análise' as DocStatus } : { ...d, status: 'Aprovado' as DocStatus })),
  },
  {
    // Atleta adulto que NÃO é sócio (conta joao@exemplo.pt)
    id: 'atl-4',
    name: 'João Exemplo',
    sportSlug: 'atletismo',
    level: 'Seniores',
    birthDate: '1996-08-09',
    coGuardians: [],
    guardians: [],
    selfAccount: 'acc-joao',
    details: {
      gender: 'Masculino',
      idNumber: '14567890',
      idExpiry: '2031-01-20',
      taxNumber: '214365875',
      email: 'joao@exemplo.pt',
      phone: '960000000',
      address: 'Travessa do Exemplo, 3',
      postalCode: '2820-000',
      city: 'Charneca da Caparica',
      shirtSize: 'M',
      shirtType: 'Normal',
      emergencyName: 'Ana Exemplo',
      emergencyPhone: '910000002',
      consentRgpd: true,
      consentImage: false,
    },
    confirmedAt: '2026-09-20',
    documents: REQUIRED_DOCS()
      .filter((d) => d.id !== 'ficha') // não é sócio: não entrega ficha de sócio
      .map((d) => ({ ...d, status: 'Aprovado' as DocStatus })),
  },
];

const PLAN_FUTSAL = [
  'Aquecimento com bola: rondo 4×1 (10 min)',
  'Técnica: receção orientada e passe (15 min)',
  'Exercício aplicado: 3×2 em superioridade (15 min)',
  'Jogo reduzido 4×4 com regras de passe (15 min)',
  'Retorno à calma e conversa de equipa (5 min)',
];

const PLAN_ATLETISMO = [
  'Mobilidade e ativação (10 min)',
  'Técnica de corrida: skippings e saídas (15 min)',
  'Séries 6×150 m a ritmo controlado (25 min)',
  'Alongamentos e conversa de grupo (10 min)',
];

const PLAN_ESTRADA = [
  'Aquecimento: 15 min de corrida leve + mobilidade',
  'Bloco principal: 5×1000 m a ritmo de 10 km, recuperação 2 min',
  'Técnica de corrida e reforço de core (10 min)',
  'Retorno à calma (10 min)',
];

function futsal(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    athleteId: 'atl-1',
    date,
    type: 'Treino',
    title: 'Treino',
    status: 'Agendado',
    minutes: 75,
    location: 'Pavilhão do Serrado',
    rsvp: null,
    plan: PLAN_FUTSAL,
    ...extra,
  };
}

function atletismo(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    athleteId: 'atl-2',
    date,
    type: 'Treino',
    title: 'Treino',
    status: 'Agendado',
    minutes: 90,
    location: 'Centro de Treinos do Serrado',
    rsvp: null,
    plan: PLAN_ATLETISMO,
    ...extra,
  };
}

export const DEMO_SESSIONS: Session[] = [
  // Tomás — futsal Sub-11 (seg/qua/sex 18h30)
  futsal('s1', '2026-09-07T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s2', '2026-09-09T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s3', '2026-09-11T18:30', { status: 'Terminado', rsvp: 'nao-vou', attended: false }),
  futsal('s4', '2026-09-14T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s5', '2026-09-16T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s6', '2026-09-18T18:30', { status: 'Cancelado', rsvp: null, plan: undefined }),
  futsal('s7', '2026-09-21T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s8', '2026-09-26T10:00', {
    type: 'Torneio',
    title: 'Torneio de Abertura Sub-11',
    status: 'Terminado',
    minutes: 120,
    location: 'Pavilhão Municipal',
    rsvp: 'vou',
    attended: true,
    plan: undefined,
  }),
  futsal('s9', '2026-09-28T18:30', { status: 'Terminado', rsvp: null, attended: false }),
  futsal('s10', '2026-09-30T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s11', '2026-10-02T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  futsal('s12', '2026-10-05T18:30', { status: 'Cancelado', rsvp: null, plan: undefined }),
  futsal('s13', '2026-10-09T18:30'),
  futsal('s14', '2026-10-12T18:30', { rsvp: 'vou' }),
  futsal('s15', '2026-10-14T18:30'),
  futsal('s16', '2026-10-16T18:30'),
  futsal('s17', '2026-10-17T10:30', {
    type: 'Jogo',
    title: 'Serrado FC vs CD Amostra',
    minutes: 60,
    location: 'Pavilhão Municipal',
    plan: undefined,
  }),
  // Inês — atletismo Sub-14 (ter/qui 18h30)
  atletismo('t1', '2026-09-08T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t2', '2026-09-10T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t3', '2026-09-15T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t4', '2026-09-17T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t5', '2026-09-22T18:30', { status: 'Terminado', rsvp: 'nao-vou', attended: false }),
  atletismo('t6', '2026-09-24T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t7', '2026-09-28T09:30', {
    type: 'Torneio',
    title: 'Meia Maratona — prova jovem',
    status: 'Terminado',
    minutes: 60,
    location: 'Setúbal',
    rsvp: 'vou',
    attended: true,
    plan: undefined,
  }),
  atletismo('t8', '2026-10-01T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t9', '2026-10-06T18:30', { status: 'Terminado', rsvp: 'vou', attended: true }),
  atletismo('t10', '2026-10-08T18:30', { rsvp: 'vou' }),
  atletismo('t11', '2026-10-13T18:30'),
  atletismo('t12', '2026-10-15T18:30'),
  // Rita — atletismo, grupo de estrada (ter/qui 19h30 e sáb 9h00)
  ...(
    [
      ['v1', '2026-09-08T19:30', 'Terminado', 'vou', true],
      ['v2', '2026-09-12T09:00', 'Terminado', 'vou', true],
      ['v3', '2026-09-15T19:30', 'Terminado', 'nao-vou', false],
      ['v4', '2026-09-19T09:00', 'Terminado', 'vou', true],
      ['v5', '2026-09-22T19:30', 'Terminado', 'vou', true],
      ['v6', '2026-09-26T09:00', 'Terminado', 'vou', true],
      ['v7', '2026-09-29T19:30', 'Terminado', 'vou', true],
      ['v8', '2026-10-03T09:00', 'Terminado', 'vou', true],
      ['v9', '2026-10-06T19:30', 'Terminado', 'vou', false],
      ['v10', '2026-10-08T19:30', 'Agendado', null, undefined],
      ['v11', '2026-10-10T09:00', 'Agendado', null, undefined],
    ] as const
  ).map(([id, date, status, rsvp, attended]) =>
    atletismo(id, date, {
      athleteId: 'atl-3',
      status,
      rsvp,
      attended,
      minutes: date.endsWith('09:00') ? 75 : 60,
      location: date.endsWith('09:00') ? 'Parque da Paz' : 'Centro de Treinos do Serrado',
      plan: PLAN_ESTRADA,
    }),
  ),
  // João — atletismo, grupo de estrada
  atletismo('j1', '2026-10-01T19:30', { athleteId: 'atl-4', status: 'Terminado', rsvp: 'vou', attended: true, minutes: 60, plan: PLAN_ESTRADA }),
  atletismo('j2', '2026-10-06T19:30', { athleteId: 'atl-4', status: 'Terminado', rsvp: 'vou', attended: true, minutes: 60, plan: PLAN_ESTRADA }),
  atletismo('j3', '2026-10-08T19:30', { athleteId: 'atl-4', minutes: 60, plan: PLAN_ESTRADA }),
  atletismo('j4', '2026-10-13T19:30', { athleteId: 'atl-4', minutes: 60, plan: PLAN_ESTRADA }),
  atletismo('v12', '2026-11-08T09:30', {
    athleteId: 'atl-3',
    type: 'Jogo',
    title: '7º GP São Martinho de Almada',
    minutes: 60,
    location: 'Almada',
    plan: undefined,
  }),
];

/** Métricas técnicas 0–100 do atleta vs média (anónima) do escalão. */
export const DEMO_METRICS: Record<string, Metric[]> = {
  'atl-1': [
    { label: 'Passe', athlete: 72, average: 64 },
    { label: 'Receção', athlete: 58, average: 61 },
    { label: 'Condução', athlete: 81, average: 66 },
    { label: 'Remate', athlete: 49, average: 55 },
    { label: 'Leitura de jogo', athlete: 67, average: 59 },
  ],
  'atl-3': [
    { label: 'Resistência aeróbia', athlete: 78, average: 66 },
    { label: 'Ritmo de prova', athlete: 71, average: 63 },
    { label: 'Força', athlete: 58, average: 60 },
    { label: 'Técnica de corrida', athlete: 69, average: 61 },
  ],
  'atl-2': [
    { label: 'Velocidade', athlete: 77, average: 62 },
    { label: 'Resistência', athlete: 69, average: 64 },
    { label: 'Técnica de corrida', athlete: 74, average: 60 },
    { label: 'Saltos', athlete: 55, average: 58 },
  ],
};

export const DEMO_ASSESSMENTS: Record<string, Assessment[]> = {
  'atl-3': [
    {
      moment: 'Início de época',
      date: '2026-09-16',
      results: [
        { test: 'Teste de Cooper (12 min)', value: '2 650 m' },
        { test: '3000 m', value: '13:12' },
        { test: 'Prancha', value: '1:45' },
      ],
    },
    { moment: 'Meio de época', results: [] },
    { moment: 'Fim de época', results: [] },
  ],
  'atl-1': [
    {
      moment: 'Início de época',
      date: '2026-09-14',
      results: [
        { test: 'Velocidade 20 m', value: '4,12 s' },
        { test: 'Salto horizontal', value: '1,48 m' },
        { test: 'Agilidade (teste T)', value: '12,9 s' },
        { test: 'Resistência (vaivém)', value: 'Patamar 5' },
      ],
    },
    { moment: 'Meio de época', results: [] },
    { moment: 'Fim de época', results: [] },
  ],
  'atl-2': [
    {
      moment: 'Início de época',
      date: '2026-09-15',
      results: [
        { test: 'Velocidade 40 m', value: '6,35 s' },
        { test: '1000 m', value: '3:58' },
        { test: 'Salto em comprimento', value: '4,02 m' },
      ],
    },
    { moment: 'Meio de época', results: [] },
    { moment: 'Fim de época', results: [] },
  ],
};

export const DEMO_RECEIPTS: AthleteReceipt[] = [
  { id: 'r1', athleteId: 'atl-1', number: 'R2026/0388', period: 'Setembro 2026', description: 'Mensalidade Futsal Sub-11', amount: 25, date: '2026-09-05' },
  { id: 'r2', athleteId: 'atl-1', number: 'R2026/0301', period: 'Época 2026/27', description: 'Inscrição anual (seguro, kit de treino, federação)', amount: 60, date: '2026-08-28' },
  { id: 'r3', athleteId: 'atl-1', number: 'R2026/0421', period: 'Outubro 2026', description: 'Mensalidade Futsal Sub-11', amount: 25, date: '2026-10-03' },
  { id: 'r4', athleteId: 'atl-2', number: 'R2026/0390', period: 'Setembro 2026', description: 'Mensalidade Atletismo Sub-14', amount: 20, date: '2026-09-05' },
  { id: 'r6', athleteId: 'atl-3', number: 'R2026/0395', period: 'Época 2026/27', description: 'Inscrição no Troféu de Almada (dorsal com chip e t-shirt)', amount: 15, date: '2026-09-06' },
  { id: 'r7', athleteId: 'atl-3', number: 'R2026/0430', period: 'Outubro 2026', description: 'Mensalidade Atletismo — grupo de estrada', amount: 20, date: '2026-10-04' },
  { id: 'r5', athleteId: 'atl-2', number: 'R2026/0422', period: 'Outubro 2026', description: 'Mensalidade Atletismo Sub-14', amount: 20, date: '2026-10-03' },
];

// ---------------------------------------------------------------------------
// Resultados no Troféu Almada em Atletismo — FICTÍCIOS (mesma estrutura dos
// resultados oficiais; distâncias reais de cada regulamento).
// ---------------------------------------------------------------------------
type R = [season: string, round: number, race: string, raceBase: string, date: string, category: string, place: number, time: string, distanceM: number, points: number];

function results(athleteId: string, rows: R[]): CompetitionResult[] {
  return rows.map(([season, round, race, raceBase, date, category, place, time, distanceM, trophyPoints], i) => ({
    id: `${athleteId}-r${i + 1}`,
    athleteId,
    season,
    round,
    race,
    raceBase,
    date,
    category,
    place,
    time,
    distanceM,
    trophyPoints,
  }));
}

const CAP = 'Troféu da Caparica';
const SMA = 'GP São Martinho de Almada';
const CHA = 'GPA Charneca da Caparica';
const RDS = 'Corta-Mato Rui Duarte Silva';
const MIL = 'Milha Urbana Alberto Chaíça';
const EGA = 'Corrida Egas Moniz';
const REI = 'Corrida Noturna dos Reis';

export const DEMO_RESULTS: CompetitionResult[] = [
  ...results('atl-2', [
    ['2023/2024', 1, 'Troféu da Caparica 2023', CAP, '2023-11-19', 'Benjamins B', 6, '2:21.40', 600, 5],
    ['2023/2024', 2, '29º GPA Charneca da Caparica', CHA, '2024-03-24', 'Benjamins B', 5, '2:16.85', 600, 6],
    ['2023/2024', 4, '5º Corta-Mato Rui Duarte Silva', RDS, '2024-05-12', 'Benjamins B', 4, '2:05.10', 500, 7],
    ['2023/2024', 6, 'Corrida da Egas Moniz', EGA, '2024-05-26', 'Benjamins B', 3, '2:14.02', 600, 8],
    ['2024/2025', 1, 'Troféu da Caparica 2024', CAP, '2024-11-17', 'Infantis', 9, '4:02.33', 1000, 2],
    ['2024/2025', 2, '5º GP São Martinho de Almada', SMA, '2024-11-24', 'Infantis', 7, '3:58.70', 1000, 4],
    ['2024/2025', 4, '30º GPA Charneca da Caparica', CHA, '2025-03-16', 'Infantis', 6, '3:55.12', 1000, 5],
    ['2024/2025', 7, '8ª Milha Urbana Alberto Chaíça', MIL, '2025-05-03', 'Infantis', 5, '3:05.48', 800, 6],
    ['2024/2025', 9, 'Corrida Egas Moniz 2025', EGA, '2025-06-08', 'Infantis', 4, '3:49.90', 1000, 7],
    ['2025/2026', 1, '6º GP São Martinho de Almada', SMA, '2025-11-09', 'Infantis', 4, '3:44.25', 1000, 7],
    ['2025/2026', 2, 'Troféu da Caparica 2025', CAP, '2025-11-16', 'Infantis', 3, '3:47.61', 1000, 8],
    ['2025/2026', 3, '1ª Corrida Noturna dos Reis', REI, '2026-01-17', 'Infantis', 2, '2:12.08', 600, 9],
    ['2025/2026', 4, '31º GPA Charneca da Caparica', CHA, '2026-03-15', 'Infantis', 3, '3:38.44', 1000, 8],
    ['2025/2026', 6, '9ª Milha Urbana Alberto Chaíça', MIL, '2026-05-03', 'Infantis', 2, '2:54.30', 800, 9],
    ['2025/2026', 8, '3ª Corrida Egas Moniz', EGA, '2026-05-24', 'Infantis', 2, '3:35.19', 1000, 9],
  ]),
  ...results('atl-4', [
    ['2025/2026', 2, 'Troféu da Caparica 2025', 'Troféu da Caparica', '2025-11-16', 'Seniores', 18, '33:52.40', 8000, 1],
    ['2025/2026', 4, '31º GPA Charneca da Caparica', 'GPA Charneca da Caparica', '2026-03-15', 'Seniores', 15, '32:10.85', 7800, 1],
    ['2025/2026', 8, '3ª Corrida Egas Moniz', 'Corrida Egas Moniz', '2026-05-24', 'Seniores', 12, '28:41.06', 7000, 1],
  ]),
  ...results('atl-3', [
    ['2023/2024', 2, '29º GPA Charneca da Caparica', CHA, '2024-03-24', 'Veteranas I', 14, '41:20.15', 7800, 1],
    ['2023/2024', 4, '5º Corta-Mato Rui Duarte Silva', RDS, '2024-05-12', 'Veteranas I', 9, '20:45.80', 4000, 2],
    ['2023/2024', 6, 'Corrida da Egas Moniz', EGA, '2024-05-26', 'Veteranas I', 11, '48:10.42', 9000, 1],
    ['2024/2025', 1, 'Troféu da Caparica 2024', CAP, '2024-11-17', 'Veteranas I', 10, '47:05.66', 9000, 1],
    ['2024/2025', 2, '5º GP São Martinho de Almada', SMA, '2024-11-24', 'Veteranas I', 8, '30:12.09', 5850, 3],
    ['2024/2025', 4, '30º GPA Charneca da Caparica', CHA, '2025-03-16', 'Veteranas I', 7, '39:50.27', 7800, 4],
    ['2024/2025', 9, 'Corrida Egas Moniz 2025', EGA, '2025-06-08', 'Veteranas I', 6, '46:20.73', 9000, 5],
    ['2025/2026', 1, '6º GP São Martinho de Almada', SMA, '2025-11-09', 'Veteranas I', 5, '29:05.31', 5850, 6],
    ['2025/2026', 2, 'Troféu da Caparica 2025', CAP, '2025-11-16', 'Veteranas I', 6, '41:10.88', 8000, 5],
    ['2025/2026', 4, '31º GPA Charneca da Caparica', CHA, '2026-03-15', 'Veteranas I', 4, '38:15.02', 7800, 7],
    ['2025/2026', 6, '9ª Milha Urbana Alberto Chaíça', MIL, '2026-05-03', 'Veteranas I', 3, '7:05.64', 1609, 8],
    ['2025/2026', 8, '3ª Corrida Egas Moniz', EGA, '2026-05-24', 'Veteranas I', 3, '35:40.17', 7000, 8],
  ]),
];

export const CLUB_DOWNLOADS = [
  { id: 'ficha', title: 'Ficha de sócio', text: 'Preencher, assinar e carregar em «Os Meus Atletas».' },
  { id: 'rgpd', title: 'Declaração RGPD', text: 'Autorização de tratamento de dados e imagem do atleta.' },
  { id: 'exame', title: 'Modelo de exame médico (IPDJ)', text: 'Levar ao médico para preencher e assinar.' },
  { id: 'regulamento', title: 'Regulamento interno da formação', text: 'Regras, assiduidade, equipamento e comportamento.' },
];
