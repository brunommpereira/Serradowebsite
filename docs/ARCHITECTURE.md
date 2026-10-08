# Arquitetura — Serrado FC Digital

Três camadas com responsabilidades separadas, e uma base de dados.

```
┌──────────────────────────┐   HTTPS + cookie de sessão   ┌───────────────────────────┐  rede interna   ┌──────────────────────────┐      ┌──────────────┐
│ FRONT (Angular)          │ ───────────────────────────▶ │ MIDDLEWARE (BFF)          │ ──────────────▶ │ BACKEND (API interna)     │ ───▶ │ PostgreSQL   │
│ src/                     │      /api/v1/…               │ services/middleware       │ /internal/v1/…  │ services/backend          │  SQL │ services/db  │
│ • site público           │                              │ • autenticação (JWT)      │ token de serviço│ • regras de negócio       │      │ • migrações  │
│ • Área de Sócio/Atletas  │                              │ • permissões por papel    │ + utilizador    │ • acesso à base de dados  │      │ • seed demo  │
│ • Backoffice /admin (CMS)│                              │ • validação, rate limit   │                 │ • transações e auditoria  │      └──────────────┘
└──────────────────────────┘                              │ • cache e agregação       │                 │ • revisões do CMS         │
       GitHub Pages                                       └───────────────────────────┘                 └──────────────────────────┘
                                                            público (Internet)                            privado (sem acesso externo)
```

## Responsabilidades

| Camada | Faz | Não faz |
|---|---|---|
| **Front** (`src/`) | Interface, navegação e validação de formulários (para a experiência do utilizador). Fala **só** com o middleware. | Não guarda segredos e não acede à base de dados. Nunca decide permissões sozinho. |
| **Middleware** (`services/middleware`) | Login e sessão (JWT em cookie `httpOnly`); papéis (`admin`, `editor`, `secretaria`, `treinador`); validação de pedidos; rate limit; CORS; cache do conteúdo público; agregação de dados para o front (por exemplo `/home`, `/me` e o dashboard). | Não tem SQL nem regras de negócio. |
| **Backend** (`services/backend`) | Regras de negócio, por exemplo: pedidos de alteração validados pela secretaria; no máximo 2 co-encarregados; confirmação de dados por época; publicação e revisões do CMS. Faz o acesso a PostgreSQL e escreve a auditoria. | Não fica exposto à Internet. Só aceita pedidos com o token de serviço do middleware. |
| **Base de dados** (`services/db`) | Esquema versionado (migrações), integridade (chaves estrangeiras e `check`) e dados de demonstração (seed). | — |

**Defesa em profundidade:** o middleware verifica o papel de quem faz o pedido. O backend volta a verificar o acesso ao nível dos dados: um encarregado só consegue ler ou alterar os seus educandos, mesmo que o middleware falhe.

## Base de dados

**PostgreSQL 16.** Opções de alojamento, todas com região UE:

| Opção | Notas |
|---|---|
| Postgres gerido (Supabase, Neon, Azure Database for PostgreSQL, AWS RDS) | Recomendado: backups automáticos e TLS. O plano gratuito chega para começar. |
| VPS (OVHcloud, Hostinger…) | PostgreSQL 16 nativo e só local, com cópias diárias e cópia externa cifrada (restic). Ver [`DEPLOY-VPS.md`](DEPLOY-VPS.md). **É a opção escolhida.** |

Tabelas principais (ver `services/db/migrations`):

- **Identidade:** `users` (uma conta por pessoa; o n.º de sócio é opcional), `user_roles`, `audit_log`.
- **Sócios:** `members`, `quotas`.
- **Atletas:** `athletes`, `athlete_access` (encarregado, co-encarregado ou atleta), `athlete_documents`, `athlete_change_requests`.
- **Competições:** `races`, `results` (Troféu de Almada).
- **CMS:** `cms_news`, `cms_events`, `cms_pages`, `cms_partners`, `cms_revisions` (histórico de versões de cada conteúdo).

## Texto rico e imagens

