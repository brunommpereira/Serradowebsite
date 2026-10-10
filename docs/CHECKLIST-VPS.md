# Lista de verificação — site na VPS

Tudo o que é preciso garantir para pôr o site em produção e mantê-lo saudável. Os passos detalhados estão em [`DEPLOY-VPS.md`](DEPLOY-VPS.md); aqui fica a lista para ir marcando.

Legenda: **[eu]** faz-se no servidor ou num painel · **[código]** precisa de uma alteração no código antes de abrir ao público · **[decidir]** decisão da direção.

---

## ⚠️ Pendente: segurança da VPS (fazer antes de abrir ao público)

O site já está no ar (VPS OVH, Ubuntu 26.04), mas faltam estes passos:

- [ ] **Password das cópias externas (restic):** copiar para um gestor de passwords (Bitwarden, 1Password…) e, se possível, guardar também uma cópia em papel num sítio seguro. Sem ela, as cópias externas não se recuperam. Se já não estiver no ecrã: `sudo grep RESTIC_PASSWORD /etc/serrado/backup.env`. **[eu]**
- [ ] **Secrets no gestor de passwords** (Bitwarden, 1Password…), numa pasta «Serrado FC – servidor» partilhada só com quem gere o servidor. As cópias de segurança só levam a base de dados, não o `/etc/serrado`: se a VPS se perder, é daqui que se recupera tudo. **[eu]**
  - `/etc/serrado/serrado.env` inteiro (`sudo cat /etc/serrado/serrado.env`): inclui `JWT_SECRET` e `SERVICE_TOKEN` (gerados no bootstrap), email (`SMTP_*`), Google e Microsoft (`*_CLIENT_ID/SECRET`) e, quando existirem, Stripe, Moloni e Facebook;
  - `RESTIC_PASSWORD` e os dados do R2 (`/etc/serrado/backup.env`);
  - certificado e chave da Cloudflare (`/etc/serrado/tls/origin.pem` e `origin.key`), ou só a nota de que se geram de novo na Cloudflare;
  - a chave SSH privada do GitHub Actions (`serrado-deploy`) e a tua chave pessoal da VPS;
  - acessos aos painéis: OVH, Cloudflare, GitHub, dominios.pt, Google Cloud, Microsoft Entra, Stripe, Moloni.
  - **Sempre que mudares um secret** (`sudo serrado …`), atualiza também o gestor.
- [ ] **Chaves com o mínimo de acesso:** token do R2 só para o bucket das cópias; no Stripe, chave restrita; no Moloni, um utilizador só para o site; caixa de email própria para o site. Se uma chave escapar, revoga-se só essa no painel do serviço. **[eu]**
- [ ] **Conta de administração própria:** `sudo serrado admin direcao@serradofc.pt "Direção"` (a password vai para o gestor de passwords). Depois, retirar o papel de admin às contas que não precisam dele. **[eu]**
- [ ] **Cópias externas no Cloudflare R2:** bucket `serrado-backups` e token só com acesso a esse bucket; preencher `RESTIC_REPOSITORY`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` em `/etc/serrado/backup.env` e testar com `sudo serrado backup` (deve aparecer «Cópia externa (cifrada) enviada»). Ver `DEPLOY-VPS.md`, secção 6. **[eu]**
- [ ] **Entrada por SSH só com chave:**
  1. no teu computador: `ssh-keygen -t ed25519 -f %USERPROFILE%\.ssh\serrado-vps` (Windows) ou `ssh-keygen -t ed25519 -f ~/.ssh/serrado-vps`;
  2. acrescentar a chave **pública** (`serrado-vps.pub`) a `/home/ubuntu/.ssh/authorized_keys` na VPS;
  3. confirmar, **numa janela nova**, que `ssh -i serrado-vps ubuntu@51.210.245.108` entra sem pedir password;
  4. só então correr outra vez o `bootstrap.sh` (com as mesmas opções), que desliga a entrada por password. **[eu]**
- [ ] **Cloudflare → WAF:** regra de rate limit em `/api/v1/auth/login` (10 pedidos em 10 s por IP → bloquear 10 s). **[eu]**
- [ ] **Confirmar:** `sudo serrado status` todo verde; `nmap 51.210.245.108` só com a porta 22 aberta; `curl -m 5 http://51.210.245.108` falha. **[eu]**

---

## 1. Antes da instalação

- [ ] **VPS** na UE (França, Alemanha…), com Ubuntu 24.04, x86_64, e a tua chave SSH. **[eu]**
- [ ] **Domínio** `serradofc.pt` com os nameservers na Cloudflare (já feito). **[eu]**
- [ ] **Cloudflare → DNS:** `A www` e `A @` com o IP da VPS, os dois com a **nuvem laranja**. **[eu]**
- [ ] **Cloudflare → SSL/TLS:**
  - modo **Full (strict)**;
  - **Always Use HTTPS** ligado;
  - **TLS mínimo 1.2**. **[eu]**
