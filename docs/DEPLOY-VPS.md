# Pôr o Serrado FC numa VPS (Hostinger KVM 1)

Guia para instalar o site, o backoffice e a base de dados numa VPS. Foi escrito para a Hostinger KVM 1, mas serve para qualquer VPS com Ubuntu.

```
Internet ──HTTPS──► Caddy (site + certificado)
                      ├─ /        → site Angular
                      └─ /api/*   → middleware ──► backend ──► PostgreSQL
                                    (rede interna do Docker; só o Caddy tem portas abertas)
```

- **Mesmo endereço para tudo:** o site e a API ficam no mesmo endereço, por isso o login funciona em todos os browsers, incluindo Safari e iPhone.
- **Firewall:** só as portas 22 (SSH), 80 e 443 ficam abertas.
- **Manutenção automática:** HTTPS, atualizações de segurança e cópias da base de dados são automáticos.
- **GitHub Pages:** o site no GitHub Pages continua igual, em modo demonstração.

## 1. Comprar a VPS

Em hostinger.pt, escolher **VPS → KVM 1**.

| Opção | Escolher |
|---|---|
| Período | 1 mês para experimentar. É mais caro por mês do que 12 ou 24 meses, mas não obriga a ficar |
| Localização do servidor | **Europa** (por exemplo França, Países Baixos ou Lituânia). Obrigatório por causa do RGPD |
| Sistema operativo | **Ubuntu 24.04** (simples ou “with Docker”, os dois servem) |
| Painel de controlo | Nenhum |
| Password de root | Uma password forte, guardada num gestor de passwords |
| Chave SSH | Opcional, mas recomendada (passo 7) |

Quando a VPS estiver pronta, anota o **IP** que aparece no hPanel (por exemplo `82.25.1.2`).

## 2. Entrar na VPS

No computador, abrir um terminal (PowerShell no Windows, Terminal no Mac) e correr:

```bash
ssh root@82.25.1.2
```

Alternativa: no hPanel, **VPS → Terminal do browser**.

## 3. Instalar (um único comando, demora 10 a 15 minutos)

```bash
git clone https://github.com/brunommpereira/Serradowebsite.git /opt/serrado
bash /opt/serrado/deploy/install.sh --admin-email direcao@serradofc.pt --admin-name "Direção" --content
```

O script faz o seguinte:
1. Atualiza o sistema e ativa as atualizações de segurança automáticas.
2. Instala o Docker, a firewall (ufw) e o fail2ban.
3. Gera os segredos (password da base de dados, tokens) em `/opt/serrado/deploy/.env`. Este ficheiro nunca vai para o GitHub.
4. Constrói e arranca tudo, e aplica as migrações da base de dados.
5. Com `--content`, carrega o conteúdo inicial do site (notícias, eventos e parceiros de exemplo), que depois se edita no backoffice.
6. Cria a conta de administração e **mostra a password uma única vez**. Guarda-a.
7. Agenda uma cópia da base de dados todos os dias às 03:30.

No fim mostra o endereço, por exemplo **https://82-25-1-2.sslip.io**. O `sslip.io` é um serviço gratuito que transforma o IP num nome com certificado HTTPS. Serve para testar enquanto não houver domínio.

## 4. Experimentar

- **Site:** `https://<endereço>/`
- **Backoffice:** `https://<endereço>/entrar` → «Equipa do clube? Entrar no backoffice», com o email e a password do passo 3.
- **Criar as contas da equipa:** em **Backoffice → Utilizadores**, atribuir os papéis (editor, secretaria, treinador).

### O que já funciona com dados reais e o que falta

| | Estado |
|---|---|
| Site público (notícias, eventos, parceiros, páginas) | ✅ Vem do CMS e da base de dados |
| Backoffice: CMS, validações, importação de resultados, utilizadores, auditoria | ✅ Real |
| Atletas na base de dados (importação, ficha, permissões por papel) | ✅ Real (ver «Importar atletas») |
| **Área de Sócio e Área de Atletas** (o que sócios e encarregados veem) | ⚠️ Ainda mostram dados de demonstração. Ligá-las à API é a próxima fase |

