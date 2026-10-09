# Pôr o Serrado FC numa VPS (OVHcloud ou Hostinger) com Cloudflare e GitHub Actions

Lista para ir marcando no lançamento e na manutenção: [`CHECKLIST-VPS.md`](CHECKLIST-VPS.md).

Instalação nativa, sem Docker: PostgreSQL, cópias de segurança, os serviços em Python e o Caddy correm diretamente no Ubuntu. O GitHub Actions faz o resto: constrói, instala, verifica e volta atrás se for preciso.

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
1. **Pacotes:** atualiza o sistema e instala o PostgreSQL 16, o Python 3.12, o Caddy, o restic, o ufw e o fail2ban, com atualizações de segurança automáticas.
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
1. **Construção:** o site e os serviços são construídos no GitHub (a VPS não compila nada) e seguem para a VPS num único artefacto, com verificação sha256. As bibliotecas Python vão dentro do artefacto e a VPS confere o hash de cada uma: não descarrega nada da Internet.
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

## 5b. Entrar com Google e Microsoft (opcional)

Sócios e atletas passam a ver os botões **Continuar com Google** e **Continuar com Microsoft** em /entrar.

**Como funciona a ligação das contas:**
- **Não se criam contas novas:** só entra quem já tem conta no clube, criada pela secretaria.
- **Primeira vez:** a conta Google ou Microsoft fica ligada à conta do clube com **o mesmo email**.
- **Daí em diante:** a pessoa entra mesmo que mude o email no Google.
- **Desligar:** cada pessoa pode desligar a conta em /entrar, depois de entrar.

Os botões só aparecem para os fornecedores configurados.

### Google (grátis)

1. Em **console.cloud.google.com**, cria um projeto, por exemplo «Serrado FC».
2. **Google Auth Platform → Branding:**
   - nome «Serrado FC», com o email de suporte e o logótipo;
   - domínio autorizado `serradofc.pt`;
   - ligações para a política de privacidade (`https://www.serradofc.pt/privacidade`).
3. **Audience:** *External*. Depois carrega em **Publish app**, senão só entram os utilizadores de teste. Com os âmbitos básicos (email e perfil) não é precisa a verificação da Google.
4. **Clients → Create client:**
   - tipo *Web application*;
   - em *Authorized redirect URIs*: `https://www.serradofc.pt/api/v1/auth/oauth/google/callback`.
5. Na VPS, corre `sudo serrado oauth google` e cola o *Client ID* e o *Client secret*.

### Microsoft (Outlook, Hotmail, Live; grátis)

1. Em **entra.microsoft.com → App registrations → New registration**:
   - nome «Serrado FC»;
   - *Supported account types*: **Personal Microsoft accounts only**;
   - *Redirect URI*: tipo *Web*, com `https://www.serradofc.pt/api/v1/auth/oauth/microsoft/callback`.
2. **Certificates & secrets → New client secret**, com validade de 24 meses. Copia o **Value**.
   - Põe no calendário a data em que o secret expira: nesse dia tens de o renovar.
3. Na VPS, corre `sudo serrado oauth microsoft`. Cola o *Application (client) ID* e o *Value* do secret.

**Para desligar um fornecedor:** `sudo serrado oauth google off`.

**Outros fornecedores:**
- **Apple:** obriga a ter uma conta Apple Developer (99 €/ano).
- **Facebook:** recolhe mais dados do que precisamos.

Ficam de fora, mas podem acrescentar-se mais tarde.

## 5c. Página de Facebook → notícias e eventos (opcional)

O site vai buscar à página de Facebook do clube, de 15 em 15 minutos:
- **publicações → notícias:** o título é a primeira frase e o resto do texto fica como resumo. A foto passa a capa e a notícia leva uma ligação «Ver no Facebook». A categoria vem das hashtags (`#futsal`, `#atletismo`, `#rugby`, `#formacao`…). Se não houver nenhuma, fica «Clube»;
- **eventos → eventos:** com a data e a hora de Portugal, o local, a capa e o tipo (corrida, caminhada, torneio…). Um evento cancelado no Facebook é arquivado no site.

**Regras:**
- **Sem duplicados:** cada publicação ou evento só entra uma vez.
- **Atualizações:** se mudar no Facebook, também muda no site, **exceto se alguém já o tiver editado no backoffice**. Nesse caso a edição do site prevalece.
- **O que não entra:** as partilhas de publicações de outras páginas e as fotos sem texto.

