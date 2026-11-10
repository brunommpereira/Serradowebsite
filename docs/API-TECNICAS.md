# APIs técnicas — pedidos de gasto

APIs para sistemas externos (ERP, plataforma de compras, outra aplicação). Permitem:
- registar **pedidos de gasto** no Serrado FC;
- registar a **decisão do tesoureiro do núcleo** (aprovar ou rejeitar);
- acompanhar o **estado** do processo de aprovação e pagamento.

- **Endereço base:** `https://www.serradofc.pt/api/v1/technical`
- **Formato:** JSON (UTF-8), datas ISO 8601, valores em euros com ponto decimal (`"245.90"`).
- **Autenticação:** OAuth 2.0 *client credentials*. Troca o `client_id` e o `client_secret` por um token de acesso de 15 minutos.
- **Especificação OpenAPI 3.1 (Swagger):** [`docs/openapi-apis-tecnicas.yaml`](openapi-apis-tecnicas.yaml). Pode ser importada no Postman, no Insomnia ou num gerador de clientes. Foi validada e comparada com as respostas reais da API.
- **Uso:** só entre servidores. Não é para chamar a partir de um browser: o segredo nunca pode estar em código que corre no cliente.

## 1. Credenciais

As credenciais são criadas no backoffice, em **Gestão → APIs técnicas**, por quem gere os utilizadores. A credencial identifica o **sistema**, não uma pessoa: não fica associada a nenhum utilizador. Cada cliente tem:

| | |
|---|---|
| `client_id` | Identificador público, por exemplo `sfc_cli_85537f96cdd4d6f6` |
| `client_secret` | Segredo, por exemplo `sfc_sk_…`. É mostrado **uma única vez**; o clube só guarda o hash |
| Permissões | **Registar pedidos** e/ou **decidir como tesoureiro do núcleo** |
| Núcleos | Os núcleos com que o cliente pode trabalhar (`direcao`, `atletismo`, `futsal`, `rugby`); vazio = todos |

- **Novo segredo:** se o segredo for exposto, gera-se um novo no backoffice. O anterior e os tokens emitidos com ele deixam de valer de imediato.
- **Revogar:** desliga o cliente. Os pedidos já feitos mantêm-se.

## 2. Pessoas: quem pede e quem decide

Cada pedido indica o **email de quem pede** (`requesterEmail`), e cada decisão o **email de quem decide** (`approverEmail`). O **perfil desse email é validado no momento de cada chamada**: conta ativa e papéis e permissões atuais no clube. Uma mudança de perfil no backoffice vale logo. As regras são as mesmas do backoffice:

- **Quem pede:** tem de ter uma conta ativa no clube com permissão para pedir gastos. O pedido fica em nome dessa pessoa, que recebe os emails do processo.
- **Quem decide:** tem de ser **tesoureiro do núcleo** do pedido, como definido no backoffice. Se o núcleo não tiver outro tesoureiro além de quem pediu, decide a tesouraria da direção.
- **Ninguém decide o próprio pedido.**

## 3. Token de acesso

```
POST /api/v1/technical/oauth/token
```

As credenciais podem ir em HTTP Basic (recomendado), no corpo como formulário, ou em JSON:

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials \
  https://www.serradofc.pt/api/v1/technical/oauth/token
