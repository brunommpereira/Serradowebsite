# Lista de verificação — site na VPS

Tudo o que é preciso garantir para pôr o site em produção e mantê-lo saudável. Os passos detalhados estão em [`DEPLOY-VPS.md`](DEPLOY-VPS.md); aqui fica a lista para ir marcando.

Legenda: **[eu]** faz-se no servidor ou num painel · **[código]** precisa de uma alteração no código antes de abrir ao público · **[decidir]** decisão da direção.

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
- [ ] **Contas da equipa** criadas no backoffice (**Utilizadores**), cada uma só com os papéis de que precisa. **[eu]**
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

## 5. Antes de abrir ao público: o que ainda é demonstração

Com a API ligada, estas partes do site **ainda não gravam nada no servidor**. Têm de ser ligadas à API ou escondidas antes do lançamento.

- [ ] **Página `/entrar`:** esconder a caixa «Contas de demonstração» em modo API, porque mostra contas e passwords que não existem no servidor. **[código]**
- [ ] **«Esqueci-me da password»:** hoje só mostra a mensagem, sem enviar nada. É preciso um serviço de email (o domínio não tem MX) e o fluxo de reposição. Até lá, a secretaria repõe as passwords. **[código] [decidir]**
- [ ] **Registo de novos sócios** (`/socios/registo`): ligar à API (pedido para a secretaria validar) ou trocar por um contacto. **[código] [decidir]**
- [ ] **Inscrição nas modalidades** (formulário em cada modalidade): ligar à API ou trocar por um contacto. **[código] [decidir]**
- [ ] **Inscrição em eventos** (página de cada evento): ligar à API ou esconder o formulário. **[código]**
- [ ] **Área de Atletas:** «Adicionar atleta» e «Convidar co-encarregado» estão escondidos em modo API. Confirmar que é isso que se quer no arranque. **[decidir]**
- [ ] **Pagamento de quotas:** o botão «Pagar quota» não aparece em modo API. Os pagamentos continuam pela secretaria até haver MB WAY/Multibanco. **[decidir]**
- [ ] **Newsletter** do rodapé: ligar a um serviço (por exemplo Brevo ou Mailchimp) ou esconder. **[código] [decidir]**

## 6. Dados reais e RGPD

- [ ] **Órgãos Sociais:** nomes reais da direção, **só com autorização** de cada pessoa. **[decidir]**
- [ ] **Importação dos atletas** (`athletes.csv` gerado pela ferramenta do Troféu de Almada) e ligação de cada conta aos seus atletas (`athlete_access`). Os ficheiros `.xlsx`/`.csv` **nunca** vão para o GitHub. **[eu]**
- [ ] **Consentimento de imagem** registado para cada atleta, antes de publicar fotos (incluindo as que vêm do Facebook). **[decidir]**
- [ ] **Política de Privacidade e de Cookies** revistas pela direção:
  - NIPC e morada reais;
  - email de contacto que funcione;
  - prazos de conservação. **[decidir]**
- [ ] **Contratos de tratamento de dados (DPA)** aceites com a OVH/Hostinger, a Cloudflare e, se usados, a Google, a Microsoft e a Meta. **[eu]**
- [ ] **Quem tem acesso a quê:** só a secretaria e a administração com acesso a CC, NIF e moradas. **[decidir]**
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
- [ ] **Sitemap no `robots.txt`:** o `public/robots.txt` aponta para `https://serradofc.pt/sitemap.xml` (sem `www`). Corrigir para `www` ou confirmar que o redirecionamento chega. **[código]**

## 8. Operação contínua

| Quando | O quê |
|---|---|
| Todos os dias (automático) | Cópia às 03:30 e verificação às 07:17 UTC (*Operações VPS*). **Se chegar um email de falha do GitHub, ver logo.** |
| Todas as semanas | Rever e aceitar os pedidos do Dependabot com o CI verde. A lista de IPs da Cloudflare é atualizada sozinha. |
| Todos os meses | `sudo serrado status` (disco abaixo de 85%). Testar um restauro da cópia externa a cada 3 meses. |
| Quando mudar alguém na direção | Retirar os papéis no backoffice a quem sai. Se essa pessoa for admin da página de Facebook, gerar um token novo. |
| A cada 24 meses | Renovar o secret da Microsoft (se usado). |
| A cada cerca de 2 anos | Atualizar `FACEBOOK_GRAPH_VERSION` quando a Meta retirar a versão em uso. |
| Atualizações do sistema | As de segurança instalam-se sozinhas. De vez em quando, `sudo apt upgrade` e reiniciar num horário calmo. |
| A cada 15 anos | Renovar o certificado de origem da Cloudflare. |
| Renovação anual | Domínio `serradofc.pt` no dominios.pt e plano da VPS. **Com renovação automática e um cartão válido.** |

## 9. Em caso de problema

- **Site em baixo:** `sudo serrado status`, depois `sudo serrado logs`. Se foi um deploy, usar *Actions → Operações VPS → rollback*.
- **Dados apagados por engano:** `ls /var/backups/serrado`, depois `sudo serrado restore <ficheiro>`, que faz uma cópia antes de repor.
- **Servidor perdido:** VPS nova, bootstrap e deploy. Depois, `sudo serrado offsite-latest /root/recuperar` e `sudo serrado restore …`. Precisa da password das cópias externas.
- **Suspeita de acesso indevido:** trocar o `JWT_SECRET` em `/etc/serrado/serrado.env` (termina todas as sessões) e reiniciar com `sudo systemctl restart serrado-middleware`. Depois, rever a auditoria no backoffice.
