/** Configuração por variáveis de ambiente (com valores de desenvolvimento). */
const env = process.env;

function required(name: string, devDefault: string): string {
  const v = env[name];
  if (v) return v;
  if (env['NODE_ENV'] === 'production') throw new Error(`Falta a variável de ambiente ${name}`);
  return devDefault;
}

export const config = {
  production: env['NODE_ENV'] === 'production',
  databaseUrl: required('DATABASE_URL', 'postgres://serrado:serrado@localhost:5432/serrado'),
  /** Segredo partilhado middleware → backend */
  serviceToken: required('SERVICE_TOKEN', 'dev-service-token-change-me'),
  /** Segredo de assinatura das sessões (JWT) */
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret-change-me-please-32chars'),
  backendUrl: env['BACKEND_URL'] ?? 'http://localhost:4100',
  backendPort: Number(env['BACKEND_PORT'] ?? 4100),
  middlewarePort: Number(env['MIDDLEWARE_PORT'] ?? 4000),
  /** Origens do front autorizadas (CORS), separadas por vírgula */
  corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:4200,https://brunommpereira.github.io').split(',').map((s) => s.trim()),
  sessionHours: Number(env['SESSION_HOURS'] ?? 8),
};

export const ROLES = ['admin', 'editor', 'secretaria', 'treinador'] as const;
export type Role = (typeof ROLES)[number];
