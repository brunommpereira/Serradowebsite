# Serrado FC Digital

Site oficial do **Serrado Futebol Clube**, fundado a 29.04.1978 no Bairro do Serrado, Caparica.
*Uma história. Uma família. Várias modalidades.*

Frontend da plataforma descrita na especificação funcional *Serrado FC Digital v1.0*. Usa **Angular 21 + TypeScript** e todas as páginas públicas são pré-renderizadas em HTML estático (SEO e performance). A Área de Sócio é renderizada só no browser.

## Arrancar

```bash
npm install          # Node 22.12+ (recomendado Node 24 / npm 11)
npm start            # http://localhost:4200
npm test -- --watch=false
npm run build        # gera dist/serrado-fc/browser + 404.html + sitemap.xml
```

O resultado de `npm run build` é um site estático que pode ser alojado em qualquer serviço: Azure Static Web Apps, GitHub Pages, Netlify, etc.

### Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica o site em **https://brunommpereira.github.io/Serradowebsite/** a cada push para o `main`. Também pode ser lançado manualmente em *Actions → Deploy GitHub Pages → Run workflow*. O workflow corre os testes, faz o build com o base href `/Serradowebsite/`, gera o `404.html` e o `sitemap.xml` e publica.

**Configuração única:** em *Settings → Pages → Build and deployment → Source*, escolher **GitHub Actions**.

Quando o domínio `serradofc.pt` estiver pronto, há três passos:
1. Configurá-lo em *Settings → Pages → Custom domain*.
2. Mudar o base href para `/`.
3. Mudar o `SITE_URL` no workflow.

- Para testar localmente o build do GitHub Pages usa-se `npm run build:gh-pages`, que define o base href `/Serradowebsite/`.
- O `404.html` serve de fallback para as rotas que só existem no browser (`/area-socio`, `/area-atletas`).

## Estrutura (secção 55)

```
src/app/
├── core/        modelos (secção 34), serviços (conteúdo, SEO, sessão), validadores (NIF, código postal)
│   └── data/mock-data.ts   ← CONTEÚDO DE DEMONSTRAÇÃO (o "CMS" da Fase 1)
├── shared/      biblioteca de componentes: ícones, page hero, News/Match/Event/Sport/Sponsor cards,
│                cartão de sócio digital, QR Code, passo de pagamento, pipe de capitalização
├── layout/      header (top bar, mega menu, pesquisa, menu móvel), footer (newsletter)
└── features/    home, club, sports, news, agenda (+ resultados), events, membership,
                 account (login + dashboard), partners, community, media, shop,
                 contacts, search, legal (RGPD), not-found
public/brand/    emblema oficial em SVG (cores, branco, amarelo) e ícones PWA
```

O `ContentService` é o único ponto de acesso aos dados. Ao lado de cada método está indicado o endpoint REST correspondente (`GET /api/news`, `GET /api/sports/{slug}`, …). Quando o backend Spring Boot existir, basta trocar a implementação; os componentes ficam iguais.

## O que está implementado

| Área | Estado |
|---|---|
| Homepage (secção 4): hero, próximos jogos/eventos, notícias, modalidades, agenda, CTA de sócio, parceiros | ✅ |
| Mega menu (desktop) e menu móvel (secções 5 e 47) | ✅ |
| O Clube (secções 6–8): história/timeline, missão, visão e valores, identidade, órgãos sociais, transparência com filtros, instalações | ✅ |
| Modalidades (secções 15–18) com template comum: equipas, treinadores, calendário, resultados, classificações, recordes (atletismo), treinos, notícias, galeria, inscrições | ✅ |
| Notícias com categorias e página de notícia (partilhar, relacionadas) — secção 19 | ✅ |
| Agenda em lista e calendário, com filtros (secção 20) · Resultados com filtros e classificações (secção 21) | ✅ |
| Eventos e inscrição com pagamento e QR Code de check-in (secção 22) | ✅ demo |
| Sócios: página pública, categorias e quotas, benefícios, FAQ (secção 9) | ✅ |
| Registo de sócio (secções 10 e 49): categoria → dados (validação de NIF/CP, RGPD) → pagamento → n.º de sócio + cartão | ✅ demo |
| Área de Atletas (`/area-atletas`): perfis **encarregado de educação** e **atleta**; agenda com Vou / Não vou, evolução e métricas, **competições** (resultados do Troféu de Almada, evolução por prova entre épocas com tempo/ritmo e distância), histórico com plano de treino, atletas/dados e documentos de inscrição, partilha de acesso com até 2 co-encarregados, recibos, documentos do clube | ✅ demo |
| Área de Sócio (secções 11–14): login, dashboard, quotas e pagamentos, recibos, cartão digital com QR, agregado familiar, notificações | ✅ demo |
| Parceiros e "Torne-se Parceiro", Comunidade, Multimédia, Contactos (mapa, horários, formulário), Loja (catálogo) | ✅ |
| Pesquisa global (secção 28) | ✅ |
| SEO (secção 38): title/description/OG/canonical por página, JSON-LD, sitemap.xml, robots.txt, URLs amigáveis | ✅ |
| Acessibilidade (secção 40): navegação por teclado, skip link, foco visível, labels, aria, `prefers-reduced-motion` | ✅ |
| PWA-ready: manifest e ícones (secção 43) | ✅ base |
| CI no GitHub Actions: testes + build (secção 53) | ✅ |

**Contas de demonstração:** sócio / encarregado n.º `00482`, password `serrado1978` · atleta n.º `00731`, password `atleta2026`.

**Backend privado (dados reais):** ver [`backend/README.md`](backend/README.md) e [`tools/trofeu-almada/`](tools/trofeu-almada/README.md).

## O que falta e precisa de backend (fases 2 a 7)

Os fluxos marcados como **demo** funcionam de ponta a ponta no browser, mas ainda não guardam dados nem cobram nada. Ficam por fazer:

- Backend Java/Spring Boot com PostgreSQL, OAuth2/OIDC e MFA para administradores.
- Pagamentos reais (MB WAY, Multibanco, cartão, débito direto) com webhooks, recibos em PDF e emails.
- Backoffice/CMS (secções 29–30), newsletter, notificações push/SMS e assistente IA.

## Antes de publicar: rever

Todo o conteúdo em `src/app/core/data/mock-data.ts` é **ilustrativo**:

- jogos, adversários, resultados, classificações e recordes;
- notícias, eventos, horários de treino e valores das quotas;
- órgãos sociais (marcados "A designar"), documentos e patrocinadores;
- telefone `+351 210 000 000`, emails `@serradofc.pt` e links de Instagram e YouTube.

Também falta:

- **Fotografias:** os cartões usam gradientes com o emblema até haver imagens reais.
- **Políticas de Privacidade e Cookies:** são texto-base e precisam de validação jurídica.

## Identidade

As cores foram retiradas do emblema oficial (`2025.10.13_SERRADO_FC_FINAL.pdf`):

| Cor | Hex |
|---|---|
| Azul Serrado | `#004A8E` |
| Amarelo | `#FFD318` |
| Verde Louro | `#00783A` |
| Bola | `#C96B47` |
| Carvão | `#231F20` |

Os tokens estão em `src/styles.scss`. Os títulos usam a fonte *Barlow Condensed*, próxima do lettering do emblema, e o texto corrido usa *Inter*.
