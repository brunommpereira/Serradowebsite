# Serviços — middleware, backend e base de dados

Separação de responsabilidades e diagrama em [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

Python 3.12+ com **FastAPI** (os dois serviços), **psycopg 3** (PostgreSQL, SQL direto), **nh3** (limpeza do HTML do CMS), **PyJWT** (sessão e `id_token` da Google/Microsoft) e **httpx**. Dependências geridas com [uv](https://docs.astral.sh/uv/) (`pyproject.toml` + `uv.lock`).

| Pasta | O que é | Porta |
|---|---|---|
| `serrado/middleware/` | **API pública** `/api/v1`, consumida pelo front: sessão, papéis, validação, rate limit, CORS, cache, agregação e entrada com Google/Microsoft | 4000 (`/api/docs`) |
| `serrado/backend/` | **API interna** `/internal/v1`, com as regras de negócio e o acesso à base de dados. Só aceita pedidos do middleware | 4100 (`/internal/docs`, só em dev) |
| `serrado/db/` | Migrações SQL (`migrations/`, PostgreSQL 16), seed de demonstração, conteúdo inicial e conta de administração | 5432 |
| `serrado/payments/` | Pagamentos online (Stripe), mensalidades e faturas-recibo (Moloni ON) | — |
| `serrado/facebook.py` | Sincronização da página de Facebook com as notícias e os eventos (timer de 15 min no servidor) | — |
| `serrado/*.py` | Configuração, passwords (scrypt), limpeza de HTML e validações (NIF, CC…) | — |
| `tests/` | Testes de integração (pytest) contra PostgreSQL real | — |
| `openapi/` | Contratos das duas APIs (gerados) | — |

## Desenvolvimento

```bash
docker compose -f ../docker-compose.yml -f ../docker-compose.dev.yml up -d db   # PostgreSQL em localhost:5432
uv sync                                   # cria .venv com as dependências (inclui as de desenvolvimento)
uv run python -m serrado.db.migrate       # aplica serrado/db/migrations/*.sql (cada uma numa transação)
uv run python -m serrado.db.seed          # dados de demonstração (APAGA o conteúdo!)
uv run python -m serrado.backend.server   # http://localhost:4100/internal/docs
uv run python -m serrado.middleware.server  # http://localhost:4000/api/docs
uv run pytest                             # 95 testes de integração com PostgreSQL real
uv run ruff check serrado tests && uv run ruff format --check serrado tests
uv run mypy                               # tipos
uv run python -m serrado.openapi          # regenera openapi/backend.json e openapi/middleware.json
```

Os testes criam bases de dados próprias a partir de `TEST_DATABASE_URL` (por omissão `postgresql://serrado:serrado@localhost:5432/serrado_test`).

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
| `DATABASE_URL` | backend, migrações | `postgresql://user:pass@host:5432/db` (no servidor, pelo socket local e sem password) |
| `SERVICE_TOKEN` | backend + middleware | Segredo longo e aleatório, partilhado pelos dois serviços (32 caracteres ou mais, obrigatório em produção) |
| `JWT_SECRET` | middleware | Segredo da sessão (32 caracteres ou mais, obrigatório em produção) |
| `BACKEND_URL` | middleware | Endereço interno do backend |
| `CORS_ORIGINS` | middleware | Origens do site, por exemplo `https://www.serradofc.pt` |
| `HOST` | backend, middleware | Endereço onde escutam (`0.0.0.0` em Docker; `127.0.0.1` no servidor) |
| `TRUST_PROXY` | middleware | Proxies de confiança para o IP do cliente (`loopback` no servidor, atrás do Caddy) |
| `SESSION_SAMESITE` | middleware | `strict` por omissão (site e API no mesmo domínio). `none` só se ficarem em domínios diferentes |
| `RATE_LIMIT_MAX` | middleware | Pedidos por minuto e por IP em toda a API (por omissão 300) |
| `PUBLIC_URL` | middleware | Endereço do site, por exemplo `https://www.serradofc.pt`. Necessário para entrar com Google/Microsoft |
| `SITE_URL` | middleware | Para onde se volta depois de entrar com Google/Microsoft (por omissão `PUBLIC_URL`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | middleware | Ativam «Continuar com Google» (ver docs/DEPLOY-VPS.md) |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | middleware | Ativam «Continuar com Microsoft» (só contas pessoais) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | backend | Pagamentos online (Stripe Checkout); sem elas, os pagamentos ficam desligados |
| `PAYMENT_METHODS` | backend | Métodos no Checkout (omissão `card,mb_way,multibanco`) |
| `MOLONI_API_KEY`, `MOLONI_COMPANY_ID`, `MOLONI_DOCUMENT_SET_ID` | recibos | Faturas-recibo no Moloni ON (`python -m serrado.payments receipts`) |
| `MOLONI_PRODUCTS`, `MOLONI_PAYMENT_METHODS` | recibos | Artigos (`quota:ID,futsal:ID,rugby:ID`) e métodos de pagamento (`card:ID,mb_way:ID,multibanco:ID`) do Moloni |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` | sincronização | Página de Facebook → notícias e eventos (`python -m serrado.facebook sync`; ver docs/DEPLOY-VPS.md, 5c) |
| `FACEBOOK_SYNC_MODE` | sincronização | `publish` (omissão: entra logo no site) ou `draft` (fica em rascunho) |
| `FACEBOOK_SYNC_TAG` | sincronização | Opcional: só importa publicações com esta hashtag (ex.: `site`) |
| `FACEBOOK_GRAPH_VERSION` | sincronização | Versão da Graph API (omissão `v25.0`) |
| `APP_ENV=production` | todos | Torna obrigatórias as variáveis acima, ativa os cookies `Secure` e esconde `/internal/docs` |

## Importar dados reais

1. **Atletas:** gerar `athletes.csv` com `tools/trofeu-almada/consolidate.py --import-dir` e carregá-lo assim:
   `psql "$DATABASE_URL" -c "\copy athletes (code,name,gender,birth_date,id_number,tax_number,email,phone,address,sport_slug,category,shirt_size) from 'athletes.csv' csv header"`
2. **Resultados do Troféu de Almada:** no backoffice, em **Resultados → Importar**, escolher o `results.csv`. A importação é idempotente.
3. **Acessos:** associar cada conta aos seus atletas na tabela `athlete_access` (encarregado → educandos; atleta → o próprio).

## Pôr em produção

**Numa VPS** (a opção escolhida para começar): [`docs/DEPLOY-VPS.md`](../docs/DEPLOY-VPS.md).

- **Instalação nativa, sem Docker** (`deploy/server/`): PostgreSQL 16 só local, Python 3.12, serviços systemd, Caddy e Cloudflare.
- **Dependências:** cada versão leva as bibliotecas já descarregadas no GitHub Actions (com hashes); a VPS instala-as num ambiente próprio da versão, sem aceder ao PyPI.
- **Cópias de segurança:** pg_dump e restic cifrado.
- **Deploy:** orquestrado pelo GitHub Actions, com verificação da versão e rollback automático.
- **Docker:** o `docker-compose.yml` fica só para desenvolvimento.

Criar a primeira conta de administração (`uv run python -m serrado.db.create_admin email "Nome"`; no servidor: `sudo serrado admin …`) e carregar o conteúdo inicial do site, sem dados pessoais (`python -m serrado.db.content`; no servidor: `sudo serrado content`).

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
