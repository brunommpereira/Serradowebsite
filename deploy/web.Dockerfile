# Site (Angular) servido pelo Caddy, com HTTPS automático. Build a partir da raiz do repositório.
FROM node:24-alpine AS build
WORKDIR /src
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Mesmo endereço do site: o Caddy encaminha /api/* para o middleware
ARG API_BASE_URL=/api/v1
ARG SITE_URL=https://serradofc.pt
RUN node scripts/set-api-url.mjs "$API_BASE_URL" \
 && npx ng build \
 && SITE_URL="$SITE_URL" node scripts/postbuild.mjs

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/serrado-fc/browser /srv
