import { readFileSync } from 'node:fs';

/** Configuração por variáveis de ambiente (com valores de desenvolvimento). */
const env = process.env;

function required(name: string, devDefault: string, minLength = 0): string {
  const v = env[name];
  if (env['NODE_ENV'] === 'production') {
    if (!v) throw new Error(`Falta a variável de ambiente ${name}`);
    if (v.length < minLength) throw new Error(`${name} tem de ter pelo menos ${minLength} caracteres`);
  }
  return v || devDefault;
}

export const config = {
  production: env['NODE_ENV'] === 'production',
  databaseUrl: required('DATABASE_URL', 'postgres://serrado:serrado@localhost:5432/serrado'),
  /** Segredo partilhado middleware → backend */
  serviceToken: required('SERVICE_TOKEN', 'dev-service-token-change-me', 32),
  /** Segredo de assinatura das sessões (JWT) */
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret-change-me-please-32chars', 32),
  backendUrl: env['BACKEND_URL'] ?? 'http://localhost:4100',
  /** Endereço onde os serviços escutam: 0.0.0.0 em Docker; 127.0.0.1 no servidor (só o Caddy lhes chega) */
  host: env['HOST'] ?? '0.0.0.0',
  /**
   * Proxies em que o middleware confia para o IP do cliente (X-Forwarded-For): «true» em Docker/dev;
   * no servidor, «loopback» (o Caddy, que já resolve o IP real, incluindo atrás da Cloudflare).
   */
  trustProxy: env['TRUST_PROXY'] === undefined || env['TRUST_PROXY'] === 'true' ? true : env['TRUST_PROXY'],
  backendPort: Number(env['BACKEND_PORT'] ?? 4100),
  middlewarePort: Number(env['MIDDLEWARE_PORT'] ?? 4000),
  /** Origens do front autorizadas (CORS), separadas por vírgula */
  corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:4200,https://brunommpereira.github.io').split(',').map((s) => s.trim()),
  sessionHours: Number(env['SESSION_HOURS'] ?? 8),
  /**
   * SameSite do cookie de sessão. «strict» (omissão): site e API no mesmo domínio (VPS).
   * Só com o site e a API em domínios diferentes é preciso «none» (e HTTPS).
   */
  sessionSameSite: (['strict', 'lax', 'none'].includes(env['SESSION_SAMESITE'] ?? '') ? env['SESSION_SAMESITE'] : 'strict') as 'strict' | 'lax' | 'none',
  /** Pedidos por minuto e por IP em toda a API pública (o login e o carregamento de imagens têm limites próprios) */
  rateLimitMax: Number(env['RATE_LIMIT_MAX'] ?? 300),
  /** Versão instalada (ficheiro REVISION do artefacto de deploy); o deploy confirma que é esta que responde */
  version: readVersion(),
};

export const ROLES = ['admin', 'editor', 'secretaria', 'treinador'] as const;
export type Role = (typeof ROLES)[number];

function readVersion(): string {
  try {
    return readFileSync(new URL('../../REVISION', import.meta.url), 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
}
