import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiClient } from '../api/api-client';
import { SITE_DEFAULTS } from './site-defaults';
import { BlockKey, BlockRevision, BlockState, SiteData } from './site.models';

const STORAGE_KEY = 'sfc.site.v1';

interface DemoState {
  blocks: Record<string, { data: Record<string, unknown>; updatedAt: string; updatedBy: string }>;
  revisions: { key: string; rev: BlockRevision; data: Record<string, unknown> | null }[];
  seq: number;
}

/**
 * Conteúdos do site com estrutura própria (contactos, clube, loja, jogos…).
 *
 * - Modo API: carrega os blocos editados ao arrancar (GET /content/blocks).
 * - Modo demonstração: as edições ficam no localStorage de quem edita (só conteúdo público
 *   de demonstração, sem dados pessoais).
 *
 * `data(key)` junta o bloco editado ao conteúdo original campo a campo: um campo que falte
 * (por exemplo, acrescentado numa versão nova do site) mostra o valor original.
 */
@Injectable({ providedIn: 'root' })
export class SiteStore {
  private readonly api = inject(ApiClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly demo = signal<DemoState>(this.restore());
  private readonly fromApi = signal<Record<string, Record<string, unknown>>>({});

  data<K extends BlockKey>(key: K): SiteData[K] {
    const edited = this.api.enabled ? this.fromApi()[key] : this.demo().blocks[key]?.data;
    const base = SITE_DEFAULTS[key];
    if (!edited) return base;
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(edited)) if (k in base && v !== undefined) out[k] = v;
    return out as unknown as SiteData[K];
  }

  async loadFromApi() {
    if (!this.api.enabled) return;
    try {
      this.fromApi.set(
        await this.api.get<Record<string, Record<string, unknown>>>('/content/blocks'),
      );
    } catch (e) {
      console.warn('[Site] Conteúdos indisponíveis:', (e as Error).message);
    }
  }

  /** Depois de gravar no backoffice (modo API), o site passa logo a mostrar a versão nova. */
  applyFromApi(key: string, data: Record<string, unknown> | null) {
    const next = { ...this.fromApi() };
    if (data) next[key] = data;
    else delete next[key];
    this.fromApi.set(next);
  }

  // ---------------------------------------------------------------- modo demonstração
  demoGet(key: string): BlockState {
    const b = this.demo().blocks[key];
    return {
      key,
      data: b?.data ?? null,
      updatedAt: b?.updatedAt ?? null,
      updatedBy: b?.updatedBy ?? null,
    };
  }

  demoSave(key: string, data: Record<string, unknown> | null, author: string): BlockState {
    const st = this.demo();
    const now = new Date().toISOString();
    const blocks = { ...st.blocks };
    if (data) blocks[key] = { data, updatedAt: now, updatedBy: author };
    else delete blocks[key];
    const seq = st.seq + 1;
    const rev: BlockRevision = { id: seq, createdAt: now, author, original: !data };
    this.persist({ blocks, revisions: [{ key, rev, data }, ...st.revisions].slice(0, 200), seq });
    return this.demoGet(key);
  }

  demoRevisions(key: string): BlockRevision[] {
    return this.demo()
      .revisions.filter((r) => r.key === key)
      .map((r) => r.rev);
  }

  demoRestore(key: string, rev: number, author: string): BlockState {
    const found = this.demo().revisions.find((r) => r.key === key && r.rev.id === rev);
    if (!found) throw new Error('Versão não encontrada');
    return this.demoSave(key, found.data, author);
  }

  private persist(st: DemoState) {
    this.demo.set(st);
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch {
      throw new Error('Sem espaço no browser para guardar (modo demonstração).');
    }
  }

  private restore(): DemoState {
    const empty: DemoState = { blocks: {}, revisions: [], seq: 0 };
    if (!this.isBrowser || this.api.enabled) return empty;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DemoState) : empty;
    } catch {
      return empty;
    }
  }
}