## 5. Domínio próprio (quando houver)

1. Comprar o domínio, por exemplo `serradofc.pt`.
2. No DNS do domínio, criar um registo **A**: `www` → IP da VPS. Opcionalmente, outro **A** para `@` com o mesmo IP.
3. Na VPS:
   ```bash
   bash /opt/serrado/deploy/install.sh --domain www.serradofc.pt
   ```
   O certificado HTTPS é emitido automaticamente em menos de um minuto.

## 6. Deploy automático a cada merge (opcional)

Assim, cada merge no `main` com o CI verde atualiza a VPS sozinho.

1. No computador, criar uma chave só para isto:
   ```bash
   ssh-keygen -t ed25519 -f serrado-deploy -N "" -C "github-actions"
   ```
2. Na VPS, criar o utilizador `deploy`, que só pode correr o `update.sh`:
   ```bash
   bash /opt/serrado/deploy/install.sh --deploy-key "CONTEÚDO DE serrado-deploy.pub"
   ssh-keyscan -t ed25519 localhost | sed "s/^localhost/82.25.1.2/"   # copia o resultado
   ```
3. No GitHub, em **Settings → Secrets and variables → Actions**:
   - **Variables:**
     - `VPS_HOST` = IP da VPS
     - `SITE_DOMAIN` = endereço do site (opcional)
   - **Secrets:**
     - `VPS_SSH_KEY` = conteúdo do ficheiro `serrado-deploy` (a chave privada)
     - `VPS_KNOWN_HOSTS` = a linha copiada no ponto 2

Sem `VPS_HOST` configurado, o workflow **Deploy VPS** fica inativo.

## 7. Segurança recomendada

Depois de entrares com uma chave SSH, desliga o login por password:

```bash
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart ssh
```

Cuidados a ter:
- Não partilhar o `/opt/serrado/deploy/.env`.
- Não abrir mais portas na firewall.
- Usar uma password forte e única na conta de administração.

## Operação do dia a dia

Todos os comandos correm na VPS, como root. Para encurtar:

```bash
alias dc='docker compose -f /opt/serrado/deploy/docker-compose.prod.yml --env-file /opt/serrado/deploy/.env'
```

| Tarefa | Comando |
|---|---|
| Estado dos serviços | `dc ps` |
| Ver erros | `dc logs --tail 100 middleware backend` |
| Atualizar para o último `main` | `/opt/serrado/deploy/update.sh` |
| Reiniciar | `dc restart` |
| Nova conta de administração, ou repor a password | `dc run --rm migrate node db/create-admin.ts email@serradofc.pt "Nome"` |
| Cópia de segurança agora | `/opt/serrado/deploy/backup.sh` |
| Listar cópias | `ls -lh /var/backups/serrado` |

### Repor uma cópia de segurança

```bash
dc exec -T db pg_restore -U serrado -d serrado --clean --if-exists < /var/backups/serrado/serrado-AAAAMMDD-HHMM.dump
```

As cópias incluem as imagens do CMS, que estão na base de dados. As cópias diárias ficam **dentro** da VPS, guardadas durante 14 dias. Ativa também os backups da Hostinger (snapshots), que ficam fora da VPS. De vez em quando descarrega uma cópia para o computador do clube:

```bash
scp root@82.25.1.2:/var/backups/serrado/serrado-*.dump .
```

### Importar atletas

Usar o `athletes.csv` gerado por `tools/trofeu-almada/consolidate.py --import-dir`:

```bash
dc exec -T db psql -U serrado -d serrado -c "\copy athletes (code,name,gender,birth_date,id_number,tax_number,email,phone,address,sport_slug,category,shirt_size) from stdin csv header" < athletes.csv
```

Os resultados do Troféu de Almada importam-se no backoffice: **Resultados → Importar**.

## RGPD

- **Período de experiência:** se o clube decidir não continuar, **apaga a VPS** no hPanel. Isso destrói o disco e os dados.
- **Dados reais:** só importar dados reais de atletas e sócios com a VPS num datacenter da UE.
- **Contrato com a Hostinger:** guardar o contrato de tratamento de dados (DPA) da Hostinger. Está nos termos do serviço.