- [ ] **Cloudflare → Origin Server:** certificado de origem criado, com o certificado e a chave guardados. **[eu]**
- [ ] **Cloudflare → Redirect Rule:** `serradofc.pt` → `https://www.serradofc.pt`. **[eu]**
- [ ] **Cloudflare → WAF:** regra de rate limit em `/api/v1/auth/login`. **[eu]**
- [ ] **Cloudflare, desligado:** *Rocket Loader*, *Email Address Obfuscation* e a injeção automática do *Web Analytics*. Partem a política de segurança (CSP) do site. **[eu]**
- [ ] **Chave SSH do GitHub Actions:** criada com `ssh-keygen -t ed25519 -f serrado-deploy`. **[eu]**

## 2. Instalação (uma vez)

- [ ] **Certificado de origem na VPS:** em `/etc/serrado/tls/origin.pem` e `origin.key`. **[eu]**
- [ ] **Bootstrap:** `sudo bash bootstrap.sh --domain www.serradofc.pt --cloudflare --deploy-key "…"`. **[eu]**
- [ ] **Password das cópias externas** (aparece no fim do bootstrap) guardada num gestor de passwords. **Sem ela, as cópias não se recuperam.** **[eu]**
- [ ] **GitHub → Settings → Secrets and variables → Actions:**
  - variáveis `VPS_HOST` e `SITE_DOMAIN`;
  - secrets `VPS_SSH_KEY` e `VPS_KNOWN_HOSTS`. **[eu]**
- [ ] **Primeiro deploy:** *Actions → Deploy VPS → Run workflow*, com resultado verde. **[eu]**
- [ ] **Conta de administração:** `sudo serrado admin direcao@serradofc.pt "Direção"`. A password fica guardada no gestor. **[eu]**
- [ ] **Conteúdo inicial**, só se o CMS estiver vazio: `sudo serrado content`. **[eu]**
- [ ] **Contas da equipa** criadas no backoffice (**Utilizadores**), cada uma só com os papéis de que precisa (secretaria, tesouraria, comunicação, treinador…). **[eu]**
- [ ] **Papéis e permissões** revistos em **Backoffice → Papéis e permissões**: quem vê dados sensíveis (`athletes.sensitive`) e quem mexe nos pagamentos (`payments.manage`). **[decidir]**
- [ ] **Nunca** correr o seed de demonstração no servidor: apaga tudo e cria contas com passwords públicas. **[eu]**

## 3. Cópias de segurança

- [ ] **Cloudflare R2:** bucket `serrado-backups` e token só com acesso a esse bucket. **[eu]**
- [ ] **Configuração na VPS:** `/etc/serrado/backup.env` preenchido. `sudo serrado backup` mostra «Cópia externa (cifrada) enviada». **[eu]**
- [ ] **Teste de restauro (obrigatório pelo menos uma vez):** `sudo serrado offsite-latest /root/teste`, confirmando que a cópia abre. **[eu]**
- [ ] **Cópia automática da OVH** ativa, se o plano a incluir. **[eu]**

## 4. Opcionais já preparados

- [ ] **Entrar com Google:**
  - projeto na Google Cloud **publicado** (não em teste);
  - endereço de retorno `https://www.serradofc.pt/api/v1/auth/oauth/google/callback`;
  - `sudo serrado oauth google`. **[eu]**
- [ ] **Entrar com Microsoft:**
  - app «Personal Microsoft accounts only»;
  - `sudo serrado oauth microsoft`;
  - **data em que o secret expira (24 meses) no calendário**. **[eu]**
- [ ] **Página de Facebook:**
  - app da Meta e token **da página**, que não expira;
  - `sudo serrado facebook`;
  - decidir entre publicar logo ou rascunho, e se usam uma hashtag de controlo. **[eu] [decidir]**
  - Confirmar em `sudo serrado logs` se a Meta deixa ler os eventos. Se não deixar, só entram as publicações.

- [ ] **Pagamentos online** (`DEPLOY-VPS.md`, 5d): **[eu]**
  - conta Stripe do clube com MB WAY e Multibanco ativos;
  - webhook com os 4 eventos;
  - Moloni ON com o add-on «API Access», a API Key e os artigos criados **com o contabilista** (IVA/isenção);
  - `sudo serrado payments`;
  - primeiro em modo de teste. Depois, um pagamento real com cada método: quota «Pago», email com o recibo e PDF no site;
  - um pagamento registado na secretaria (numerário) com fatura-recibo: confirmar no Moloni o método «Numerário» (`cash:ID` em `MOLONI_PAYMENT_METHODS`).
