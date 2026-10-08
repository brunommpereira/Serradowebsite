# Pôr o Serrado FC numa VPS (OVHcloud ou Hostinger) com Cloudflare e GitHub Actions

Instalação nativa, sem Docker: PostgreSQL, cópias de segurança, Node.js e Caddy correm diretamente no Ubuntu. O GitHub Actions faz o resto: constrói, instala, verifica e volta atrás se for preciso.

```
Visitante ──HTTPS──► Cloudflare (DNS, proteção, cache)
                          │  só os IPs da Cloudflare passam na firewall
                          ▼
VPS Ubuntu 24.04 ── Caddy :443 (certificado de origem da Cloudflare)
                     ├─ /        → site (ficheiros estáticos)
                     └─ /api/*   → middleware 127.0.0.1:4000 → backend 127.0.0.1:4100
                                                                      │ socket local
                                                               PostgreSQL 16 (sem porta de rede)
                     cópias: pg_dump diário (14 dias) + restic cifrado → Cloudflare R2

GitHub Actions ──SSH (utilizador «deploy», só 4 comandos)──► serrado deploy | rollback | backup | status
```

### Portas

| Porta | Quem pode entrar |
|---|---|
| 22 (SSH) | Toda a gente, mas só com chave. Tem limite de tentativas e fail2ban |
| 80 / 443 | **Só a Cloudflare** (a lista de IPs é atualizada todas as semanas). Sem Cloudflare: toda a gente |
| 4000, 4100 | Ninguém de fora: só escutam em 127.0.0.1 |
| 5432 | Ninguém de fora: o PostgreSQL só aceita ligações locais |

## 1. Escolher a VPS

| | OVHcloud VPS-1 (recomendada) | Hostinger KVM 1 |
|---|---|---|
| Onde | ovhcloud.com/pt → VPS → VPS-1 | hostinger.pt → VPS → KVM 1 |
| Localização | **França ou Alemanha** (UE, RGPD) | **Europa** |
| Sistema | **Ubuntu 24.04** | **Ubuntu 24.04** (sem painel) |
| Utilizador | `ubuntu` (com sudo) | `root` |
| Chave SSH | Junta a tua chave pública ao encomendar | Junta a tua chave pública ao criar |

Para criar uma chave no computador: `ssh-keygen -t ed25519`. A chave pública é o ficheiro `~/.ssh/id_ed25519.pub`.

## 2. Domínio e Cloudflare

Sem domínio também funciona para testar, com um endereço `<IP>.sslip.io`, mas sem Cloudflare. Nesse caso salta para o passo 3.

1. Na Cloudflare: **Add a site**, plano **Free**. Na loja onde compraste o domínio, troca os nameservers pelos dois que a Cloudflare indicar.
2. **DNS:**
   - `A  www  → IP da VPS`, com a nuvem **laranja** (proxied);
   - opcionalmente, `A  @  → IP da VPS`, também laranja, com uma *Redirect Rule* de `serradofc.pt` para `https://www.serradofc.pt`.
3. **SSL/TLS → Overview:** modo **Full (strict)**.
4. **SSL/TLS → Origin Server → Create Certificate:**
   - escolhe RSA e mantém os nomes `serradofc.pt` e `*.serradofc.pt`, com 15 anos;
   - guarda o **certificado** e a **chave privada**, que vais precisar no passo 3.
5. **SSL/TLS → Edge Certificates:** liga *Always Use HTTPS* e define *Minimum TLS* 1.2.
   - **Não ligues** o *Rocket Loader* (Speed → Optimization), a *Email Address Obfuscation* (Scrape Shield) nem a injeção automática do *Web Analytics*. Todos eles alteram ou acrescentam scripts nas páginas, e a Content-Security-Policy do site bloqueia-os.
6. **Security → WAF → Rate limiting rules** (o plano grátis tem 1 regra): `URI Path equals /api/v1/auth/login` → bloquear durante 10 s ao fim de 10 pedidos em 10 s por IP.

