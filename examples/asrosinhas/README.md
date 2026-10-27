# As Rosinhas — protótipo de redesign

Exemplo de um site para outra associação feito com **a mesma estrutura e configuração** do site do Serrado FC
(Angular 21, páginas pré-renderizadas, CSP com hashes, sitemap, publicação estática), mas com **layout próprio**.

Pré-visualização: https://brunommpereira.github.io/Serradowebsite/asrosinhas/
(publicado pelo workflow `deploy-pages.yml` da raiz). Conteúdos e imagens tirados de www.asrosinhas.org.
É um protótipo: os formulários validam mas não enviam nada.

```bash
npm ci
npm start            # http://localhost:4200
npm run build        # dist/asrosinhas/browser (+ 404, CSP e sitemap)
```

## Estrutura

| Pasta | O quê |
| --- | --- |
| `src/styles.scss` | Sistema de design: cores da marca (contraste AA), Fraunces + Inter, botões, chips, formulários |
| `src/app/core/content.ts` | Todo o texto, eventos e artigos da loja (no projeto real vem da API/backoffice) |
| `src/app/layout` | Cabeçalho (menu móvel) e rodapé |
| `src/app/shared` | Ícones SVG, cartão de artigo, cabeçalho de página, campos de morada, animação de entrada |
| `src/app/pages` | Início, A associação, Eventos, Loja, Artigo, Ajudar, Ser sócia, Donativo, Contactos, 404 |
| `scripts/postbuild.mjs` | 404.html, Content-Security-Policy e sitemap.xml |

## Passar a projeto real

1. Criar um repositório novo a partir do do Serrado FC (ou copiar esta pasta para começar só com o site público).
2. Trocar marca: tokens em `styles.scss`, logótipo/ícones em `public/brand`, `manifest.webmanifest`, textos.
3. Escolher o que se aproveita do backend (`services/`): sócios e quotas, pagamentos (Stripe), recibos (Moloni),
   emails (Brevo), CMS, backoffice. Os formulários daqui passam a chamar a API como no Serrado.
4. Servidor: VPS nova com os scripts de `deploy/server`, domínio na Cloudflare, `SITE_URL`/`CORS_ORIGINS`, segredos só
   no servidor (`/etc/<projeto>.env`) e nos *secrets* do GitHub Actions (`VPS_HOST`, chave SSH…).
5. Base de dados nova (migrações + utilizadores e papéis iniciais) e backups.
