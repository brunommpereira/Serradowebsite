import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { CmsStore } from '../../../core/cms/cms-store';
import { CmsEntry, CmsRevision, CmsType } from '../../../core/cms/cms.models';
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

/** Backoffice ligado ao middleware (/api/v1/admin/…). */
@Injectable()
export class HttpAdminSource extends AdminSource {
  readonly mode = 'api' as const;
  private readonly api = inject(ApiClient);
  private readonly cms = inject(CmsStore);

  dashboard() {
    return this.api.get<Dashboard>('/admin/dashboard');
  }

  cmsList(type: CmsType, filter: { status?: string; q?: string }) {
    return this.api.get<{ items: CmsEntry[]; total: number }>(`/admin/cms/${type}`, { ...filter, limit: 200 });
  }
  cmsGet(type: CmsType, id: number) {
    return this.api.get<CmsEntry>(`/admin/cms/${type}/${id}`);
  }
  async cmsCreate(type: CmsType, data: Record<string, unknown>) {
    return this.refresh(await this.api.post<CmsEntry>(`/admin/cms/${type}`, data));
  }
  async cmsUpdate(type: CmsType, id: number, data: Record<string, unknown>) {
    return this.refresh(await this.api.put<CmsEntry>(`/admin/cms/${type}/${id}`, data));
  }
  async cmsStatus(type: CmsType, id: number, action: CmsAction) {
    return this.refresh(await this.api.post<CmsEntry>(`/admin/cms/${type}/${id}/${action}`));
  }
  async cmsDelete(type: CmsType, id: number) {
    await this.api.delete(`/admin/cms/${type}/${id}`);
    await this.cms.loadFromApi(true);
  }
  cmsRevisions(type: CmsType, id: number) {
    return this.api.get<CmsRevision[]>(`/admin/cms/${type}/${id}/revisions`);
  }
  async cmsRestore(type: CmsType, id: number, revision: number) {
    return this.refresh(await this.api.post<CmsEntry>(`/admin/cms/${type}/${id}/revisions/${revision}/restore`));
  }

  athletes(filter: { q?: string; sport?: string; pending?: string }) {
    return this.api.get<AdminAthlete[]>('/admin/athletes', filter);
  }
  athlete(id: string) {
    return this.api.get<AdminAthleteDetail>(`/admin/athletes/${id}`);
  }
  changeRequests() {
    return this.api.get<IdentityRequest[]>('/admin/change-requests');
  }
  async resolveChange(id: number | string, approve: boolean, note?: string) {
    await this.api.post(`/admin/change-requests/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { note });
  }
  documents() {
    return this.api.get<DocumentToReview[]>('/admin/documents');
  }
  async reviewDocument(id: number | string, approve: boolean, note?: string) {
    await this.api.post(`/admin/documents/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { note });
  }

  importResults(rows: ImportRow[]) {
    return this.api.post<ImportSummary>('/admin/results/import', { rows });
  }
  users() {
    return this.api.get<AdminUser[]>('/admin/users');
  }
  async setRoles(id: string, roles: StaffRole[]) {
    await this.api.put(`/admin/users/${id}/roles`, { roles });
  }
  audit() {
    return this.api.get<AuditEntry[]>('/admin/audit', { limit: 200 });
  }

  /** Depois de escrever no CMS, atualiza o conteúdo que o site mostra. */
  private async refresh<T>(out: T): Promise<T> {
    await this.cms.loadFromApi(true);
    return out;
  }
}