**Custos:** a Graph API da Meta é gratuita e não se paga por pedido.

### Obter o token da página (uma vez, com a conta de um administrador da página)

1. **Criar a app:** em **developers.facebook.com → As minhas apps → Criar app**, escolhe o caso de uso **«Gerir tudo na tua Página»**. A app pode ficar em modo de desenvolvimento: quem a usa é o próprio administrador.
2. **Gerar o token:** no **Graph API Explorer**, escolhe a app e carrega em **Get Token → Get Page Access Token**. Autoriza a página do clube com as permissões `pages_show_list` e `pages_read_engagement`.
3. **Tornar o token de longa duração:** em **Access Token Tool**, carrega em **Extend Access Token** no token de *utilizador*. Depois, no Explorer, pede `GET /me/accounts` com esse token. A resposta traz o **ID da página** e um **token da página que não expira**.
4. **Na VPS:** corre `sudo serrado facebook` e cola o ID e o token.
   - **Publicar logo no site:** responde **S** (é a opção por omissão). Com **n**, tudo entra em rascunho para a equipa rever no backoffice.
   - **Filtrar por hashtag:** opcionalmente, indica uma hashtag (por exemplo `site`). Assim só entram as publicações que a tenham, o que dá ao clube controlo sobre o que vai para o site.

**Comandos:**
- `sudo serrado facebook-sync`: sincroniza agora.
- `sudo serrado facebook off`: desliga. O que já foi importado fica no site.
- `sudo serrado logs`: mostra os erros.

O token deixa de valer se o administrador mudar a password ou deixar de gerir a página. Nesse caso, gera um novo e volta a correr `sudo serrado facebook`.

> **Eventos:** a Meta tem restringido o acesso aos eventos das páginas. Se a leitura de eventos for recusada, a sincronização continua a importar as publicações e os registos mostram `eventos: OAuthException …`.

> **Imagens e RGPD:** as fotos publicadas no Facebook passam também para o site. Se alguma não puder estar no site (por exemplo, por falta de consentimento de imagem de um menor), basta despublicá-la ou trocar a capa no backoffice. Para mais controlo, usa o modo rascunho ou a hashtag.

## 5d. Pagamentos online e faturas-recibo (Stripe + Moloni ON)

Sócios e encarregados pagam as **quotas** (Área de Sócio) e as **mensalidades das escolas de futsal e rugby** (Área de Atletas → «Mensalidades e recibos») com **cartão, MB WAY ou Multibanco**.

**O que acontece em cada pagamento:**
1. **No site:** a pessoa escolhe o que paga e indica o **NIF**, que é obrigatório e validado.
2. **Sessão no Stripe:** o servidor cria a sessão do **Stripe Checkout** com os valores da base de dados. O browser nunca define valores.
3. **Confirmação:** o Stripe avisa o site por **webhook assinado**.
   - Cartão e MB WAY: o pagamento fica registado logo.
   - Multibanco: fica à espera até a referência ser paga.
4. **Fatura-recibo:** em 2 minutos, o servidor emite-a no **Moloni ON**, pede ao Moloni que a **envie por email** com o PDF e guarda o **PDF no site**, para a pessoa e a secretaria descarregarem.
5. **Se o Moloni falhar:** volta a tentar sozinho (até 6 vezes), sempre a partir do ponto onde parou. **Nunca emite dois documentos.** A verificação diária do GitHub avisa se algum ficar encravado.

**Mensalidades:**
- O valor mensal é definido por modalidade em **Backoffice → Pagamentos**.
- No **dia 1 de cada mês**, o servidor cria a mensalidade de cada atleta dessas modalidades, a vencer no dia 8.
- No mesmo ecrã é possível gerar um mês à mão. Repetir não duplica.