Não é preciso configurar a cache:
- as imagens (`/api/v1/media/…`) e os ficheiros do site já dizem ao browser e à Cloudflare quanto tempo guardar;
- as respostas JSON da API não ficam na cache da Cloudflare.

## 3. Preparar o servidor (uma vez)

No computador, cria a chave que o GitHub Actions vai usar:

```bash
ssh-keygen -t ed25519 -f serrado-deploy -N "" -C github-actions
```

Na VPS (`ssh ubuntu@IP` na OVH, `ssh root@IP` na Hostinger):

```bash
sudo apt-get update && sudo apt-get install -y git
git clone --depth 1 https://github.com/brunommpereira/Serradowebsite.git /tmp/serrado

# Só com Cloudflare: colar o certificado e a chave de origem (passo 2.4)
sudo mkdir -p /etc/serrado/tls
sudo nano /etc/serrado/tls/origin.pem     # colar o certificado
sudo nano /etc/serrado/tls/origin.key     # colar a chave privada

sudo bash /tmp/serrado/deploy/server/bootstrap.sh \
  --domain www.serradofc.pt --cloudflare \
  --deploy-key "CONTEÚDO DE serrado-deploy.pub"
```

Sem domínio, basta `sudo bash /tmp/serrado/deploy/server/bootstrap.sh --deploy-key "…"`.

O bootstrap demora cerca de 5 minutos e faz o seguinte:
1. **Pacotes:** atualiza o sistema e instala o PostgreSQL 16, o Node.js 22, o Caddy, o restic, o ufw e o fail2ban, com atualizações de segurança automáticas.
2. **Base de dados:** cria a base `serrado`, só local. A aplicação liga-se pelo socket como utilizador do sistema `serrado`, sem password guardada.
3. **Segredos:** gera-os em `/etc/serrado/serrado.env`, que fica só no servidor.
4. **Serviços:** instala os do systemd, com isolamento (sem escrita no disco e sem privilégios), e o comando `serrado`.
5. **Firewall:** configura-a como na tabela das portas acima.
6. **Utilizador `deploy`:** cria-o para o GitHub Actions. Só pode correr `status`, `backup`, `rollback` e `deploy`.
7. **SSH:** desliga o login por password, se já entras com chave.
8. **No fim:** mostra os valores a pôr no GitHub e a **password das cópias externas**. Guarda-a num gestor de passwords.

## 4. Ligar o GitHub Actions

Em **GitHub → Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `VPS_HOST` | IP da VPS |
| Variable | `SITE_DOMAIN` | `www.serradofc.pt` (ou o endereço sslip.io) |
| Secret | `VPS_SSH_KEY` | Conteúdo do ficheiro `serrado-deploy` (chave **privada**) |
| Secret | `VPS_KNOWN_HOSTS` | A linha `IP ssh-ed25519 …` que o bootstrap mostrou |

A partir daqui, **cada merge no `main`** com o CI verde corre o workflow **Deploy VPS**:
1. **Construção:** o site e os serviços são construídos no GitHub (a VPS não compila nada) e seguem para a VPS num único artefacto, com verificação sha256.
2. **Na VPS:** é feita uma cópia da BD, correm as migrações, a versão nova é ativada e confirma-se que **é a versão nova** que responde.
3. **Se não responder:** volta sozinha à versão anterior e o workflow falha.

O primeiro deploy pode ser lançado à mão: **Actions → Deploy VPS → Run workflow**.

### Operações pelo GitHub (Actions → Operações VPS → Run workflow)
- `status`: serviços, versão ativa, idade das cópias, disco.
- `backup`: cópia da base de dados agora.
- `rollback`: volta à versão anterior. As migrações da BD não são revertidas.

Também **todos os dias às 07:17 UTC** o workflow verifica o servidor e **falha (o GitHub envia email)** se:
- algum serviço estiver em baixo;
- a última cópia tiver mais de 26 horas;
- o disco estiver acima de 85%.

