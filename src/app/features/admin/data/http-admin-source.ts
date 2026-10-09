import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { CmsStore } from '../../../core/cms/cms-store';
import { CmsEntry, CmsRevision, CmsType } from '../../../core/cms/cms.models';
import { RoleDef } from '../../../core/permissions';
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

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

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

  async mediaList(q?: string) {
    return (await this.api.get<Omit<MediaItem, 'url'>[]>('/admin/media', { q })).map((m) => this.withUrl(m));
  }
  async mediaUpload(img: PreparedImage) {
    const m = await this.api.post<Omit<MediaItem, 'url'>>('/admin/media', { name: img.name, data: img.base64, alt: img.alt, width: img.width, height: img.height });
    return this.withUrl(m);
  }
  async mediaUpdate(id: number, alt: string) {
    return this.withUrl(await this.api.patch<Omit<MediaItem, 'url'>>(`/admin/media/${id}`, { alt }));
  }
  mediaUsage(id: number) {
    return this.api.get<MediaUsage[]>(`/admin/media/${id}/usage`);
  }
  async mediaDelete(id: number) {
    await this.api.delete(`/admin/media/${id}`);
  }
  /** Endereço público: /api/v1/media/<chave>.<ext> (relativo ao endereço da API) */
  private withUrl(m: Omit<MediaItem, 'url'>): MediaItem {
    return { ...m, url: `${this.api.baseUrl}/media/${m.key}.${EXT[m.mime] ?? 'img'}` };
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
  async setRoles(id: string, roles: string[]) {
    await this.api.put(`/admin/users/${id}/roles`, { roles });
  }
  createUser(user: NewAdminUser) {
    return this.api.post<{ id: string; invited: boolean }>('/admin/users', user);
  }
  async invite(id: string) {
    await this.api.post(`/admin/users/${id}/invite`);
  }
  roles() {
    return this.api.get<RoleDef[]>('/admin/roles');
  }
  async saveRole(role: RoleDef, isNew: boolean) {
    const body = { name: role.name, description: role.description, permissions: role.permissions };
    if (isNew) await this.api.post('/admin/roles', { key: role.key, ...body });
    else await this.api.put(`/admin/roles/${role.key}`, body);
  }
  async deleteRole(key: string) {
    await this.api.delete(`/admin/roles/${key}`);
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
