import { config } from '../../shared/config.ts';

/** Utilizador autenticado (vem do JWT de sessão). */
export interface Session {
  sub: string;
  name: string;
  roles: string[];
}

export interface BackendResponse<T = unknown> {
  status: number;
  body: T;
}

export class BackendError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`backend ${status}`);
    this.status = status;
    this.body = body;
  }
}

type Transport = (req: { method: string; path: string; headers: Record<string, string>; body?: unknown }) => Promise<BackendResponse>;

/** Transporte HTTP real (produção): fetch para o backend na rede interna. */
export const httpTransport: Transport = async ({ method, path, headers, body }) => {
  let res: Response;
  try {
    res = await fetch(config.backendUrl + path, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BackendError(502, { error: 'backend_unavailable', message: 'Serviço temporariamente indisponível' });
  }
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

/**
 * Cliente do backend: junta o token de serviço e o contexto do utilizador
 * (X-Actor-Id / X-Actor-Roles) a cada pedido.
 */
export class BackendClient {
  private readonly transport: Transport;
  constructor(transport: Transport = httpTransport) {
    this.transport = transport;
  }

  async call<T = unknown>(method: string, path: string, opts: { actor?: Session | null; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
    const qs = opts.query
      ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
      : '';
    const res = await this.transport({
      method,
      path: '/internal/v1' + path + (qs === '?' ? '' : qs),
      headers: {
        authorization: `Bearer ${config.serviceToken}`,
        'x-actor-id': opts.actor?.sub ?? '',
        'x-actor-roles': (opts.actor?.roles ?? []).join(','),
      },
      body: opts.body,
    });
    if (res.status >= 400) throw new BackendError(res.status, res.body);
    return res.body as T;
  }
}
