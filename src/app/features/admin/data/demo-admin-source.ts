import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AthleteAreaService } from '../../../core/services/athlete-area.service';
import { CmsStore } from '../../../core/cms/cms-store';
import { CMS_TYPES, CmsEntry, CmsType } from '../../../core/cms/cms.models';
import { Athlete, CURRENT_SEASON } from '../../../core/data/athletes-data';
import {
  ADMIN_ROLE,
  ALL_PERMISSIONS,
  demoRoles,
  Permission,
  RoleDef,
  saveDemoRoles,
} from '../../../core/permissions';
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
  MediaItem,
  MediaUsage,
  NewAdminUser,
  PreparedImage,
} from './admin-source';

const AUDIT_KEY = 'sfc.audit.v1';
const ROLES_KEY = 'sfc.roles.v1';
const USERS_KEY = 'sfc.users.v1';
const MEDIA_KEY = 'sfc.media.v1';
const SENSITIVE = ['idNumber', 'idExpiry', 'taxNumber', 'address', 'postalCode'];

/**
 * Backoffice em MODO DEMONSTRAÇÃO: as mesmas operações que a API, sobre os
 * dados locais (CMS, atletas) e com auditoria guardada no browser.
 */
@Injectable()
export class DemoAdminSource extends AdminSource {
  readonly mode = 'demo' as const;
  // No browser há pouco espaço (localStorage): imagens mais pequenas
  override readonly mediaMaxSize = 1280;
  private readonly auth = inject(AuthService);
  private readonly area = inject(AthleteAreaService);
  private readonly cms = inject(CmsStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private get actor() {
    return this.auth.account()?.name ?? 'Desconhecido';
  }

  /** Sem argumentos: basta ser da equipa (ter alguma permissão). */
  private guard(...permissions: Permission[]) {
    if (!this.auth.can(...permissions)) throw new Error('Sem permissão para esta operação');
  }

  async dashboard(): Promise<Dashboard> {
    this.guard();
    const athletes = this.area.allAthletes();
    const now = new Date().toISOString().slice(0, 16);
    const isSec = this.auth.can('athletes.manage');
    const requests = isSec ? await this.changeRequests() : [];
    const documents = isSec ? await this.documents() : [];
    return {
      user: { name: this.actor, roles: this.auth.roles(), permissions: this.auth.permissions() },
      stats: {
        newsPublished: this.cms.entries('news').filter((e) => e.status === 'published').length,
        newsDrafts: this.cms.entries('news').filter((e) => e.status === 'draft').length,
        eventsUpcoming: this.cms
          .entries('events')
          .filter((e) => e.status === 'published' && String(e['startsAt']) >= now).length,
        otherDrafts: (['events', 'pages', 'partners'] as CmsType[]).reduce(
          (n, t) => n + this.cms.entries(t).filter((e) => e.status === 'draft').length,
          0,
        ),
        athletes: athletes.length,
        athletesToConfirm: athletes.filter((a) => !this.area.isConfirmed(a)).length,
        documentsToReview: athletes.reduce(
          (n, a) => n + a.documents.filter((d) => d.status === 'Em análise').length,
          0,
        ),
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
    this.guard('cms.edit');
    const q = (filter.q ?? '').toLowerCase();
    const titleKey = CMS_TYPES[type].titleKey;
    const items = this.cms
      .entries(type)
      .filter((e) => !filter.status || e.status === filter.status)
      .filter((e) => !q || `${e[titleKey]} ${e['summary'] ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) =>
        String(b.publishedAt ?? b.updatedAt).localeCompare(String(a.publishedAt ?? a.updatedAt)),
      );
    return { items, total: items.length };
  }

  async cmsGet(type: CmsType, id: number) {
    this.guard('cms.edit');
    const e = this.cms.entries(type).find((x) => x.id === id);
    if (!e) throw new Error('Conteúdo não encontrado');
    return e;
  }

  async cmsCreate(type: CmsType, data: Record<string, unknown>) {
    this.guard('cms.edit');
    const e = this.cms.demoSave(type, data, this.actor);
    this.log(`cms.${type}.create`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsUpdate(type: CmsType, id: number, data: Record<string, unknown>) {
    this.guard('cms.edit');
    const e = this.cms.demoSave(type, data, this.actor, id);
    this.log(`cms.${type}.update`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsStatus(type: CmsType, id: number, action: CmsAction) {
    this.guard('cms.edit');
    const e = this.cms.demoSetStatus(
      type,
      id,
      action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'draft',
    );
    this.log(`cms.${type}.${action}`, CMS_TYPES[type].label, e);
    return e;
  }

  async cmsDelete(type: CmsType, id: number) {
    this.guard('cms.edit');
    const e = await this.cmsGet(type, id);
    this.cms.demoRemove(type, id);
    this.log(`cms.${type}.delete`, CMS_TYPES[type].label, e);
  }

  async cmsRevisions(type: CmsType, id: number) {
    this.guard('cms.edit');
    return this.cms.demoRevisions(type, id);
  }

  async cmsRestore(type: CmsType, id: number, revision: number) {
    this.guard('cms.edit');
    const e = this.cms.demoRestore(type, id, revision, this.actor);
    this.log(`cms.${type}.restore`, CMS_TYPES[type].label, e);
    return e;
  }

  // ---------------------------------------------------------------- atletas
  async athletes(filter: {
    q?: string;
    sport?: string;
    pending?: string;
  }): Promise<AdminAthlete[]> {
    this.guard('athletes.view', 'athletes.manage');
    const q = (filter.q ?? '').toLowerCase();
    return this.area
      .allAthletes()
      .map((a, i) => this.summary(a, i))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
      .filter((a) => !filter.sport || a.sportSlug === filter.sport)
      .filter((a) =>
        filter.pending === 'docs'
          ? a.docsApproved < a.docsTotal
          : filter.pending === 'confirm'
            ? !a.confirmed
            : filter.pending === 'requests'
              ? a.pendingRequests > 0
              : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async athlete(id: string): Promise<AdminAthleteDetail> {
    this.guard('athletes.view', 'athletes.manage');
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
      access: this.auth.can('athletes.manage') ? 'staff' : 'treinador',
      confirmed: this.area.isConfirmed(a),
      missing: this.area.missingFields(a),
      documents: a.documents.map((d) => ({
        id: `${a.id}:${d.id}`,
        kind: d.id,
        status: d.status,
        note: d.note ?? null,
      })),
      pendingRequests: a.pendingReview
        ? [
            {
              id: a.id,
              changes: a.pendingReview.changes as Record<string, string>,
              requestedAt: a.pendingReview.requestedAt,
            },
          ]
        : [],
    };
    if (!this.auth.can('athletes.sensitive')) for (const k of SENSITIVE) delete detail[k];
    return detail;
  }

  async changeRequests(): Promise<IdentityRequest[]> {
    this.guard('athletes.manage');
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
        current: {
          name: a.name,
          birthDate: a.birthDate,
          gender: a.details.gender,
          idNumber: a.details.idNumber,
          taxNumber: a.details.taxNumber,
        },
        requestedAt: a.pendingReview!.requestedAt,
        requestedBy: a.selfAccount ? a.name : 'Encarregado de educação',
      }));
  }

  async resolveChange(id: number | string, approve: boolean, note?: string) {
    this.guard('athletes.manage');
    const a = this.area.allAthletes().find((x) => x.id === id);
    if (!a?.pendingReview) throw new Error('Pedido não encontrado');
    this.area.resolveChange(a.id, approve);
    this.log(`change_requests.${approve ? 'approve' : 'reject'}`, 'Atletas', null, {
      atleta: a.name,
      ...(note ? { note } : {}),
    });
  }

  async documents(): Promise<DocumentToReview[]> {
    this.guard('athletes.manage');
    return this.area
      .allAthletes()
      .flatMap((a, i) =>
        a.documents
          .filter((d) => d.status === 'Em análise')
          .map((d) => ({
            id: `${a.id}:${d.id}`,
            kind: d.id,
            status: d.status,
            note: d.note ?? null,
            updatedAt: '',
            athleteId: a.id,
            athleteName: a.name,
            athleteCode: code(i),
          })),
      );
  }

  async reviewDocument(id: number | string, approve: boolean, note?: string) {
    this.guard('athletes.manage');
    const [athleteId, docId] = String(id).split(':');
    const a = this.area.allAthletes().find((x) => x.id === athleteId);
    if (!a) throw new Error('Documento não encontrado');
    this.area.reviewDocument(athleteId, docId, approve, note);
    this.log(`documents.${approve ? 'approve' : 'reject'}`, 'Atletas', null, {
      atleta: a.name,
      documento: docId,
      ...(note ? { note } : {}),
    });
  }

  // ---------------------------------------------------------------- resultados, utilizadores, auditoria
  async importResults(rows: ImportRow[]): Promise<ImportSummary> {
    this.guard('results.import');
    const linked = rows.filter((r) => r.athleteCode).length;
    const summary = {
      rows: rows.length,
      inserted: rows.length,
      updated: 0,
      linked,
      unlinked: rows.length - linked,
      races: new Set(rows.map((r) => `${r.season}#${r.round}`)).size,
    };
    this.log('results.import', 'Resultados', null, summary);
    return summary;
  }

  async users(): Promise<AdminUser[]> {
    this.guard('users.manage');
    const overrides = this.read<Record<string, string[]>>(ROLES_KEY, {});
    const demo: AdminUser[] = AuthService.DEMO.map((d) => ({
      id: d.login,
      email: d.login.includes('@') ? d.login : `${d.name.split(' ')[0].toLowerCase()}@exemplo.pt`,
      name: d.name,
      roles: d.roles,
      member: d.isMember ? { memberNumber: d.login } : null,
    }));
    const extra = this.read<AdminUser[]>(USERS_KEY, []);
    return [...demo, ...extra].map((u) => ({ ...u, roles: overrides[u.id] ?? u.roles }));
  }

  async createUser(user: NewAdminUser) {
    this.guard('users.manage');
    const email = user.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido.');
    if ((await this.users()).some((u) => u.email === email))
      throw new Error('Já existe uma conta com este email. Procura-a na lista e muda os papéis.');
    const created: AdminUser = {
      id: email,
      email,
      name: user.name.trim().replace(/\s+/g, ' '),
      roles: user.roles,
      member: null,
    };
    this.write(USERS_KEY, [...this.read<AdminUser[]>(USERS_KEY, []), created]);
    this.log('users.create', 'Utilizadores', null, { utilizador: email, roles: user.roles });
    return { id: email, invited: false };
  }

  async setRoles(id: string, roles: string[]) {
    this.guard('users.manage');
    if (id === this.auth.account()?.email && !roles.includes(ADMIN_ROLE))
      throw new Error('Não podes retirar o teu próprio acesso de administração.');
    const known = new Set(demoRoles().map((r) => r.key));
    if (roles.some((r) => !known.has(r))) throw new Error('Papel desconhecido');
    const overrides = this.read<Record<string, string[]>>(ROLES_KEY, {});
    this.write(ROLES_KEY, { ...overrides, [id]: roles });
    this.log('users.roles', 'Utilizadores', null, { utilizador: id, roles });
  }

  async invite(id: string) {
    this.guard('users.manage', 'members.manage', 'athletes.manage');
    this.log('users.invite', 'Utilizadores', null, { utilizador: id });
  }

  async roles(): Promise<RoleDef[]> {
    this.guard('users.manage');
    const users = await this.users();
    return demoRoles().map((r) => ({
      ...r,
      permissions: r.key === ADMIN_ROLE ? [...ALL_PERMISSIONS] : r.permissions,
      users: users.filter((u) => u.roles.includes(r.key)).length,
    }));
  }

  async saveRole(role: RoleDef, isNew: boolean) {
    this.guard('users.manage');
    const list = demoRoles();
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(role.key))
      throw new Error('Identificador inválido: letras minúsculas, números e hífens.');
    if (isNew && list.some((r) => r.key === role.key))
      throw new Error('Já existe um papel com esse identificador.');
    if (!isNew && !list.some((r) => r.key === role.key)) throw new Error('Papel não encontrado');
    const clean: RoleDef = {
      key: role.key,
      name: role.name.trim(),
      description: role.description.trim(),
      builtin: isNew ? false : (list.find((r) => r.key === role.key)?.builtin ?? false),
      permissions:
        role.key === ADMIN_ROLE
          ? [...ALL_PERMISSIONS]
          : ALL_PERMISSIONS.filter((p) => role.permissions.includes(p)),
    };
    saveDemoRoles(isNew ? [...list, clean] : list.map((r) => (r.key === role.key ? clean : r)));
    this.log(isNew ? 'roles.create' : 'roles.update', 'Papéis', null, {
      papel: role.key,
      permissions: clean.permissions,
    });
  }

  async deleteRole(key: string) {
    this.guard('users.manage');
    const list = demoRoles();
    const role = list.find((r) => r.key === key);
    if (!role) throw new Error('Papel não encontrado');
    if (role.builtin)
      throw new Error('Os papéis de origem não se apagam; podes mudar as permissões.');
    saveDemoRoles(list.filter((r) => r.key !== key));
    const overrides = this.read<Record<string, string[]>>(ROLES_KEY, {});
    this.write(
      ROLES_KEY,
      Object.fromEntries(
        Object.entries(overrides).map(([u, rs]) => [u, rs.filter((r) => r !== key)]),
      ),
    );
    this.log('roles.delete', 'Papéis', null, { papel: key });
  }

  async audit(): Promise<AuditEntry[]> {
    this.guard();
    const all = this.read<AuditEntry[]>(AUDIT_KEY, []);
    return this.auth.can('audit.all') ? all : all.filter((l) => l.actor === this.actor);
  }

  // ---------------------------------------------------------------- imagens (guardadas no browser)
  async mediaList(q?: string) {
    this.guard('cms.edit');
    const term = (q ?? '').toLowerCase();
    return this.read<MediaItem[]>(MEDIA_KEY, []).filter(
      (m) => !term || m.name.toLowerCase().includes(term) || m.alt.toLowerCase().includes(term),
    );
  }

  async mediaUpload(img: PreparedImage) {
    this.guard('cms.edit');
    const all = this.read<MediaItem[]>(MEDIA_KEY, []);
    const item: MediaItem = {
      id: Math.max(0, ...all.map((m) => m.id)) + 1,
      key: crypto.randomUUID(),
      name: img.name,
      mime: img.mime,
      sizeBytes: Math.round((img.base64.length * 3) / 4),
      width: img.width,
      height: img.height,
      alt: img.alt.trim(),
      createdAt: new Date().toISOString(),
      uploadedByName: this.actor,
      url: `data:${img.mime};base64,${img.base64}`,
    };
    try {
      localStorage.setItem(MEDIA_KEY, JSON.stringify([item, ...all]));
    } catch {
      throw new Error(
        'Sem espaço no browser para mais imagens (modo demonstração). Apaga algumas ou usa o site com servidor.',
      );
    }
    this.log('cms.media.upload', 'Imagens', null, { nome: item.name });
    return item;
  }

  async mediaUpdate(id: number, alt: string) {
    this.guard('cms.edit');
    const all = this.read<MediaItem[]>(MEDIA_KEY, []);
    const item = all.find((m) => m.id === id);
    if (!item) throw new Error('Imagem não encontrada');
    item.alt = alt.trim();
    this.write(MEDIA_KEY, all);
    return item;
  }

  async mediaUsage(id: number): Promise<MediaUsage[]> {
    this.guard('cms.edit');
    const item = this.read<MediaItem[]>(MEDIA_KEY, []).find((m) => m.id === id);
    if (!item) return [];
    return (['news', 'events', 'pages'] as CmsType[]).flatMap((type) =>
      this.cms
        .entries(type)
        .filter((e) => String(e['body'] ?? '').includes(item.url) || e['coverUrl'] === item.url)
        .map((e) => ({ type, id: e.id, title: String(e['title']) })),
    );
  }

  async mediaDelete(id: number) {
    const used = await this.mediaUsage(id);
    if (used.length)
      throw new Error(`A imagem está a ser usada em: ${used.map((u) => u.title).join(', ')}`);
    const all = this.read<MediaItem[]>(MEDIA_KEY, []);
    const item = all.find((m) => m.id === id);
    this.write(
      MEDIA_KEY,
      all.filter((m) => m.id !== id),
    );
    this.log('cms.media.delete', 'Imagens', null, { nome: item?.name });
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

  private log(
    action: string,
    entity: string,
    e: CmsEntry | null,
    details: Record<string, unknown> = {},
  ) {
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
