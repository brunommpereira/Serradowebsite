# Serviços — middleware, backend e base de dados

Separação de responsabilidades e diagrama em [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

| Pasta | O que é | Porta |
|---|---|---|
| `middleware/` | **API pública** `/api/v1`, consumida pelo front: sessão, papéis, validação, rate limit, CORS, cache e agregação | 4000 (`/api/docs`) |
| `backend/` | **API interna** `/internal/v1`, com as regras de negócio e o acesso à base de dados. Só aceita pedidos do middleware | 4100 (`/internal/docs`, só em dev) |
| `db/` | Migrações SQL (PostgreSQL 16) e seed de demonstração | 5432 |
| `shared/` | Configuração, hash de passwords, ligação à BD e validações (NIF, CC…) | — |

Usa Node 22.18 ou superior. O TypeScript corre diretamente, sem build, porque o Node remove os tipos. Dependências: Fastify, `pg` e `@fastify/*` (cookie, cors, jwt, rate-limit, swagger).

## Desenvolvimento

```bash
docker compose -f ../docker-compose.yml -f ../docker-compose.dev.yml up -d db   # PostgreSQL em localhost:5432
npm ci
npm run db:migrate          # aplica db/migrations/*.sql (cada uma numa transação)
npm run db:seed             # dados de demonstração (APAGA o conteúdo!)
npm run backend             # http://localhost:4100/internal/docs
npm run middleware          # http://localhost:4000/api/docs
npm test                    # 51 testes de integração com PostgreSQL real
npm run typecheck
npm run openapi             # regenera backend/openapi.json e middleware/openapi.json
```

Para ligar o front: em `src/app/core/api/api.config.ts`, `API_BASE_URL_VALUE = 'http://localhost:4000/api/v1'`, e depois `npm start` na raiz.

Também se pode subir tudo com Docker: `docker compose up --build` na raiz (inclui migrações e seed).

### Contas de demonstração (seed)

| Conta | Password | Perfil |
|---|---|---|
| `socio@exemplo.pt` / `00482` | `serrado1978` | sócio + encarregado |
| `atleta@exemplo.pt` / `00731` | `atleta2026` | sócia + atleta |
| `joao@exemplo.pt` | `atleta2026` | atleta (não sócio) |
| `admin@serradofc.pt` | `admin2026` | backoffice: admin |
| `editor@serradofc.pt` | `editor2026` | backoffice: editor (CMS) |
| `secretaria@serradofc.pt` | `secretaria2026` | backoffice: secretaria |
| `treinador@serradofc.pt` | `treinador2026` | backoffice: treinador |

## Variáveis de ambiente

| Variável | Serviço | Notas |
|---|---|---|
| `DATABASE_URL` | backend, migrações | `postgres://user:pass@host:5432/db` (usar TLS em produção) |
| `SERVICE_TOKEN` | backend + middleware | Segredo longo e aleatório, partilhado pelos dois serviços (32 caracteres ou mais, obrigatório em produção) |
| `JWT_SECRET` | middleware | Segredo da sessão (32 caracteres ou mais, obrigatório em produção) |
| `BACKEND_URL` | middleware | Endereço interno do backend |
| `CORS_ORIGINS` | middleware | Origens do site, por exemplo `https://www.serradofc.pt` |
| `HOST` | backend, middleware | Endereço onde escutam (`0.0.0.0` em Docker; `127.0.0.1` no servidor) |
| `TRUST_PROXY` | middleware | Proxies de confiança para o IP do cliente (`loopback` no servidor, atrás do Caddy) |
| `SESSION_SAMESITE` | middleware | `strict` por omissão (site e API no mesmo domínio). `none` só se ficarem em domínios diferentes |
| `RATE_LIMIT_MAX` | middleware | Pedidos por minuto e por IP em toda a API (por omissão 300) |
| `NODE_ENV=production` | todos | Torna obrigatórias as variáveis acima e ativa os cookies `Secure` |

## Importar dados reais

1. **Atletas:** gerar `athletes.csv` com `tools/trofeu-almada/consolidate.py --import-dir` e carregá-lo assim:
   `psql "$DATABASE_URL" -c "\copy athletes (code,name,gender,birth_date,id_number,tax_number,email,phone,address,sport_slug,category,shirt_size) from 'athletes.csv' csv header"`
2. **Resultados do Troféu de Almada:** no backoffice, em **Resultados → Importar**, escolher o `results.csv`. A importação é idempotente.
3. **Acessos:** associar cada conta aos seus atletas na tabela `athlete_access` (encarregado → educandos; atleta → o próprio).

## Pôr em produção

**Numa VPS** (a opção escolhida para começar): [`docs/DEPLOY-VPS.md`](../docs/DEPLOY-VPS.md).

- **Instalação nativa, sem Docker** (`deploy/server/`): PostgreSQL 16 só local, serviços systemd, Caddy e Cloudflare.
- **Cópias de segurança:** pg_dump e restic cifrado.
- **Deploy:** orquestrado pelo GitHub Actions, com verificação da versão e rollback automático.
- **Docker:** o `docker-compose.yml` fica só para desenvolvimento.

Criar a primeira conta de administração (`npm run db:create-admin -- email "Nome"`; no servidor: `sudo serrado admin …`) e carregar o conteúdo inicial do site, sem dados pessoais (`npm run db:content`).

Outras opções:

- **Base de dados:** PostgreSQL gerido na **região UE**, com backups automáticos (Supabase, Neon, Azure Database for PostgreSQL, RDS…) ou o `docker compose` num servidor do clube.
- **Serviços:** a mesma imagem `services/Dockerfile` serve os dois, com comandos diferentes. Podem correr em qualquer serviço de containers (Fly.io, Render, Railway, Azure Container Apps, um VPS…).
  - O **backend** fica numa rede privada, sem porta pública.
  - O **middleware** fica atrás de HTTPS.
- **Domínio:** de preferência, site e API no mesmo domínio (`www.serradofc.pt` e `api.serradofc.pt`). Assim o cookie de sessão é *same-site* e não depende de cookies de terceiros, que os browsers estão a bloquear.
- **Seed:** nunca correr o seed de demonstração em produção (no docker compose, `DEMO_SEED=0`).

## RGPD

- A base de dados tem dados de menores e dados sensíveis (CC, NIF, morada).
  - Só a secretaria e os administradores os veem.
  - O treinador recebe as fichas sem esses campos.
- Os dados de identificação só mudam através de pedidos aprovados pela secretaria. Um trigger na base de dados garante isto.
- Todas as escritas ficam em `audit_log`.
- As exportações (`.xlsx`, `.csv`) nunca vão para o repositório (estão no `.gitignore`).
