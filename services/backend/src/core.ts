import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Client, Pool } from '../../shared/db.ts';
import type { Role } from '../../shared/config.ts';

/** Quem faz o pedido: o middleware envia o id (X-Actor-Id); os papéis vêm da base de dados. */
export interface Actor {
  id: string | null;
  roles: Role[];
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
  interface FastifyInstance {
    pool: Pool;
  }
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} não encontrado`);
export const forbidden = () => new HttpError(403, 'forbidden', 'Sem permissão para esta operação');

export function hasRole(req: FastifyRequest, ...roles: Role[]) {
  return req.actor.roles.some((r) => r === 'admin' || roles.includes(r));
}

export function requireRole(req: FastifyRequest, ...roles: Role[]) {
  if (!hasRole(req, ...roles)) throw forbidden();
}

export function requireUser(req: FastifyRequest): string {
  if (!req.actor.id) throw new HttpError(401, 'unauthenticated', 'Sessão necessária');
  return req.actor.id;
}

/** Regista uma escrita no audit_log (na mesma transação). */
export async function audit(c: Client | Pool, actor: Actor, action: string, entity: string, entityId: string | number | null, details: object = {}) {
  await c.query('insert into audit_log (actor_id, action, entity, entity_id, details) values ($1, $2, $3, $4, $5)', [
    actor.id,
    action,
    entity,
    entityId === null ? null : String(entityId),
    details,
  ]);
}

/** snake_case (BD) → camelCase (API) */
export function camel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v])) as T;
}

export const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

export type Reply = FastifyReply;