- **Editor visual (Tiptap):** produz HTML simples, com parágrafos, títulos, negrito, itálico, sublinhado, listas, citações, ligações e imagens.
- **Limpeza do HTML:** o backend limpa o HTML com uma lista de etiquetas permitidas (`services/shared/html.ts`) antes de o gravar. No site, o Angular volta a filtrá-lo.
- **Conteúdos antigos:** os textos simples, com parágrafos separados por linha em branco, continuam a funcionar.
- **Imagens:**
  - o browser reduz cada imagem (1920 px) e converte-a para WebP, o que apaga os dados EXIF e GPS;
  - o backend confirma o tipo real pelos primeiros bytes (JPEG, PNG, WebP ou GIF, até 5 MB);
  - as imagens ficam na tabela `cms_media` e entram nas cópias de segurança;
  - uma imagem em uso não pode ser apagada.

## APIs

- **Middleware (pública):** `services/middleware/openapi.json`, com documentação interativa em `/api/docs`.
- **Backend (interna):** `services/backend/openapi.json`, com documentação em `/internal/docs`. Só está disponível em desenvolvimento.

| Grupo | Middleware `/api/v1` | Backend `/internal/v1` |
|---|---|---|
| Sessão | `POST /auth/login`, `POST /auth/logout`, `GET /me` | `POST /auth/verify`, `GET /users/{id}` |
| Conteúdo público | `GET /content/home`, `/content/news[/{slug}]`, `/content/events[/{slug}]`, `/content/pages/{slug}`, `/content/partners` (com cache) | `GET /cms/{tipo}?status=published` |
| Área de Atletas | `GET /me/athletes`, `GET\|PATCH /athletes/{id}`, `POST /athletes/{id}/confirm`, `POST /athletes/{id}/change-requests`, `GET /athletes/{id}/results` | `GET /athletes?accessibleBy=`, `GET\|PATCH /athletes/{id}`, `POST /athletes/{id}/confirm`, `POST /athletes/{id}/change-requests`, `GET /athletes/{id}/results` |
| Área de Sócio | `GET /me/member`, `GET /me/quotas` | `GET /members/{number}`, `GET /members/{number}/quotas` |
| Backoffice: CMS | `GET\|POST /admin/cms/{tipo}`, `GET\|PUT\|DELETE /admin/cms/{tipo}/{id}`, `POST …/publish`, `POST …/unpublish`, `GET …/revisions`, `POST …/revisions/{rev}/restore` | as mesmas, em `/cms/…` |
| Backoffice: imagens | `GET\|POST /admin/media`, `PATCH\|DELETE /admin/media/{id}`, `GET /admin/media/{id}/usage` | as mesmas, em `/cms/media…` |
| Imagens públicas | `GET /media/{chave}.{ext}` (cache de 1 ano, endereço aleatório) | `GET /media/{chave}` |
| Backoffice: atletas | `GET /admin/athletes`, `GET /admin/change-requests`, `POST /admin/change-requests/{id}/approve\|reject`, `POST /admin/documents/{id}/approve\|reject` | as mesmas, sem o prefixo `/admin` |
| Backoffice: resultados | `POST /admin/results/import` | `POST /results/import` |
| Backoffice: gestão | `GET /admin/dashboard` (agregado), `GET /admin/users`, `PUT /admin/users/{id}/roles`, `GET /admin/audit` | `GET /stats`, `GET /users`, `PUT /users/{id}/roles`, `GET /audit` |

### Papéis no backoffice

| Papel | CMS | Atletas e documentos | Pedidos de alteração | Resultados | Utilizadores e auditoria |
|---|---|---|---|---|---|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `editor` | ✅ | — | — | — | — |
| `secretaria` | — | ✅ | ✅ | ✅ | — |
| `treinador` | — | ver | — | — | — |

## Front: modo demonstração vs API

O front tem uma camada de dados com duas implementações:

