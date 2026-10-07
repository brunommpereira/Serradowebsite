import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AthleteAreaService } from '../../../core/services/athlete-area.service';
import { CmsStore } from '../../../core/cms/cms-store';
import { CMS_TYPES, CmsEntry, CmsType } from '../../../core/cms/cms.models';
import { Athlete, CURRENT_SEASON } from '../../../core/data/athletes-data';
import { StaffRole } from '../../../core/models';
import {
  AdminAthlete,
  AdminAthleteDetail,
  AdminSource,
  AdminUser,
  AuditEntry,
  CmsAction,
  Dashboard,
  DocumentToReview,
  IdentityRequest,
  ImportRow,
  ImportSummary,
} from './admin-source';

const AUDIT_KEY = 'sfc.audit.v1';
const ROLES_KEY = 'sfc.roles.v1';
const SENSITIVE = ['idNumber', 'idExpiry', 'taxNumber', 'address', 'postalCode'];

/**
 * Backoffice em MODO DEMONSTRAÇÃO: as mesmas operações que a API, sobre os
 * dados locais (CMS, atletas) e com auditoria guardada no browser.
 */
@Injectable()
export class DemoAdminSource extends AdminSource {
  readonly mode = 'demo' as const;
  private readonly auth = inject(AuthService);
  private readonly area = inject(AthleteAreaService);
  private readonly cms = inject(CmsStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private get actor() {
    return this.auth.account()?.name ?? 'Desconhecido';
  }

  private guard(...roles: StaffRole[]) {
    if (!this.auth.hasRole(...roles)) throw new Error('Sem permissão para esta operação');
  }

  async dashboard(): Promise<Dashboard> {
    this.guard('editor', 'secretaria', 'treinador');
    const athletes = this.area.allAthletes();
    const now = new Date().toISOString().slice(0, 16);
    const isSec = this.auth.hasRole('secretaria');
    const requests = isSec ? await this.changeRequests() : [];
    const documents = isSec ? await this.documents() : [];
    return {
      user: { name: this.actor, roles: this.auth.roles() },
      stats: {
        newsPublished: this.cms.entries('news').filter((e) => e.status === 'published').length,
        newsDrafts: this.cms.entries('news').filter((e) => e.status === 'draft').length,
        eventsUpcoming: this.cms.entries('events').filter((e) => e.status === 'published' && String(e['startsAt']) >= now).length,
        otherDrafts: (['events', 'pages', 'partners'] as CmsType[]).reduce((n, t) => n + this.cms.entries(t).filter((e) => e.status === 'draft').length, 0),
        athletes: athletes.length,
        athletesToConfirm: athletes.filter((a) => !this.area.isConfirmed(a)).length,
        documentsToReview: athletes.reduce((n, a) => n + a.documents.filter((d) => d.status === 'Em análise').length, 0),
        changeRequests: athletes.filter((a) => a.pendingReview).length,
        membersActive: 2,
        results: 0,
        season: CURRENT_SEASON.label,
      },
      activity: (await this.audit()).slice(0, 8),
      attention: { requests: requests.slice(0, 5), documents: documents.slice(0, 5) },
    };
  }

  // ---------------------------------------------------------------- CMS
  async cmsList(type: CmsType, filter: { status?: string; q?: string }) {
    this.guard('editor');
    const q = (filter.q ?? '').toLowerCase();
    const titleKey = CMS_TYPES[type].titleKey;
    const items = this.cms
      .entries(type)
      .filter((e) => !filter.status || e.status === filter.status)
      .filter((e) => !q || `${e[titleKey]} ${e['summary'] ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.publishedAt ?? b.updatedAt).localeCompare(String(a.publishedAt ?? a.updatedAt)));
    return { items, total: items.length };
  }

  async cmsGet(type: CmsType, id: number) {
    this.guard('editor');
    const e = this.cms.entries(type).find((x) => x.id === id);
    if (!e) throw new Error('Conteúdo não encontrado');
    return e;
  }

  async cmsCreate(type: CmsType, data: Record<string, unknown>) {
    this.guard('editor');
    const e = this.cms.demoSave(type, data, this.actor);
    this.log(`cms.${type}.create`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsUpdate(type: CmsType, id: number, data: Record<string, unknown>) {
    this.guard('editor');
    const e = this.cms.demoSave(type, data, this.actor, id);
    this.log(`cms.${type}.update`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsStatus(type: CmsType, id: number, action: CmsAction) {
    this.guard('editor');
    const e = this.cms.demoSetStatus(type, id, action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'draft');
    this.log(`cms.${type}.${action}`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsDelete(type: CmsType, id: number) {
    this.guard('editor');
    const e = await this.cmsGet(type, id);
    this.cms.demoRemove(type, id);
    this.log(`cms.${type}.delete`, CMS_TYPES[type].label, e);
  }

  async cmsRevisions(type: CmsType, id: number) {
    this.guard('editor');
    return this.cms.demoRevisions(type, id);
  }

  async cmsRestore(type: CmsType, id: number, revision: number) {
    this.guard('editor');
    const e = this.cms.demoRestore(type, id, revision, this.actor);
    this.log(`cms.${type}.restore`, CMS_TYPES[type].label, e);
    return e;
  }

  // ---------------------------------------------------------------- atletas
  async athletes(filter: { q?: string; sport?: string; pending?: string }): Promise<AdminAthlete[]> {
    this.guard('secretaria', 'treinador');
    const q = (filter.q ?? '').toLowerCase();
    return this.area
      .allAthletes()
      .map((a, i) => this.summary(a, i))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
      .filter((a) => !filter.sport || a.sportSlug === filter.sport)
      .filter((a) =>
        filter.pending === 'docs' ? a.docsApproved < a.docsTotal : filter.pending === 'confirm' ? !a.confirmed : filter.pending === 'requests' ? a.pendingRequests > 0 : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async athlete(id: string): Promise<AdminAthleteDetail> {
    this.guard('secretaria', 'treinador');
    const all = this.area.allAthletes();
    const i = all.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Atleta não encontrado');
    const a = all[i];
    const detail: AdminAthleteDetail = {
      ...a.details,
      id: a.id,
      code: code(i),
      name: a.name,
      birthDate: a.birthDate,
      sportSlug: a.sportSlug,
      category: a.level,
      confirmedAt: a.confirmedAt ?? null,
      access: this.auth.hasRole('secretaria') ? 'staff' : 'treinador',
      confirmed: this.area.isConfirmed(a),
      missing: this.area.missingFields(a),
      documents: a.documents.map((d) => ({ id: `${a.id}:${d.id}`, kind: d.id, status: d.status, note: d.note ?? null })),
      pendingRequests: a.pendingReview ? [{ id: a.id, changes: a.pendingReview.changes as Record<string, string>, requestedAt: a.pendingReview.requestedAt }] : [],
    };
    if (!this.auth.hasRole('secretaria')) for (const k of SENSITIVE) delete detail[k];
    return detail;
  }

  async changeRequests(): Promise<IdentityRequest[]> {
    this.guard('secretaria');
    return this.area
      .allAthletes()
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.pendingReview)
      .map(({ a, i }) => ({
        id: a.id,
        athleteId: a.id,
        athleteName: a.name,
        athleteCode: code(i),
        changes: a.pendingReview!.changes as Record<string, string>,
        current: { name: a.name, birthDate: a.birthDate, gender: a.details.gender, idNumber: a.details.idNumber, taxNumber: a.details.taxNumber },
        requestedAt: a.pendingReview!.requestedAt,
        requestedBy: a.selfAccount ? a.name : 'Encarregado de educação',
      }));
  }

  async resolveChange(id: number | string, approve: boolean, note?: string) {
    this.guard('secretaria');
    const a = this.area.allAthletes().find((x) => x.id === id);
    if (!a?.pendingReview) throw new Error('Pedido não encontrado');
    this.area.resolveChange(a.id, approve);
    this.log(`change_requests.${approve ? 'approve' : 'reject'}`, 'Atletas', null, { atleta: a.name, ...(note ? { note } : {}) });
  }

  async documents(): Promise<DocumentToReview[]> {
    this.guard('secretaria');
    return this.area.allAthletes().flatMap((a, i) =>
      a.documents
        .filter((d) => d.status === 'Em análise')
        .map((d) => ({ id: `${a.id}:${d.id}`, kind: d.id, status: d.status, note: d.note ?? null, updatedAt: '', athleteId: a.id, athleteName: a.name, athleteCode: code(i) })),
    );
  }

  async reviewDocument(id: number | string, approve: boolean, note?: string) {
    this.guard('secretaria');
    const [athleteId, docId] = String(id).split(':');
    const a = this.area.allAthletes().find((x) => x.id === athleteId);
    if (!a) throw new Error('Documento não encontrado');
    this.area.reviewDocument(athleteId, docId, approve, note);
    this.log(`documents.${approve ? 'approve' : 'reject'}`, 'Atletas', null, { atleta: a.name, documento: docId, ...(note ? { note } : {}) });
  }

  // ---------------------------------------------------------------- resultados, utilizadores, auditoria
  async importResults(rows: ImportRow[]): Promise<ImportSummary> {
    this.guard('secretaria');
    const linked = rows.filter((r) => r.athleteCode).length;
    const summary = { rows: rows.length, inserted: rows.length, updated: 0, linked, unlinked: rows.length - linked, races: new Set(rows.map((r) => `${r.season}#${r.round}`)).size };
    this.log('results.import', 'Resultados', null, summary);
    return summary;
  }

  async users(): Promise<AdminUser[]> {
    this.guard();
    const overrides = this.read<Record<string, StaffRole[]>>(ROLES_KEY, {});
    return AuthService.DEMO.map((d) => ({
      id: d.login,
      email: d.login.includes('@') ? d.login : `${d.name.split(' ')[0].toLowerCase()}@exemplo.pt`,
      name: d.name,
      roles: overrides[d.login] ?? d.roles,
      member: d.isMember ? { memberNumber: d.login } : null,
    }));
  }

  async setRoles(id: string, roles: StaffRole[]) {
    this.guard();
    if (id === this.auth.account()?.email && !roles.includes('admin')) throw new Error('Não podes retirar o teu próprio acesso de administração.');
    const overrides = this.read<Record<string, StaffRole[]>>(ROLES_KEY, {});
    this.write(ROLES_KEY, { ...overrides, [id]: roles });
    this.log('users.roles', 'Utilizadores', null, { utilizador: id, roles });
  }

  async audit(): Promise<AuditEntry[]> {
    this.guard('editor', 'secretaria', 'treinador');
    const all = this.read<AuditEntry[]>(AUDIT_KEY, []);
    return this.auth.hasRole() ? all : all.filter((l) => l.actor === this.actor);
  }

  // ---------------------------------------------------------------- utilitários
  private summary(a: Athlete, i: number): AdminAthlete {
    return {
      id: a.id,
      code: code(i),
      name: a.name,
      birthDate: a.birthDate,
      sportSlug: a.sportSlug,
      category: a.level,
      confirmed: this.area.isConfirmed(a),
      confirmedAt: a.confirmedAt ?? null,
      docsApproved: a.documents.filter((d) => d.status === 'Aprovado').length,
      docsTotal: a.documents.length,
      docsToReview: a.documents.filter((d) => d.status === 'Em análise').length,
      pendingRequests: a.pendingReview ? 1 : 0,
    };
  }

  private log(action: string, entity: string, e: CmsEntry | null, details: Record<string, unknown> = {}) {
    const all = this.read<AuditEntry[]>(AUDIT_KEY, []);
    const entry: AuditEntry = {
      id: Date.now(),
      at: new Date().toISOString(),
      action,
      entity,
      entityId: e ? String(e.id) : null,
      details: e ? { titulo: e['title'] ?? e['name'], slug: e.slug, ...details } : details,
      actor: this.actor,
    };
    this.write(AUDIT_KEY, [entry, ...all].slice(0, 300));
  }

  private read<T>(key: string, fallback: T): T {
    if (!this.isBrowser) return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sem armazenamento */
    }
  }
}

const code = (i: number) => `SFC-${String(i + 1).padStart(4, '0')}`;
