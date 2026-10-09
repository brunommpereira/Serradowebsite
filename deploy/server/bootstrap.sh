#!/usr/bin/env bash
# Serrado FC — preparação do servidor (Ubuntu 24.04; testado a pensar na OVHcloud VPS e na Hostinger KVM).
# Corre uma vez, com sudo. Pode voltar a correr-se para atualizar a configuração (não apaga dados nem segredos).
#
#   sudo bash bootstrap.sh --domain www.serradofc.pt --cloudflare --deploy-key "ssh-ed25519 AAAA… github-actions"
#
#   --domain       endereço do site. Sem domínio: <IP>.sslip.io (só para testar, sem Cloudflare)
#   --cloudflare   site atrás da Cloudflare: certificado de origem da Cloudflare e portas 80/443 só para os IPs dela.
#                  Antes, guardar o certificado e a chave em /etc/serrado/tls/origin.pem e origin.key
#   --deploy-key   chave SSH pública do GitHub Actions: cria o utilizador «deploy», limitado ao serrado-ssh-gate
#
# Instala, sem Docker: PostgreSQL 16, Python 3.12, Caddy, restic, ufw, fail2ban e atualizações automáticas.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=/opt/serrado
ETC=/etc/serrado
DOMAIN=''
CLOUDFLARE=0
DEPLOY_KEY=''

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --cloudflare) CLOUDFLARE=1; shift ;;
    --deploy-key) DEPLOY_KEY="$2"; shift 2 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { echo "✘ $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die 'Corre com sudo: sudo bash bootstrap.sh …'
. /etc/os-release
[ "$ID" = ubuntu ] || die "Feito para Ubuntu (encontrei $PRETTY_NAME)."
if [ "$CLOUDFLARE" = 1 ]; then
  [ -n "$DOMAIN" ] || die '--cloudflare precisa de --domain.'
  [ -s "$ETC/tls/origin.pem" ] && [ -s "$ETC/tls/origin.key" ] || die "Falta o certificado de origem da Cloudflare em $ETC/tls/origin.pem e origin.key (ver docs/DEPLOY-VPS.md)."
fi

export DEBIAN_FRONTEND=noninteractive
step 'Sistema e pacotes base'
# Repositório antigo do Caddy (Cloudsmith), que passou a responder «402 Payment Required»: sem isto o apt-get update falha
rm -f /etc/apt/sources.list.d/caddy-stable.list /usr/share/keyrings/caddy-stable-archive-keyring.gpg
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl ca-certificates gnupg git jq ufw fail2ban unattended-upgrades postgresql restic
dpkg-reconfigure -f noninteractive unattended-upgrades

step 'Python 3 (serviços: middleware e backend)'
# O Ubuntu 24.04 traz o Python 3.12. As bibliotecas chegam já empacotadas em cada versão (sem acesso ao PyPI)
apt-get install -yq python3 python3-venv
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' || die "É preciso Python 3.12 ou superior (encontrei $(python3 --version))."
python3 --version

step 'Caddy (servidor web e HTTPS)'
# Binário oficial do GitHub, numa versão fixa e com o SHA-512 conferido (o repositório apt do Caddy deixou de ser gratuito).
# Para atualizar: mudar a versão e os hashes (caddy_<versão>_checksums.txt da release) e voltar a correr o bootstrap.
CADDY_VERSION=2.10.2
case "$(dpkg --print-architecture)" in
  amd64) CADDY_ARCH=amd64; CADDY_SHA512=747df7ee74de188485157a383633a1a963fd9233b71fbb4a69ddcbcc589ce4e2cc82dacf5dbbe136cb51d17e14c59daeb5d9bc92487610b0f3b93680b2646546 ;;
  arm64) CADDY_ARCH=arm64; CADDY_SHA512=6ce061a690312ab38367df3c5d5f89a2e4a263e7300d300d87356211bb81e79b15933e6d6203e03fbf26f15cc0311f264805f336147dbdd24938d84b57a4421c ;;
  *) die "Arquitetura não suportada: $(dpkg --print-architecture)" ;;
esac
if ! /usr/bin/caddy version 2>/dev/null | grep -q "^v$CADDY_VERSION "; then
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/caddy.tar.gz" "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_linux_${CADDY_ARCH}.tar.gz"
  echo "$CADDY_SHA512  $tmp/caddy.tar.gz" | sha512sum -c --quiet || die 'O ficheiro do Caddy não confere com o SHA-512 esperado.'
  tar -xzf "$tmp/caddy.tar.gz" -C "$tmp" caddy
  install -m 755 "$tmp/caddy" /usr/bin/caddy
  rm -rf "$tmp"
fi
getent group caddy >/dev/null || groupadd --system caddy
id caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
caddy version