- **Demo:** quando `apiBaseUrl` está vazio, que é o caso do GitHub Pages hoje. Os dados vêm de `core/data` e do `localStorage` do browser. No modo demo, o CMS do backoffice já publica no site, mas só no browser de quem edita.
- **API:** quando `apiBaseUrl` está definido em `src/app/core/api/api.config.ts`. Na VPS, o build define-o como `/api/v1` através de `scripts/set-api-url.mjs` (ver [`DEPLOY-VPS.md`](DEPLOY-VPS.md)). O front passa a chamar o middleware com `withCredentials`, e o conteúdo e as áreas reservadas passam a ser reais.

## Correr localmente

```bash
docker compose up -d db                     # PostgreSQL
cd services && npm ci
npm run db:migrate && npm run db:seed      # esquema + dados de demonstração
npm run backend                            # :4100  /internal/docs
npm run middleware                         # :4000  /api/docs
cd .. && npm start                         # front :4200 (apiBaseUrl → http://localhost:4000/api/v1)
```

Ou tudo junto: `docker compose up --build`.

## Segurança

- **Sessão:**
  - JWT de 8 horas em cookie `httpOnly`, `Secure` e `SameSite=Strict`, porque o site e a API estão no mesmo domínio;
  - o token nunca é devolvido no corpo da resposta, por isso o JavaScript nunca lhe chega.
- **CSRF:** todos os pedidos que alteram dados, incluindo o login, precisam do cabeçalho `X-Requested-With`. O CORS só aceita as origens do site.
- **Entrar com Google / Microsoft (OpenID Connect):**
  - fluxo *authorization code* com PKCE (S256), `state` e `nonce`, feito no middleware com `openid-client`. O `id_token` é validado (assinatura, emissor, audiência, validade e nonce);
  - o `state`, o `nonce` e o PKCE ficam num cookie assinado, `httpOnly` e `SameSite=Lax`, que dura 10 minutos e só vale para `/api/v1/auth/oauth`;
  - **não se criam contas**. Na primeira entrada, a conta externa liga-se à conta do clube com o mesmo email, e só se o fornecedor garantir que o email está verificado. Depois disso, a ligação é feita pelo identificador da conta externa (`sub`) e fica em `user_identities`;
  - na Microsoft só entram contas pessoais. Nas contas de empresa o email não é verificado (falha conhecida como «nOAuth»);
  - o destino depois de entrar só pode ser um caminho do próprio site;
  - cada pessoa vê e desliga as contas ligadas em /entrar. As ligações ficam registadas no `audit_log`.
- **Passwords:** guardadas com `scrypt` e salt. O login responde à mesma velocidade quer a conta exista quer não.
- **Rate limit:**
  - 300 pedidos/minuto por IP em toda a API (`RATE_LIMIT_MAX`);
  - 10/minuto no login e 30/minuto no carregamento de imagens;
  - na Cloudflare, uma regra extra para o login.
- **Backend privado:**
  - só aceita pedidos com o `SERVICE_TOKEN`, e o middleware indica qual é o utilizador (`X-Actor-Id`);
  - os **papéis vêm sempre da base de dados**, a cada pedido. Uma conta desativada ou um papel retirado deixam de valer logo, mesmo com sessão aberta (a resposta passa a ser 401 `session_revoked`).
- **Segredos:** em produção, `SERVICE_TOKEN` e `JWT_SECRET` são obrigatórios e têm pelo menos 32 caracteres. Os serviços recusam arrancar sem eles.
- **XSS e CSP:**
  - o HTML do CMS é limpo no backend (`sanitize-html`) e outra vez pelo Angular;
  - cada página tem uma **Content-Security-Policy** com os hashes dos scripts embutidos, gerada em `scripts/postbuild.mjs`. Um script injetado não corre;
  - o Caddy acrescenta a política para estilos, fontes, imagens e frames, mais `frame-ancestors 'none'`.
- **Dependências:** o Dependabot propõe atualizações todas as semanas (`.github/dependabot.yml`) e o `npm audit` das dependências de produção está limpo.
- **Auditoria:** todas as escritas ficam registadas em `audit_log` (quem, o quê, quando).
- **Dados de identificação:** nome, nascimento, CC e NIF só mudam através de pedidos aprovados pela secretaria. Um trigger na base de dados garante isto.