```

```json
{ "access_token": "sfc_at_…", "token_type": "Bearer", "expires_in": 900 }
```

- **Validade:** o token vale 15 minutos. Peça um novo quando expirar, ou ao receber `401 invalid_token`.
- **Credenciais erradas:** `401` com `{"error": "invalid_client", ...}`.
- **Outro tipo de pedido:** um `grant_type` diferente de `client_credentials` devolve `400 unsupported_grant_type`.

## 4. Registar um pedido de gasto

```
POST /api/v1/technical/expenses
Authorization: Bearer sfc_at_…
Content-Type: application/json
```

Precisa da permissão **registar pedidos**.

```json
{
  "requesterEmail": "joana.silva@serradofc.pt",
  "externalRef": "ERP-2026-0042",
  "nucleo": "rugby",
  "category": "Deslocações e transportes",
  "title": "Autocarro para o jogo em Coimbra",
  "purpose": "Deslocação da equipa sénior, 14/12",
  "supplier": "Transportes Lda",
  "supplierNif": "509999990",
  "amount": "350.00",
  "dueDate": "2026-12-15",
  "paymentInfo": "PT50 0000 0000 0000 0000 0000 0",
  "files": [{ "name": "orcamento.pdf", "data": "<PDF em base64>" }]
}
```

| Campo | Obrigatório | Regras |
|---|---|---|
| `requesterEmail` | sim | Email da conta de quem pede (sem distinguir maiúsculas) |
| `externalRef` | recomendado | A referência no vosso sistema (1–64 caracteres: letras, algarismos, `. _ : / -`). Repetir um pedido com a mesma referência **não cria outro**: devolve o existente, com `"duplicate": true` |
| `nucleo` | sim | `direcao`, `atletismo`, `futsal` ou `rugby` (dentro dos permitidos ao cliente) |
| `category` | sim | Uma de: `Material e equipamentos`, `Deslocações e transportes`, `Inscrições, taxas e filiações`, `Arbitragem`, `Alimentação`, `Instalações e manutenção`, `Saúde e seguros`, `Comunicação e marketing`, `Serviços e honorários`, `Outros` |
| `title` | sim | 3–120 caracteres |
| `purpose` | não | Até 2000 caracteres |
| `supplier` | sim | 2–160 caracteres |
| `supplierNif` | não | 9 algarismos (os espaços são ignorados) |
| `amount` | sim | Valor com IVA, maior que 0 e menor que 1 000 000, com 2 casas decimais |
| `dueDate` | não | Data limite de pagamento (não pode ser no passado) |
| `paymentInfo` | não | IBAN, referência MB, etc. (até 300 caracteres) |
| `files` | não | Até 3 anexos (PDF, JPG, PNG ou WebP, até 10 MB cada), em base64 |

**Resposta `201`:** o pedido com o **`id`**, que serve para consultar o estado e para a decisão, e o número interno (`number`, por exemplo `2026/001`). O formato é o mesmo da consulta (secção 6), com `"duplicate": false`.

O pedido entra no **fluxo normal de aprovação** do clube, e os tesoureiros recebem o aviso por email.

## 5. Decisão do tesoureiro do núcleo

```
POST /api/v1/technical/expenses/{id}/nucleo-decision
Authorization: Bearer sfc_at_…
Content-Type: application/json
```

Precisa da permissão **decidir como tesoureiro do núcleo**. Só funciona para pedidos registados pelo próprio cliente que ainda estejam no estado `pedido`.

```json
{ "approverEmail": "tesoureiro.rugby@serradofc.pt", "approve": true, "amount": "320.00", "note": "Sem o regresso à noite" }
```

| Campo | Obrigatório | Regras |
|---|---|---|
| `approverEmail` | sim | Email da conta de quem decide (ver a secção 2) |
| `approve` | sim | `true` para aprovar, `false` para rejeitar |
| `amount` | não | Só ao aprovar: valor aprovado, igual ou menor do que o pedido. Sem ele, aprova o valor pedido |
| `note` | ao rejeitar | Observações ou condições (até 1000 caracteres). **Obrigatório ao rejeitar**; fica em `rejectReason` |

**Resposta `200`:** o estado atualizado (formato da secção 6).
- **Aprovado:** o pedido passa a `aprovado_nucleo`, ou a `aprovado` se o núcleo usar o fluxo "só o tesoureiro do núcleo", e a tesouraria é avisada para o pagamento.
- **Rejeitado:** o pedido fica `rejeitado`.
- **Avisos:** quem pediu recebe o email da decisão.

## 6. Consultar o estado

```
GET /api/v1/technical/expenses/{id}
GET /api/v1/technical/expenses?externalRef=ERP-2026-0042
Authorization: Bearer sfc_at_…
```

```json
{
  "id": 1,
  "number": "2026/001",
  "externalRef": "ERP-2026-0042",
  "status": "aprovado_nucleo",
  "statusLabel": "Aguarda aprovação da tesouraria da direção",
  "final": false,
  "flow": "nucleo_direcao",
  "nucleo": "rugby",
  "title": "Autocarro para o jogo em Coimbra",
  "amount": 350.0,
  "approvedAmount": 320.0,
  "requestedAt": "2026-11-10T19:18:47.005Z",
  "updatedAt": "2026-11-11T09:02:10.120Z",
  "rejectReason": null,
  "payment": null,
  "invoiceReceived": false,
  "history": [
    { "at": "2026-11-10T19:18:47.005Z", "action": "pedido", "label": "Pedido registado" },
    { "at": "2026-11-11T09:02:10.120Z", "action": "aprovado_nucleo", "label": "Aprovado pelo tesoureiro do núcleo" }
  ]
}
```

Só se veem os pedidos feitos pelo próprio cliente. Qualquer outro `id` devolve `404`.

### Estados

| `status` | Significado | `final` |
|---|---|---|
| `pedido` | Aguarda a decisão do tesoureiro do núcleo | não |
| `aprovado_nucleo` | Aguarda aprovação da tesouraria da direção | não |
| `aprovado` | Aprovado, aguarda pagamento | não |
| `pago` | Pago (`payment` traz data, valor e meio de pagamento) | sim |
| `rejeitado` | Rejeitado (`rejectReason` traz o motivo) | sim |
| `anulado` | Anulado | sim |

Consulte o estado com intervalos razoáveis, por exemplo de hora a hora, até `final` ser `true`. O processo depende de pessoas e pode levar dias.

## 7. Erros e limites

| HTTP | `error` | Quando |
|---|---|---|
| 400 | `validation` / `invalid_due_date` / `invalid_file` | Dados em falta ou inválidos (o `message` explica) |
| 400 | `amount_too_high` / `reason_required` | Decisão com valor maior do que o pedido, ou rejeição sem motivo |
| 401 | `invalid_client` | Credenciais erradas, ou cliente revogado |
| 401 | `invalid_token` | Sem token, token inválido ou expirado: peça outro |
| 403 | `scope_not_allowed` | A credencial não tem essa permissão (registar ou decidir) |
| 403 | `nucleo_not_allowed` | Núcleo fora dos permitidos ao cliente |
| 403 | `requester_not_allowed` | Não há uma conta ativa com o `requesterEmail` que possa pedir gastos |
| 403 | `approver_not_allowed` | A pessoa do `approverEmail` não pode decidir esse pedido |
| 404 | `not_found` | Pedido inexistente ou de outro cliente |
| 409 | `invalid_state` | O pedido já não está à espera da decisão do núcleo |
| 413 / 415 | `file_too_large` / `unsupported_file` | Anexo grande demais ou de tipo não aceite |
| 429 | `rate_limited` | Demasiados pedidos: aguarde um minuto |

**Limites por IP e por minuto:**
- 10 pedidos de token;
- 30 registos e decisões;
- 120 consultas.

Todas as respostas de erro têm o formato `{"error": "...", "message": "..."}`.

## 8. Exemplo completo

```bash
BASE=https://www.serradofc.pt/api/v1/technical
TOKEN=$(curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -d grant_type=client_credentials $BASE/oauth/token | jq -r .access_token)

