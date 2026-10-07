#!/usr/bin/env bash
# Instala o Serrado FC numa VPS Ubuntu 22.04/24.04 (ex.: Hostinger KVM 1). Correr como root:
#
#   git clone https://github.com/brunommpereira/Serradowebsite.git /opt/serrado
#   bash /opt/serrado/deploy/install.sh --admin-email direcao@serradofc.pt --admin-name "Direção" [--domain www.serradofc.pt] [--content]
#
#   --domain        endereço do site; sem domínio usa <IP>.sslip.io, que serve para testar
#   --admin-email   cria a primeira conta de administração (a password é gerada e mostrada no fim)
#   --admin-name    nome dessa conta (por omissão "Administração")
#   --content       carrega o conteúdo inicial do site (notícias, eventos, parceiros), se o CMS estiver vazio
#   --deploy-key    chave SSH pública do GitHub Actions: cria o utilizador «deploy», que só pode correr o update.sh
#
# Pode correr-se outra vez sem perder dados: não altera segredos nem a base de dados.
set -euo pipefail

APP_DIR=/opt/serrado
ENV_FILE=$APP_DIR/deploy/.env
BACKUP_DIR=/var/backups/serrado
DOMAIN=''
ADMIN_EMAIL=''
ADMIN_NAME='Administração'
CONTENT=0
DEPLOY_KEY=''

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-name) ADMIN_NAME="$2"; shift 2 ;;
    --content) CONTENT=1; shift ;;
    --deploy-key) DEPLOY_KEY="$2"; shift 2 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo 'Corre como root (sudo bash deploy/install.sh …)' >&2; exit 1; }
[ -f "$APP_DIR/deploy/docker-compose.prod.yml" ] || { echo "Clona primeiro o repositório para $APP_DIR" >&2; exit 1; }

step 'Atualizações do sistema e ferramentas'
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq git curl ca-certificates openssl ufw fail2ban unattended-upgrades
# Atualizações de segurança automáticas
dpkg-reconfigure -f noninteractive unattended-upgrades

step 'Docker'
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

step 'Firewall: só SSH, HTTP e HTTPS'
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

step 'Memória swap (o build do site precisa de mais de 1 GB)'
if [ "$(swapon --show | wc -l)" = 0 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step 'Configuração e segredos (deploy/.env)'
if [ ! -f "$ENV_FILE" ]; then
  if [ -z "$DOMAIN" ]; then
    IP=$(curl -4 -fsS https://api.ipify.org)
    DOMAIN="${IP//./-}.sslip.io"
  fi
  umask 077
  cat > "$ENV_FILE" <<EOF
SITE_DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 32)
SERVICE_TOKEN=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
EOF
  chmod 600 "$ENV_FILE"
elif [ -n "$DOMAIN" ]; then
  sed -i "s/^SITE_DOMAIN=.*/SITE_DOMAIN=$DOMAIN/" "$ENV_FILE"
fi
# shellcheck disable=SC1090
SITE_DOMAIN=$(. "$ENV_FILE"; echo "$SITE_DOMAIN")
echo "Endereço: https://$SITE_DOMAIN"

step 'Build e arranque (a primeira vez demora 5 a 10 minutos)'
"$APP_DIR/deploy/update.sh" --no-pull

COMPOSE=(docker compose -f "$APP_DIR/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")
if [ "$CONTENT" = 1 ]; then
  step 'Conteúdo inicial do site'
  "${COMPOSE[@]}" run --rm -T migrate node db/seed/content.ts
fi
if [ -n "$ADMIN_EMAIL" ]; then
  step 'Conta de administração'
  "${COMPOSE[@]}" run --rm -T migrate node db/create-admin.ts "$ADMIN_EMAIL" "$ADMIN_NAME"
fi

step 'Cópia de segurança diária da base de dados (03:30, guarda 14 dias)'
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
cat > /etc/cron.d/serrado-backup <<EOF
30 3 * * * root $APP_DIR/deploy/backup.sh >> /var/log/serrado-backup.log 2>&1
EOF

if [ -n "$DEPLOY_KEY" ]; then
  step 'Utilizador «deploy» para o deploy automático (GitHub Actions)'
  id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  printf '%s\n' "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
  echo "deploy ALL=(root) NOPASSWD: $APP_DIR/deploy/update.sh" > /etc/sudoers.d/serrado-deploy
  chmod 440 /etc/sudoers.d/serrado-deploy && visudo -cf /etc/sudoers.d/serrado-deploy
fi

step 'Pronto'
echo "Site:        https://$SITE_DOMAIN"
echo "Backoffice:  https://$SITE_DOMAIN/entrar  →  «Equipa do clube? Entrar no backoffice»"
echo "Estado:      docker compose -f $APP_DIR/deploy/docker-compose.prod.yml --env-file $ENV_FILE ps"
