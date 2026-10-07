// Define o endereço da API (middleware) antes do build do front: `node scripts/set-api-url.mjs /api/v1`.
// Sem argumento (ou vazio), o front fica em modo demonstração. Usado no build da VPS (deploy/web.Dockerfile).
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/app/core/api/api.config.ts';
const url = process.argv[2] ?? '';
if (/['\\\n]/.test(url)) throw new Error(`Endereço da API inválido: ${url}`);
const src = readFileSync(file, 'utf8');
const pattern = /export const API_BASE_URL_VALUE = '[^']*';/;
if (!pattern.test(src)) throw new Error(`Não encontrei API_BASE_URL_VALUE em ${file}`);
writeFileSync(file, src.replace(pattern, `export const API_BASE_URL_VALUE = '${url}';`));
console.log(`API_BASE_URL_VALUE = '${url}'${url ? '' : ' (modo demonstração)'}`);