step 'Utilizadores'
id serrado >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin serrado
mkdir -p "$ROOT/releases" "$ETC/tls" /var/backups/serrado
chmod 755 "$ROOT" "$ROOT/releases"
chown root:serrado "$ETC" && chmod 750 "$ETC"
chmod 700 "$ETC/tls" /var/backups/serrado

step 'PostgreSQL 16 (nativo, só acessível localmente)'
PGVER=$(ls /etc/postgresql | sort -n | tail -1)
cat > "/etc/postgresql/$PGVER/main/conf.d/serrado.conf" <<'EOF'
# Serrado FC: só ligações locais (socket e localhost). Nunca exposto à rede.
listen_addresses = 'localhost'
password_encryption = 'scram-sha-256'
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 8MB
maintenance_work_mem = 64MB
log_min_duration_statement = 1000
EOF
systemctl enable --now postgresql
systemctl restart postgresql
# A aplicação liga-se pelo socket com o utilizador do sistema «serrado» (autenticação peer, sem password)
runuser -u postgres -- psql -tAc "select 1 from pg_roles where rolname='serrado'" | grep -q 1 || runuser -u postgres -- createuser serrado
runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='serrado'" | grep -q 1 || runuser -u postgres -- createdb -O serrado serrado

step 'Configuração e segredos'
if [ -z "$DOMAIN" ]; then
  [ -f "$ETC/serrado.env" ] && DOMAIN=$(grep '^SITE_DOMAIN=' "$ETC/serrado.env" | cut -d= -f2)
  [ -n "$DOMAIN" ] || DOMAIN="$(curl -4 -fsS https://api.ipify.org | tr . -).sslip.io"
fi
if [ ! -f "$ETC/serrado.env" ]; then
  umask 027
  cat > "$ETC/serrado.env" <<EOF
APP_ENV=production
HOST=127.0.0.1
TRUST_PROXY=loopback
SITE_DOMAIN=$DOMAIN
CORS_ORIGINS=https://$DOMAIN
PUBLIC_URL=https://$DOMAIN
DATABASE_URL=postgresql://serrado@%2Fvar%2Frun%2Fpostgresql/serrado
BACKEND_URL=http://127.0.0.1:4100
SERVICE_TOKEN=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
EOF
  umask 022
else
  sed -i "s#^SITE_DOMAIN=.*#SITE_DOMAIN=$DOMAIN#; s#^CORS_ORIGINS=.*#CORS_ORIGINS=https://$DOMAIN#; s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" "$ETC/serrado.env"
  grep -q '^PUBLIC_URL=' "$ETC/serrado.env" || echo "PUBLIC_URL=https://$DOMAIN" >> "$ETC/serrado.env"
fi
chown root:serrado "$ETC/serrado.env" && chmod 640 "$ETC/serrado.env"

if [ ! -f "$ETC/backup.env" ]; then
  cat > "$ETC/backup.env" <<EOF
# Cópia externa cifrada com restic. Preencher para ativar (ex.: Cloudflare R2, que é grátis até 10 GB):
# RESTIC_REPOSITORY=s3:https://<ID-DA-CONTA>.r2.cloudflarestorage.com/serrado-backups
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
RESTIC_REPOSITORY=
# Guarda esta password num gestor de passwords: sem ela as cópias externas não se recuperam
RESTIC_PASSWORD=$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)
EOF
  chmod 600 "$ETC/backup.env"
  NEW_RESTIC=1
fi

step 'Comando serrado e serviços (systemd)'
install -m 755 "$HERE/serrado" /usr/local/sbin/serrado
install -m 755 "$HERE/serrado-ssh-gate" /usr/local/sbin/serrado-ssh-gate
install -m 644 "$HERE"/systemd/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable serrado-backend serrado-middleware
systemctl enable --now serrado-backup.timer

step 'Caddy'
mkdir -p /etc/caddy/tls /var/log/caddy /var/lib/caddy
chown caddy:caddy /var/log/caddy /var/lib/caddy
if [ "$CLOUDFLARE" = 1 ]; then
  touch "$ETC/cloudflare"
  install -o caddy -g caddy -m 600 "$ETC/tls/origin.pem" /etc/caddy/tls/origin.pem
  install -o caddy -g caddy -m 600 "$ETC/tls/origin.key" /etc/caddy/tls/origin.key
  [ -f /etc/caddy/cloudflare-ips.caddy ] || echo 'trusted_proxies static private_ranges' > /etc/caddy/cloudflare-ips.caddy
  GLOBAL=$'{\n\tservers {\n\t\timport /etc/caddy/cloudflare-ips.caddy\n\t\tclient_ip_headers Cf-Connecting-IP\n\t}\n}'
  TLS=$'\ttls /etc/caddy/tls/origin.pem /etc/caddy/tls/origin.key'