- [ ] **Emails** (`DEPLOY-VPS.md`, 5e): **[eu]**
  - caixa do domínio (dominios.pt): MX, SPF, DKIM e DMARC na Cloudflare, registos de email com a nuvem cinzenta; ou a Brevo, com o domínio autenticado;
  - `sudo serrado email smtp` (ou `brevo`) e `sudo serrado email test …`, confirmando que não chega ao spam.
- [ ] **Valores das mensalidades:** futsal e rugby definidos em **Backoffice → Pagamentos**. **[decidir]**

## 5. Antes de abrir ao público: o que ainda é demonstração

Com a API ligada, estas partes do site **ainda não gravam nada no servidor**. Em modo API, o site já as **esconde ou troca por um aviso** com o email, o telefone e os contactos da secretaria. Ficam a faltar só as decisões.

- [x] **`/entrar`:** a caixa «Contas de demonstração» não aparece em modo API.
- [x] **«Esqueci-me da password»:** em modo API, mostra um aviso para contactar a secretaria, que repõe a password.
- [x] **Recuperação da password por email:** feita (caixa do domínio ou Brevo). Falta configurar (ver a secção 4).
- [x] **Registo de novos sócios** (`/socios/registo`) e **inscrição de atletas** (`/inscricao`, também a partir da página de cada modalidade): online, com condições, RGPD, autorização de imagem e aceitação com confirmação por email. São propostas: a secretaria aceita ou recusa em Backoffice → Propostas.
- [ ] **Documentos legais publicados** em **Backoffice → Registos online → Documentos legais** (condições de sócio, regulamento de atleta, RGPD e imagem). Há modelos para começar, mas **têm de ser revistos pela direção** (e, se possível, por um jurista). Até estarem os quatro publicados, os formulários mostram um aviso. **[decidir]**
- [ ] **Teste completo antes de abrir:** um registo de sócio e uma inscrição de um menor (assinada pelo encarregado). Confirmar que chega o email com o PDF e o convite, e que aparecem em **Registos online**. **[eu]**
- [x] **Inscrição em eventos:** em modo API, mostra um aviso para tratar na secretaria.
- [ ] **Área de Atletas:** «Adicionar atleta» e «Convidar co-encarregado» estão escondidos em modo API. Confirmar que é isso que se quer no arranque. **[decidir]**
- [x] **Pagamento de quotas e mensalidades:** feito com o Stripe (cartão, MB WAY e Multibanco) e faturas-recibo no Moloni ON. Falta configurar (ver a secção 4).
- [x] **Newsletter do rodapé:** não aparece em modo API.
- [ ] Decidir se a newsletter usa um serviço de envio (por exemplo Brevo ou Mailchimp). **[decidir]**

## 6. Dados reais e RGPD

- [ ] **Órgãos Sociais:** nomes reais da direção (Backoffice → Conteúdos do site → Órgãos Sociais), **só com autorização** de cada pessoa. **[decidir]**
- [ ] **Conteúdos do site** (Backoffice → Conteúdos do site): rever contactos e telefone, texto e história do Clube, documentos em PDF (estatutos, relatórios e contas), loja, jogos da época e modalidades. Enquanto não forem editados, o site mostra os textos de exemplo. **[eu]**
- [ ] **Importação dos sócios e depois dos atletas** em **Backoffice → Importar** (CSV ou XLSX; o botão «Descarregar modelo» mostra as colunas). Primeiro «Verificar»: com algum erro não se grava nada. Com o email do encarregado, ele fica com acesso à ficha. Os ficheiros `.xlsx`/`.csv` **nunca** vão para o GitHub nem para pastas partilhadas. **[eu]**
- [ ] **Convites:** depois de importar, enviar o convite (Backoffice → Sócios → ficha → «Enviar convite», ou Utilizadores) a quem vai usar o site. Precisa do email configurado (secção 4). **[eu]**
- [ ] **Quotas por categoria** definidas em **Backoffice → Pagamentos** (valor e se é mensal ou anual). São criadas no dia 1 de cada mês, com as mensalidades. **[decidir]**
- [ ] **Consentimento de imagem** registado para cada atleta, antes de publicar fotos (incluindo as que vêm do Facebook). **[decidir]**
- [ ] **Política de Privacidade e de Cookies** revistas pela direção:
  - NIPC e morada reais;
  - email de contacto que funcione;
  - prazos de conservação. **[decidir]**
