/** Cache em memória com expiração (conteúdo público). Invalidada quando o CMS publica. */
export class TtlCache {
  private readonly store = new Map<string, { at: number; value: unknown }>();
  private readonly ttlMs: number;
  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    const value = await load();
    this.store.set(key, { at: Date.now(), value });
    return value;
  }

  /** Apaga as entradas cujo nome começa pelo prefixo (ou tudo). */
  invalidate(prefix = '') {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}