## 5. Primeira conta e conteúdo

Depois do primeiro deploy, na VPS:

```bash
sudo serrado admin direcao@serradofc.pt "Direção"    # mostra a password uma única vez
sudo serrado content                                  # opcional: notícias, eventos e parceiros iniciais
```

As restantes contas da equipa criam-se no backoffice: **Utilizadores**.

## 6. Cópias de segurança

| | Onde | Quando | Quanto tempo |
|---|---|---|---|
| Local | `/var/backups/serrado` (pg_dump, inclui as imagens do CMS) | Todos os dias às 03:30, antes de cada deploy e antes de cada restauro | 14 dias |
| Externa, cifrada | restic → Cloudflare R2 (ou OVH Object Storage, Backblaze…) | Logo a seguir à cópia local | 14 diárias, 8 semanais, 12 mensais |
| OVH | Cópia automática da VPS, incluída no plano, no mesmo datacenter | Diária | 7 dias |

### Ativar a cópia externa (Cloudflare R2, grátis até 10 GB)

1. **Na Cloudflare:** em **R2**, cria o *bucket* `serrado-backups`. Depois, em **Manage R2 API Tokens**, cria um token com *Object Read & Write* só para esse bucket.
2. **Na VPS:** `sudo nano /etc/serrado/backup.env` e preenche:
   ```
   RESTIC_REPOSITORY=s3:https://<ID-DA-CONTA>.r2.cloudflarestorage.com/serrado-backups
   AWS_ACCESS_KEY_ID=<access key do token>
   AWS_SECRET_ACCESS_KEY=<secret do token>
   ```
   A `RESTIC_PASSWORD` já lá está. É ela que cifra as cópias: **sem ela não se recuperam**.
3. **Testar:** `sudo serrado backup`. Deve aparecer «Cópia externa (cifrada) enviada».

### Repor

```bash
ls -lh /var/backups/serrado                                  # cópias locais
sudo serrado restore /var/backups/serrado/serrado-AAAAMMDD-HHMMSS-daily.dump
sudo serrado offsite-latest /root/recuperar                  # descarrega a última cópia externa
```

## Comandos no servidor

| Comando | O quê |
|---|---|
| `sudo serrado status` | Estado geral |
| `sudo serrado logs` | Últimos registos (middleware, backend, Caddy) |
| `sudo serrado backup` | Cópia agora |
| `sudo serrado rollback` | Versão anterior |
| `sudo serrado admin <email> "<nome>"` | Criar uma conta de administração ou repor a password |
| `sudo serrado cf-ips` | Atualizar já os IPs da Cloudflare na firewall |

Para mudar o domínio ou passar a usar a Cloudflare, volta a correr o `bootstrap.sh` com as novas opções. Os dados e os segredos mantêm-se.

## Segurança

- **Separação de serviços:** a aplicação corre como utilizador `serrado`, sem privilégios e com o disco só de leitura.
- **Rede:** o PostgreSQL e as APIs não têm portas de rede abertas.
- **Utilizador `deploy`:** a chave do GitHub não dá acesso a uma shell. Só corre os 4 comandos do `serrado-ssh-gate`.
- **IP dos visitantes:** com Cloudflare, o IP real (para o limite de tentativas de login) só é aceite quando o pedido vem dos IPs da Cloudflare.
- **Camada extra:** na OVH também podes ativar o *Network Firewall* no painel, com as mesmas regras.
- **Fechar também a porta 22:** é possível com um *Cloudflare Tunnel*, mas obriga o GitHub Actions a entrar através do Cloudflare Access. Fica como melhoria futura.

## RGPD

- **Dados na UE:** escolhe um datacenter na UE. A OVH e a Hostinger têm contrato de tratamento de dados (DPA).
- **Cópias externas:** são cifradas antes de sair do servidor. A Cloudflare só guarda dados ilegíveis.
- **Fim da experiência:** se o clube desistir, apaga a VPS no painel e o bucket R2.