- [ ] **Contratos de tratamento de dados (DPA)** aceites com a OVH/Hostinger, a Cloudflare, a Brevo e, se usados, a Google, a Microsoft, a Meta, o Stripe e o Moloni. **[eu]**
- [ ] **Quem tem acesso a quê:** só quem tem `athletes.sensitive` vê CC, NIF e moradas (de origem: secretaria e administração). Confirmar em **Papéis e permissões**. **[decidir]**
- [ ] **Registo das atividades de tratamento** (RGPD, art. 30.º) atualizado com o site. **[decidir]**

## 7. Verificações depois do primeiro deploy

- [ ] `https://www.serradofc.pt` abre com cadeado, e `http://` e `serradofc.pt` redirecionam para lá.
- [ ] `https://www.serradofc.pt/api/health` responde `{"ok":true,"version":"<sha do último commit>"}`.
- [ ] **Login de sócio e de atleta:** no browser, o cookie `sfc_session` aparece como `HttpOnly`, `Secure` e `SameSite=Strict`.
- [ ] **Backoffice:**
  - criar uma notícia, publicá-la e confirmar que aparece no site em menos de um minuto;
  - carregar uma imagem.
- [ ] **Consola do browser** (F12) sem erros de CSP em várias páginas.
- [ ] **Do teu computador**, sem passar pela Cloudflare:
  - `curl -m 5 http://IP-da-VPS` **falha**;
  - as portas 4000, 4100 e 5432 estão fechadas (`nmap IP-da-VPS`: só a 22 aberta).
- [ ] **SSH:** só entra com chave (o login com password está desligado).
- [ ] `sudo serrado status` está tudo verde: serviços, versão, cópia de hoje e disco.
- [ ] **Rollback:** *Actions → Operações VPS → rollback* volta à versão anterior; depois, faz deploy de novo.
- [ ] **Google Search Console:** domínio verificado e `https://www.serradofc.pt/sitemap.xml` submetido.
- [x] **Sitemap no `robots.txt`:** já aponta para `https://www.serradofc.pt/sitemap.xml`. As áreas reservadas e o backoffice ficam fora dos motores de busca.

## 8. Operação contínua

| Quando | O quê |
|---|---|
| Todos os dias (automático) | Cópia às 03:30 e verificação às 07:17 UTC (*Operações VPS*). **Se chegar um email de falha do GitHub, ver logo.** |
| Todas as semanas | Rever e aceitar os pedidos do Dependabot com o CI verde. A lista de IPs da Cloudflare é atualizada sozinha. |
| Todos os meses | `sudo serrado status` (disco abaixo de 85%). Testar um restauro da cópia externa a cada 3 meses. |
| Quando mudar alguém na direção | Retirar os papéis no backoffice a quem sai (vale logo, mesmo com a sessão aberta). Se essa pessoa for admin da página de Facebook, gerar um token novo. |
| A cada 24 meses | Renovar o secret da Microsoft (se usado). |
| A cada cerca de 2 anos | Atualizar `FACEBOOK_GRAPH_VERSION` quando a Meta retirar a versão em uso. |
| Quando a verificação diária avisar de recibos encravados | **Backoffice → Pagamentos**: ver o erro do Moloni e carregar em «Tentar outra vez». |
| Atualizações do sistema | As de segurança instalam-se sozinhas. De vez em quando, `sudo apt upgrade` e reiniciar num horário calmo. |
| A cada 6 meses (ou num alerta de segurança do Caddy) | Atualizar o Caddy: mudar `CADDY_VERSION` e os SHA-512 em `deploy/server/bootstrap.sh` (ficheiro `caddy_<versão>_checksums.txt` da release no GitHub) e voltar a correr o bootstrap. O Caddy deixou de vir de um repositório apt, por isso não se atualiza sozinho. |
| A cada 15 anos | Renovar o certificado de origem da Cloudflare. |
| Renovação anual | Domínio `serradofc.pt` no dominios.pt e plano da VPS. **Com renovação automática e um cartão válido.** |

## 9. Em caso de problema

- **Site em baixo:** `sudo serrado status`, depois `sudo serrado logs`. Se foi um deploy, usar *Actions → Operações VPS → rollback*.
- **Dados apagados por engano:** `ls /var/backups/serrado`, depois `sudo serrado restore <ficheiro>`, que faz uma cópia antes de repor.
- **Servidor perdido:** VPS nova, bootstrap e deploy. Depois, `sudo serrado offsite-latest /root/recuperar` e `sudo serrado restore …`. Precisa da password das cópias externas.
- **Suspeita de acesso indevido:** trocar o `JWT_SECRET` em `/etc/serrado/serrado.env` (termina todas as sessões) e reiniciar com `sudo systemctl restart serrado-middleware`. Depois, rever a auditoria no backoffice.