ID=$(curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"requesterEmail":"joana.silva@serradofc.pt","externalRef":"ERP-2026-0042","nucleo":"rugby",
       "category":"Deslocações e transportes","title":"Autocarro para o jogo em Coimbra",
       "supplier":"Transportes Lda","amount":"350.00"}' \
  $BASE/expenses | jq -r .id)

curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"approverEmail":"tesoureiro.rugby@serradofc.pt","approve":true,"amount":"320.00"}' \
  $BASE/expenses/$ID/nucleo-decision | jq '{status, approvedAmount}'

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/expenses/$ID" | jq '{status, statusLabel, final}'
```

## Segurança (do lado do clube)

- **Segredos e tokens:** só se guarda o SHA-256; os valores são aleatórios com 256 bits e são comparados em tempo constante.
- **Permissões:** cada credencial só faz o que lhe foi permitido (registar e/ou decidir), nos núcleos permitidos, e só sobre os pedidos que ela própria registou.
- **Pessoas:** as pessoas são validadas a cada pedido, pelo email e pelas permissões no clube. Uma conta desativada, ou sem a permissão, deixa de poder pedir ou decidir.
- **Auditoria:** cada decisão feita pela API fica registada com a origem ("API técnica · nome do sistema"). A emissão de credenciais, as trocas de segredo e as revogações também ficam na auditoria do backoffice.