else
  rm -f "$ETC/cloudflare"
  GLOBAL=''
  TLS=''
fi
cat > /etc/caddy/Caddyfile <<EOF
# Gerado por deploy/server/bootstrap.sh — não editar à mão (voltar a correr o bootstrap).
$GLOBAL

$DOMAIN {
$TLS
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		# Os scripts são limitados pela CSP de cada página (meta com hashes, gerada no build);
		# aqui fica o resto: de onde vêm estilos, fontes, imagens e frames, e quem pode embutir o site
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
		Cross-Origin-Opener-Policy "same-origin"
		-Server
	}

	# API (middleware em 127.0.0.1). Passa ao middleware só o IP real do visitante.
	handle /api/* {
		reverse_proxy 127.0.0.1:4000 {
			header_up X-Forwarded-For {client_ip}
		}
	}

	handle {
		root * $ROOT/current/web
		@assets path_regexp -[0-9A-Za-z]{8}\.(js|css)$
		header @assets Cache-Control "public, max-age=31536000, immutable"
		try_files {path} {path}/index.html /index.csr.html
		file_server
	}

	log {
		output file /var/log/caddy/serrado.log {
			roll_size 10MiB
			roll_keep 5
		}
	}
}
EOF
# Validar como o utilizador caddy: a validação abre o ficheiro de log, que tem de ficar dele (e não do root)
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
chown -R caddy:caddy /var/log/caddy /var/lib/caddy
systemctl enable caddy
systemctl reload-or-restart caddy

step 'Firewall: só SSH e (80/443 para a Cloudflare, ou para todos sem Cloudflare)'
ufw default deny incoming
ufw default allow outgoing
ufw limit OpenSSH comment ssh
# Regras antigas de 80/443 abertas a todos
for rule in '80/tcp' '443/tcp' '443/udp' 'proto tcp to any port 80,443' ; do ufw --force delete allow $rule >/dev/null 2>&1 || true; done
if [ "$CLOUDFLARE" = 1 ]; then
  ufw --force enable
  serrado cf-ips
  systemctl enable --now serrado-cf-ips.timer
else
  while n=$(ufw status numbered | grep -E 'cloudflare$' | head -1 | sed -E 's/^\[ *([0-9]+)\].*/\1/' || true); [ -n "$n" ]; do ufw --force delete "$n" >/dev/null; done
  ufw allow proto tcp to any port 80,443 comment web
  ufw allow 443/udp comment web
  systemctl disable --now serrado-cf-ips.timer 2>/dev/null || true
  ufw --force enable
fi
systemctl enable --now fail2ban

if [ -n "$DEPLOY_KEY" ]; then
  step 'Utilizador deploy (GitHub Actions): só pode correr status, backup, rollback e deploy'
  [[ $DEPLOY_KEY =~ ^ssh-(ed25519|rsa)\ [A-Za-z0-9+/=]+ ]] || die 'Chave SSH inválida.'
  id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  echo "restrict,command=\"/usr/local/sbin/serrado-ssh-gate\" $DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
  cat > /etc/sudoers.d/serrado-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/local/sbin/serrado status, /usr/local/sbin/serrado backup, /usr/local/sbin/serrado rollback, /usr/local/sbin/serrado deploy *
EOF
  chmod 440 /etc/sudoers.d/serrado-deploy && visudo -cf /etc/sudoers.d/serrado-deploy
fi

step 'SSH: só com chave'
ADMIN_USER=${SUDO_USER:-root}
ADMIN_HOME=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
if [ -s "$ADMIN_HOME/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/10-serrado.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "Login por password desligado ($ADMIN_USER entra com a chave SSH)."
else
  echo "! $ADMIN_USER ainda não tem chave SSH: o login por password continua ligado. Junta uma chave e volta a correr o bootstrap."
fi

step 'Pronto'
echo "Site:           https://$DOMAIN  (fica disponível depois do primeiro deploy pelo GitHub Actions)"
echo "Firewall:       $(ufw status | grep -c ALLOW) regras · 5432 (PostgreSQL), 4000 e 4100 só locais"
echo "GitHub Actions: Settings → Secrets and variables → Actions"
echo "  variável VPS_HOST       = $(curl -4 -fsS https://api.ipify.org 2>/dev/null || echo '<IP da VPS>')"
echo "  variável SITE_DOMAIN    = $DOMAIN"
echo "  segredo  VPS_KNOWN_HOSTS:"
ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/^localhost/$(curl -4 -fsS https://api.ipify.org 2>/dev/null || echo IP)/"
if [ "${NEW_RESTIC:-0}" = 1 ]; then
  echo
  echo "IMPORTANTE: password das cópias externas (guarda-a já num gestor de passwords):"
  grep '^RESTIC_PASSWORD=' "$ETC/backup.env" | cut -d= -f2
fi