### Stripe
1. **Conta:** cria a conta do clube em **stripe.com**, como associação, com IBAN e documentos.
2. **Métodos de pagamento:** em **Definições → Métodos de pagamento**, ativa **MB WAY** e **Multibanco** (o cartão já vem ativo).
3. **Webhook:** em **Programadores → Webhooks → Adicionar destino**:
   - endereço: `https://www.serradofc.pt/api/v1/payments/stripe/webhook`;
   - eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`;
   - copia o **segredo de assinatura** (`whsec_…`).
4. **Chave da API:** em **Programadores → Chaves de API**, copia a **chave secreta**. Melhor ainda: cria uma **chave restrita** só com escrita em *Checkout Sessions* e leitura em *PaymentIntents* e *Charges*.
5. **Teste:** começa em **modo de teste** (chaves `sk_test_…`) e só depois passa para as chaves *live*.

### Moloni ON
1. **Acesso à API:** na empresa do clube, ativa o add-on **«API Access»**. Em **Conta → API → API Keys**, cria uma API Key (formato `apik:…`).
2. **Artigos (com o contabilista):** cria «Quota de sócio», «Mensalidade Escola de Futsal» e «Mensalidade Escola de Rugby». **O IVA ou o motivo de isenção de cada artigo é definido pelo contabilista**, e o site usa o que estiver no artigo.
3. **Métodos de pagamento:** confirma que existem no Moloni (por exemplo, Cartão, MB WAY e Multibanco).

### Ligar na VPS
```bash
sudo serrado payments        # pede as chaves do Stripe e do Moloni; mostra as séries, os artigos e os métodos para escolheres
```
- **Artigos:** são indicados como `quota:ID,futsal:ID,rugby:ID`.
- **Métodos de pagamento:** são indicados como `card:ID,mb_way:ID,multibanco:ID,cash:ID,transfer:ID`, com os IDs do Moloni. `cash` (numerário) e `transfer` (transferência) servem os pagamentos registados na secretaria (**Backoffice → Pagamentos → Registar pagamento**); `cheque:ID` também é aceite.
- **Timers:** o comando ativa os recibos (de 2 em 2 minutos) e as mensalidades (dia 1 de cada mês).

**Outros comandos:**
- `sudo serrado receipts`: emite agora os recibos em falta.
- `sudo serrado fees 2026-11`: gera as mensalidades de novembro.
- `sudo serrado moloni-info`: mostra as séries, os artigos e os métodos de pagamento do Moloni.
- `sudo serrado payments off`: desliga os pagamentos.

> **Testar antes de abrir:** faz um pagamento real pequeno com cada método e confirma três coisas: a quota fica «Pago», o email com a fatura-recibo chega e o PDF descarrega-se no site.

## 5e. Emails do site: recuperar password e convites (Brevo)

Sem isto, «Esqueci-me da password» pede para contactar a secretaria. Com a Brevo (plano grátis: 300 emails por dia):

- **«Esqueci-me da password»:** a pessoa recebe uma ligação de uso único, válida durante 1 hora. Ao definir a nova password, as sessões abertas noutros dispositivos terminam.
- **Convites:** em **Backoffice → Utilizadores → Enviar convite**, a pessoa recebe uma ligação (7 dias) para definir a primeira password.

1. **Conta:** cria a conta do clube em brevo.com (servidores na UE; aceita o contrato de tratamento de dados).
2. **Domínio:** em **Senders, Domains & Dedicated IPs → Domains**, adiciona `serradofc.pt` e cria na Cloudflare os registos DNS que a Brevo indica (TXT de verificação, DKIM e DMARC). Sem isto, os emails vão para o spam.
3. **Remetente:** adiciona `nao-responder@serradofc.pt` (ou outro do domínio) como remetente.
4. **Chave:** em **SMTP & API → API Keys**, cria uma chave só para o site.
5. **Na VPS:**
```bash
sudo serrado email                       # pede a chave, o remetente e o nome; liga o envio (a cada minuto)
sudo serrado email test o-teu@email.pt   # envia um email de teste
sudo serrado email off                   # desliga
```
Se a VPS já tinha sido instalada antes desta versão, corre outra vez o `bootstrap.sh` (com as mesmas opções) para instalar o serviço `serrado-mail`.

> `sudo serrado status` mostra `mail_failed`: emails que falharam 6 tentativas. A verificação diária avisa.

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
| `sudo serrado payments` / `receipts` / `fees AAAA-MM` / `moloni-info` | Pagamentos online e faturas-recibo |
| `sudo serrado email` / `email test <endereço>` / `email off` | Emails do site (Brevo): recuperar password e convites |
| `sudo serrado facebook` / `facebook-sync` / `facebook off` | Ligar, sincronizar agora ou desligar a página de Facebook |
| `sudo serrado oauth google` / `microsoft` | Ativar a entrada com Google ou Microsoft (`… off` para desativar) |

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
