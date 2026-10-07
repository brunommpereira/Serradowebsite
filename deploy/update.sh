#!/usr/bin/env bash
# Atualiza a VPS para a versão mais recente do main e reconstrói o que mudou.
# Os dados (base de dados, certificados) e o deploy/.env mantêm-se.
#   sudo /opt/serrado/deploy/update.sh            (também usado pelo GitHub Actions)
#   sudo /opt/serrado/deploy/update.sh --no-pull  (só reconstrói, sem ir buscar código)
set -euo pipefail

APP_DIR=/opt/serrado
BRANCH=${BRANCH:-main}
COMPOSE=(docker compose -f "$APP_DIR/deploy/docker-compose.prod.yml" --env-file "$APP_DIR/deploy/.env")

cd "$APP_DIR"
if [ "${1:-}" != '--no-pull' ]; then
  git fetch --quiet origin "$BRANCH"
  # O servidor não tem alterações locais: fica igual ao main (o .env está fora do Git)
  git reset --quiet --hard "origin/$BRANCH"
fi
echo "Versão: $(git log -1 --format='%h %s')"

"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

# Espera que a API arranque (até 3 minutos)
for _ in $(seq 36); do
  if "${COMPOSE[@]}" exec -T middleware wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
[ "${ok:-0}" = 1 ] || { echo '✘ A API não arrancou. Ver: docker compose … logs middleware backend migrate' >&2; exit 1; }
echo '✔ Atualizado'
