import { CmsEntry, CmsRevision, CmsType } from '../../../core/cms/cms.models';
import { StaffRole } from '../../../core/models';

/**
 * Contrato de dados do backoffice. Duas implementações:
 * - HttpAdminSource → middleware /api/v1/admin/… (produção)
 * - DemoAdminSource → dados locais do browser (GitHub Pages / demonstração)
 * Os ecrãs só conhecem esta interface.
 */
export interface AdminStats {
  newsPublished: number;
  newsDrafts: number;
  eventsUpcoming: number;
  otherDrafts: number;
  athletes: number;
  athletesToConfirm: number;
  documentsToReview: number;
  changeRequests: number;
  membersActive: number;
  results: number;
  season: string;
}

export interface AuditEntry {
  id: number | string;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
  actor: string | null;
}

export interface IdentityRequest {
  id: number | string;
  athleteId: string;
  athleteName: string;
  athleteCode: string;
  changes: Record<string, string>;
  current: Record<string, string | null>;
  requestedAt: string;
  requestedBy: string | null;
}

export interface DocumentToReview {
  id: number | string;
  kind: string;
  status: string;
  note: string | null;
  updatedAt: string;
  athleteId: string;
  athleteName: string;
  athleteCode: string;
}

export interface Dashboard {
  user: { name: string; roles: string[] };
  stats: AdminStats;
  activity: AuditEntry[];
  attention: { requests: IdentityRequest[]; documents: DocumentToReview[] };
}

export interface AdminAthlete {
  id: string;
  code: string;
  name: string;
  birthDate: string;
  sportSlug: string;
  category: string;
  confirmed: boolean;
  confirmedAt: string | null;
  docsApproved: number;
  docsTotal: number;
  docsToReview: number;
  pendingRequests: number;
}

export interface AdminAthleteDetail extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  access: string;
  confirmed: boolean;
  missing: string[];
  documents: { id: number | string; kind: string; status: string; note: string | null }[];
  pendingRequests: { id: number | string; changes: Record<string, string>; requestedAt: string }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: StaffRole[];
  member: { memberNumber: string } | null;
}

export interface ImportRow {
  athleteCode: string | null;
  athleteName: string;
  birthYear: number | null;
  season: string;
  round: number;
  race: string;
  raceBase: string;
  raceDate: string;
  category: string;
  place: number | null;
  bib: string | null;
  time: string | null;
  timeS: number | null;
  distanceM: number | null;
  trophyPoints: number | null;
  teamPoints: number | null;
  sourceUrl: string | null;
}

export interface ImportSummary {
  rows: number;
  inserted: number;
  updated: number;
  linked: number;
  unlinked: number;
  races: number;
}

export type CmsAction = 'publish' | 'unpublish' | 'archive';

/** Imagem da biblioteca do CMS. */
export interface MediaItem {
  id: number;
  key: string;
  name: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  createdAt: string;
  uploadedByName: string | null;
  /** endereço a usar no site (texto e capas) */
  url: string;
}

/** Imagem já reduzida e convertida no browser, pronta a enviar. */
export interface PreparedImage {
  name: string;
  mime: string;
  /** conteúdo em base64 (sem o prefixo data:) */
  base64: string;
  width: number;
  height: number;
  alt: string;
}

export interface MediaUsage {
  type: string;
  id: number;
  title: string;
}

export abstract class AdminSource {
  abstract readonly mode: 'demo' | 'api';
  abstract dashboard(): Promise<Dashboard>;

  abstract cmsList(type: CmsType, filter: { status?: string; q?: string }): Promise<{ items: CmsEntry[]; total: number }>;
  abstract cmsGet(type: CmsType, id: number): Promise<CmsEntry>;
  abstract cmsCreate(type: CmsType, data: Record<string, unknown>): Promise<CmsEntry>;
  abstract cmsUpdate(type: CmsType, id: number, data: Record<string, unknown>): Promise<CmsEntry>;
  abstract cmsStatus(type: CmsType, id: number, action: CmsAction): Promise<CmsEntry>;
  abstract cmsDelete(type: CmsType, id: number): Promise<void>;
  abstract cmsRevisions(type: CmsType, id: number): Promise<CmsRevision[]>;
  abstract cmsRestore(type: CmsType, id: number, revision: number): Promise<CmsEntry>;

  abstract mediaList(q?: string): Promise<MediaItem[]>;
  abstract mediaUpload(img: PreparedImage): Promise<MediaItem>;
  abstract mediaUpdate(id: number, alt: string): Promise<MediaItem>;
  abstract mediaUsage(id: number): Promise<MediaUsage[]>;
  abstract mediaDelete(id: number): Promise<void>;
  /** Dimensão máxima (px) a que o browser reduz as imagens antes de as enviar. */
  readonly mediaMaxSize: number = 1920;

  abstract athletes(filter: { q?: string; sport?: string; pending?: string }): Promise<AdminAthlete[]>;
  abstract athlete(id: string): Promise<AdminAthleteDetail>;
  abstract changeRequests(): Promise<IdentityRequest[]>;
  abstract resolveChange(id: number | string, approve: boolean, note?: string): Promise<void>;
  abstract documents(): Promise<DocumentToReview[]>;
  abstract reviewDocument(id: number | string, approve: boolean, note?: string): Promise<void>;

  abstract importResults(rows: ImportRow[]): Promise<ImportSummary>;
  abstract users(): Promise<AdminUser[]>;
  abstract setRoles(id: string, roles: StaffRole[]): Promise<void>;
  abstract audit(): Promise<AuditEntry[]>;
}

export const DOC_LABELS: Record<string, string> = {
  'cc-frente': 'Identificação (frente)',
  'cc-verso': 'Identificação (verso)',
  foto: 'Fotografia',
  rgpd: 'Declaração RGPD',
  exame: 'Exame médico',
  ficha: 'Ficha de sócio',
};

export const FIELD_LABELS: Record<string, string> = { name: 'Nome', birthDate: 'Data de nascimento', gender: 'Género', idNumber: 'N.º CC', taxNumber: 'NIF' };
