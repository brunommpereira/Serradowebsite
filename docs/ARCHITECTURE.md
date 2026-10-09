# Arquitetura — Serrado FC Digital

Três camadas com responsabilidades separadas, e uma base de dados. O front é Angular (TypeScript); o middleware e o backend são Python (FastAPI), em `services/serrado/`.

```
┌──────────────────────────┐   HTTPS + cookie de sessão   ┌───────────────────────────┐  rede interna   ┌──────────────────────────┐      ┌──────────────┐
│ FRONT (Angular)          │ ───────────────────────────▶ │ MIDDLEWARE (BFF)          │ ──────────────▶ │ BACKEND (API interna)     │ ───▶ │ PostgreSQL   │
│ src/                     │      /api/v1/…               │ serrado/middleware        │ /internal/v1/…  │ serrado/backend           │  SQL │ serrado/db   │
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
| **Middleware** (`services/serrado/middleware`) | Login e sessão (JWT em cookie `httpOnly`); recuperação da password por email; validação de pedidos; rate limit; CORS; cache do conteúdo público; agregação de dados para o front (por exemplo `/home`, `/me` e o dashboard). | Não tem SQL nem regras de negócio. |
| **Backend** (`services/serrado/backend`) | Regras de negócio, por exemplo: pedidos de alteração validados pela secretaria; no máximo 2 co-encarregados; confirmação de dados por época; publicação e revisões do CMS. Faz o acesso a PostgreSQL e escreve a auditoria. | Não fica exposto à Internet. Só aceita pedidos com o token de serviço do middleware. |
| **Base de dados** (`services/serrado/db`) | Esquema versionado (migrações), integridade (chaves estrangeiras e `check`) e dados de demonstração (seed). | — |

**Defesa em profundidade:** o middleware verifica o papel de quem faz o pedido. O backend volta a verificar o acesso ao nível dos dados: um encarregado só consegue ler ou alterar os seus educandos, mesmo que o middleware falhe.

## Base de dados

**PostgreSQL 16.** Opções de alojamento, todas com região UE:

| Opção | Notas |
|---|---|
| Postgres gerido (Supabase, Neon, Azure Database for PostgreSQL, AWS RDS) | Recomendado: backups automáticos e TLS. O plano gratuito chega para começar. |
| VPS (OVHcloud, Hostinger…) | PostgreSQL 16 nativo e só local, com cópias diárias e cópia externa cifrada (restic). Ver [`DEPLOY-VPS.md`](DEPLOY-VPS.md). **É a opção escolhida.** |

Tabelas principais (ver `services/serrado/db/migrations`):

- **Identidade:** `users` (uma conta por pessoa; o n.º de sócio é opcional), `roles` e `role_permissions` (papéis editáveis), `user_roles`, `password_tokens` (ligações de uso único), `email_outbox` (fila de emails), `audit_log`.
- **Sócios:** `members`, `quotas`.
- **Atletas:** `athletes`, `athlete_access` (encarregado, co-encarregado ou atleta), `athlete_documents`, `athlete_change_requests`.
- **Competições:** `races`, `results` (Troféu de Almada).
- **CMS:** `cms_news`, `cms_events`, `cms_pages`, `cms_partners`, `cms_revisions` (histórico de versões de cada conteúdo).
- **Conteúdos do site:** `site_blocks` (um documento JSON por bloco: contactos, página do clube, órgãos sociais, documentos, sócios, modalidades, jogos, provas, classificações, recordes, outras datas da agenda, loja, multimédia, comunidade) e `site_block_revisions` (histórico). Os campos de cada bloco estão em `src/app/core/site/site-blocks.ts` (o editor do backoffice é gerado a partir deles) e o conteúdo original em `site-defaults.ts`: enquanto um bloco não é editado, o site mostra o original. O backend aceita só os blocos conhecidos e confirma a forma geral (tamanhos, níveis, sem endereços `javascript:`); o site mostra estes valores sempre como texto.

## Texto rico e imagens

- **Editor visual (Tiptap):** produz HTML simples, com parágrafos, títulos, negrito, itálico, sublinhado, listas, citações, ligações e imagens.
- **Limpeza do HTML:** o backend limpa o HTML com uma lista de etiquetas permitidas (`services/serrado/html.py`, com o `nh3`) antes de o gravar. No site, o Angular volta a filtrá-lo.
- **Conteúdos antigos:** os textos simples, com parágrafos separados por linha em branco, continuam a funcionar.
- **Imagens:**
  - o browser reduz cada imagem (1920 px) e converte-a para WebP, o que apaga os dados EXIF e GPS;
  - o backend confirma o tipo real pelos primeiros bytes (JPEG, PNG, WebP ou GIF, até 5 MB);
  - as imagens ficam na tabela `cms_media` e entram nas cópias de segurança;
  - uma imagem em uso não pode ser apagada.

## Pagamentos online e faturas-recibo

`services/serrado/payments/` trata das quotas de sócio e das mensalidades das escolas (tabelas `fee_plans`, `athlete_fees`, `payments` e `payment_items`):
- **O browser só escolhe o que paga e indica o NIF.** O backend confirma que cada item pertence à conta e não está pago nem em pagamento. Depois cria a sessão do **Stripe Checkout** com os valores da base de dados.
- **Webhook do Stripe:** o middleware recebe-o em `/api/v1/payments/stripe/webhook`, sem sessão nem CSRF, e passa o corpo original ao backend. O backend confirma a assinatura HMAC (janela de 5 minutos) e o valor, e só então marca como pago. O mesmo evento repetido não muda nada.
- **Multibanco:** os itens ficam bloqueados enquanto a referência estiver por pagar. Ficam livres quando a sessão expira ou o pagamento falha.
- **Faturas-recibo no Moloni ON (GraphQL):** um timer emite a fatura-recibo fechada (cliente pelo NIF), pede o envio por email e guarda o PDF.
  - Cada passo fica registado antes do seguinte, por isso uma nova tentativa nunca emite dois documentos.
  - As chaves do Stripe e do Moloni só existem no backend e no worker. O middleware não as conhece.

## Página de Facebook

`services/serrado/facebook.py` lê a página do clube na Graph API da Meta, de 15 em 15 minutos (timer do systemd na VPS):
- **publicações → notícias** e **eventos → eventos**, publicados logo ou em rascunho (`FACEBOOK_SYNC_MODE`);
- a tabela `cms_external` liga cada publicação ou evento à entrada do CMS: evita duplicados e permite atualizar, sem pisar as edições feitas no backoffice;
- as fotos entram na biblioteca de imagens (o tipo é confirmado pelo conteúdo, até 5 MB);
- as escritas ficam no `audit_log` com `via: facebook`;
- o token da página só existe no servidor e nunca aparece nas mensagens de erro.

## APIs

- **Middleware (pública):** `services/openapi/middleware.json`, com documentação interativa em `/api/docs`.
- **Backend (interna):** `services/openapi/backend.json`, com documentação em `/internal/docs`. Só está disponível em desenvolvimento.

| Grupo | Middleware `/api/v1` | Backend `/internal/v1` |
|---|---|---|
| Sessão | `POST /auth/login`, `POST /auth/logout`, `GET /me` | `POST /auth/verify`, `GET /users/{id}` |
| Conteúdo público | `GET /content/home`, `/content/news[/{slug}]`, `/content/events[/{slug}]`, `/content/pages/{slug}`, `/content/partners`, `/content/blocks` (com cache) | `GET /cms/{tipo}?status=published`, `GET /site/blocks` |
| Área de Atletas | `GET /me/athletes`, `GET\|PATCH /athletes/{id}`, `POST /athletes/{id}/confirm`, `POST /athletes/{id}/change-requests`, `GET /athletes/{id}/results` | `GET /athletes?accessibleBy=`, `GET\|PATCH /athletes/{id}`, `POST /athletes/{id}/confirm`, `POST /athletes/{id}/change-requests`, `GET /athletes/{id}/results` |
| Área de Sócio | `GET /me/member`, `GET /me/quotas` | `GET /members/{number}`, `GET /members/{number}/quotas` |
| Backoffice: CMS | `GET\|POST /admin/cms/{tipo}`, `GET\|PUT\|DELETE /admin/cms/{tipo}/{id}`, `POST …/publish`, `POST …/unpublish`, `GET …/revisions`, `POST …/revisions/{rev}/restore` | as mesmas, em `/cms/…` |
| Backoffice: imagens e PDF | `GET\|POST /admin/media`, `PATCH\|DELETE /admin/media/{id}`, `GET /admin/media/{id}/usage` | as mesmas, em `/cms/media…` |
| Backoffice: conteúdos do site | `GET\|PUT\|DELETE /admin/site/blocks/{bloco}`, `GET …/revisions`, `POST …/revisions/{rev}/restore` | as mesmas, em `/site/blocks…` |
| Imagens públicas | `GET /media/{chave}.{ext}` (cache de 1 ano, endereço aleatório) | `GET /media/{chave}` |
| Backoffice: atletas | `GET /admin/athletes`, `GET /admin/change-requests`, `POST /admin/change-requests/{id}/approve\|reject`, `POST /admin/documents/{id}/approve\|reject` | as mesmas, sem o prefixo `/admin` |
| Backoffice: sócios e atletas (gestão) | `GET\|POST /admin/members`, `GET\|PUT /admin/members/{n}`, `POST /admin/members/{n}/quotas`, `POST /admin/athletes`, `PUT /admin/athletes/{id}`, `GET\|POST /admin/athletes/{id}/access`, `DELETE /admin/athletes/{id}/access/{user}`, `POST /admin/registry/import` | `/members…`, `/members/{n}/detail`, `/athletes`, `/athletes/{id}/admin`, `/athletes/{id}/access…`, `/registry/import` |
| Backoffice: tesouraria | `GET\|PUT /admin/quota-plans…`, `GET /admin/payments/pending`, `POST /admin/payments/manual` | `/quota-plans…`, `/payments/pending`, `/payments/manual` |
| Registo online (público) | `GET /registrations/form`, `POST /registrations/member\|athlete` (5/min por IP) | `GET /signup/form`, `POST /signup/member\|athlete` (com o IP e o navegador postos pelo middleware) |
| Backoffice: registos e documentos legais | `GET /admin/legal`, `POST /admin/legal/{kind}`, `GET /admin/registrations`, `GET /admin/registrations/{id}/pdf` | `/legal…`, `/registrations…` |
| Backoffice: resultados | `POST /admin/results/import` | `POST /results/import` |
| Backoffice: gestão | `GET /admin/dashboard` (agregado), `GET /admin/users`, `PUT /admin/users/{id}/roles`, `POST /admin/users/{id}/invite`, `GET /admin/permissions`, `GET\|POST /admin/roles`, `PUT\|DELETE /admin/roles/{key}`, `GET /admin/audit` | `GET /stats`, `GET /users`, `PUT /users/{id}/roles`, `POST /users/{id}/invite`, `GET /permissions`, `…/roles`, `GET /audit` |
| Password por email | `GET /auth/options`, `POST /auth/password/forgot`, `POST /auth/password/reset` | `POST /auth/password/forgot`, `POST /auth/password/reset` |

### Papéis e permissões no backoffice

O catálogo de **permissões** é fixo no código (`services/serrado/permissions.py` e `src/app/core/permissions.ts`). Os **papéis** e as permissões de cada um configuram-se no backoffice (**Gestão → Papéis e permissões**); cada conta pode ter vários papéis e fica com a soma.

| Permissão | O quê |
|---|---|
| `cms.edit` | Notícias, eventos, páginas, parceiros, imagens e conteúdos do site (contactos, clube, loja, jogos…) |
| `athletes.view` / `athletes.sensitive` / `athletes.manage` | Ver atletas · ver CC, NIF e morada · alterar e validar pedidos e documentos |
| `members.view` / `members.manage` | Ver sócios e quotas · criar, alterar e importar |
| `payments.view` / `payments.manage` | Ver pagamentos e recibos · valores, mensalidades, recibos |
| `results.import` | Importar resultados |
| `registrations.manage` | Documentos legais e registos online |
| `users.manage` | Utilizadores, papéis e permissões |
| `audit.all` | Toda a auditoria (sem ela, cada um vê só as suas ações) |

Papéis de origem (podem mudar de permissões, mas não se apagam):

| Papel | Permissões |
|---|---|
| `admin` (Administração) | todas, sempre |
| `secretaria` | atletas (todas), sócios (todas), `payments.view`, `results.import`, `registrations.manage` |
| `tesouraria` | `members.view`, `payments.view`, `payments.manage` |
| `editor` (Comunicação) | `cms.edit` |
| `treinador` | `athletes.view` |

Regras: só um admin dá o papel de admin; ninguém se tira a si próprio o admin; quem gere utilizadores sem ser admin só atribui papéis e permissões que ele próprio tem.

## Front: modo demonstração vs API

O front tem uma camada de dados com duas implementações:

- **Demo:** quando `apiBaseUrl` está vazio, que é o caso do GitHub Pages hoje. Os dados vêm de `core/data` e do `localStorage` do browser. No modo demo, o CMS do backoffice já publica no site, mas só no browser de quem edita.
- **API:** quando `apiBaseUrl` está definido em `src/app/core/api/api.config.ts`. Na VPS, o build define-o como `/api/v1` através de `scripts/set-api-url.mjs` (ver [`DEPLOY-VPS.md`](DEPLOY-VPS.md)). O front passa a chamar o middleware com `withCredentials`, e o conteúdo e as áreas reservadas passam a ser reais.

## Correr localmente

```bash
docker compose up -d db                     # PostgreSQL
cd services && uv sync
uv run python -m serrado.db.migrate && uv run python -m serrado.db.seed   # esquema + dados de demonstração
uv run python -m serrado.backend.server                                   # :4100  /internal/docs
uv run python -m serrado.middleware.server                                # :4000  /api/docs
cd .. && npm start                                                        # front :4200 (apiBaseUrl → http://localhost:4000/api/v1)
```

Ou tudo junto: `docker compose up --build`.

## Segurança

- **Sessão:**
  - JWT de 8 horas em cookie `httpOnly`, `Secure` e `SameSite=Strict`, porque o site e a API estão no mesmo domínio;
  - o JWT leva emissor (`iss`) e audiência (`aud`), e só é aceite com os dois certos. Um token assinado com o mesmo segredo para outro fim não abre sessão;
  - o token nunca é devolvido no corpo da resposta, por isso o JavaScript nunca lhe chega.
- **CSRF:** todos os pedidos que alteram dados, incluindo o login, precisam do cabeçalho `X-Requested-With`. O CORS só aceita as origens do site.
- **Entrar com Google / Microsoft (OpenID Connect):**
  - fluxo *authorization code* com PKCE (S256), `state` e `nonce`, feito no middleware (`serrado/middleware/oauth.py`, com `httpx` e `PyJWT`). O `id_token` é validado (assinatura, emissor, audiência, validade e nonce);
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
  - os **papéis e as permissões vêm sempre da base de dados**, a cada pedido. Uma conta desativada, um papel retirado ou uma permissão alterada valem logo, mesmo com sessão aberta. Depois de repor a password, as sessões abertas antes disso terminam (401 `session_revoked`);
  - o middleware só confirma a sessão; quem decide o que cada um pode fazer é o backend.
- **Segredos:** em produção, `SERVICE_TOKEN` e `JWT_SECRET` são obrigatórios e têm pelo menos 32 caracteres. Os serviços recusam arrancar sem eles.
- **XSS e CSP:**
  - o HTML do CMS é limpo no backend (`nh3`) e outra vez pelo Angular;
  - cada página tem uma **Content-Security-Policy** com os hashes dos scripts embutidos, gerada em `scripts/postbuild.mjs`. Um script injetado não corre;
  - o Caddy acrescenta a política para estilos, fontes, imagens e frames, mais `frame-ancestors 'none'`.
- **Dependências:** o Dependabot propõe atualizações todas as semanas (`.github/dependabot.yml`) para o front (npm) e para os serviços (uv). As versões dos serviços estão fixas no `uv.lock` e o deploy confere os hashes de cada biblioteca.
- **Auditoria:** todas as escritas ficam registadas em `audit_log` (quem, o quê, quando).
- **Dados de identificação:** nome, nascimento, CC e NIF só mudam através de pedidos aprovados pela secretaria. Um trigger na base de dados garante isto.

## Registo online e assinatura

Os formulários `/socios/registo` e `/inscricao` usam uma **assinatura eletrónica simples** (eIDAS), com prova:

- **Documentos com versões** (`legal_documents`): condições de sócio, regulamento de atleta, RGPD e imagem. Uma alteração cria uma versão nova. As publicadas não mudam (um trigger impede-o), e cada uma tem o SHA-256 do texto.
- **Registo** (`registrations`), que guarda:
  - o formulário e a versão + hash de cada documento aceite (a imagem é facultativa);
  - o PNG da assinatura (validado e limpo no servidor: tem de ter traço) e o seu hash;
  - a hora do servidor, o IP (posto pelo middleware) e o navegador;
  - o `evidence_sha256` de tudo isto (JSON canónico).
- **PDF** (fpdf2) com os dados, os documentos aceites, a assinatura, a prova e os textos em anexo. É enviado por email a quem assinou e fica descarregável no backoffice.
- **Menores de 18 anos:** assina o encarregado de educação, que fica com acesso à Área de Atletas. Um adulto assina por si.
- **Fica ativo de imediato.** O sócio ou o atleta é criado (sem duplicar um que já exista) e a conta do site liga-se ao email de quem assinou, com convite para definir a password.
- **Contra abusos:** 5 registos por minuto e por IP, um campo-armadilha para robôs e a validação de tudo no servidor.
