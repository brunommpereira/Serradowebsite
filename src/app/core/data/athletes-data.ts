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
    documents: REQUIRED_DOCS().map((d) => {
      if (d.id === 'cc-frente' || d.id === 'foto') return { ...d, status: 'Aprovado' };
      if (d.id === 'cc-verso') return { ...d, status: 'Rejeitado', note: 'Imagem desfocada. Volta a fotografar com boa luz.' };
      if (d.id === 'exame') return { ...d, status: 'Rejeitado', note: 'Falta a assinatura do médico.' };
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
    documents: REQUIRED_DOCS().map((d) => ({ ...d, status: 'Aprovado' as DocStatus })),
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
  'atl-2': [
    { label: 'Velocidade', athlete: 77, average: 62 },
    { label: 'Resistência', athlete: 69, average: 64 },
    { label: 'Técnica de corrida', athlete: 74, average: 60 },
    { label: 'Saltos', athlete: 55, average: 58 },
  ],
};

export const DEMO_ASSESSMENTS: Record<string, Assessment[]> = {
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
  { id: 'r5', athleteId: 'atl-2', number: 'R2026/0422', period: 'Outubro 2026', description: 'Mensalidade Atletismo Sub-14', amount: 20, date: '2026-10-03' },
];

export const CLUB_DOWNLOADS = [
  { id: 'ficha', title: 'Ficha de sócio', text: 'Preencher, assinar e carregar em «Os Meus Atletas».' },
  { id: 'rgpd', title: 'Declaração RGPD', text: 'Autorização de tratamento de dados e imagem do atleta.' },
  { id: 'exame', title: 'Modelo de exame médico (IPDJ)', text: 'Levar ao médico para preencher e assinar.' },
  { id: 'regulamento', title: 'Regulamento interno da formação', text: 'Regras, assiduidade, equipamento e comportamento.' },
];
