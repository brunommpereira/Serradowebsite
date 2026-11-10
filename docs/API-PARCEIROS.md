# API de parceiros — pedidos de gasto

API para sistemas externos (ERP, plataforma de compras, outra aplicação) registarem **pedidos de gasto** no Serrado FC e acompanharem o **estado** do processo de aprovação e pagamento.

- **Endereço base:** `https://www.serradofc.pt/api/v1/partner`
- **Formato:** JSON (UTF-8), datas ISO 8601, valores em euros com ponto decimal (`"245.90"`).
- **Autenticação:** OAuth 2.0 *client credentials*. Troca o `client_id` e o `client_secret` por um token de acesso de 15 minutos.
- **Especificação OpenAPI 3.1 (Swagger):** [`docs/openapi-parceiros.yaml`](openapi-parceiros.yaml). Pode ser importada no Postman, no Insomnia ou num gerador de clientes. Foi validada e comparada com as respostas reais da API.
- **Uso:** só entre servidores. Não é para chamar a partir de um browser: o segredo nunca pode estar em código que corre no cliente.

## 1. Credenciais

As credenciais são criadas no backoffice, em **Gestão → API de parceiros**, por quem gere os utilizadores. Cada cliente tem:

| | |
|---|---|
| `client_id` | Identificador público, por exemplo `sfc_cli_85537f96cdd4d6f6` |
| `client_secret` | Segredo, por exemplo `sfc_sk_…`. É mostrado **uma única vez**; o clube só guarda o hash |
| Responsável | A conta do clube em nome de quem os pedidos são feitos (aparece como requerente e recebe os emails do pagamento) |
| Núcleos | Os núcleos para que o cliente pode pedir (`direcao`, `atletismo`, `futsal`, `rugby`); vazio = todos |

- **Novo segredo:** se o segredo for exposto, gera-se um novo no backoffice. O anterior e os tokens emitidos com ele deixam de valer de imediato.
- **Revogar:** desliga o cliente. Os pedidos já feitos mantêm-se.

## 2. Token de acesso

```
POST /api/v1/partner/oauth/token
```

As credenciais podem ir em HTTP Basic (recomendado), no corpo como formulário, ou em JSON:

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials \
  https://www.serradofc.pt/api/v1/partner/oauth/token
```

```json
{ "access_token": "sfc_at_…", "token_type": "Bearer", "expires_in": 900 }
```

- **Validade:** o token vale 15 minutos. Peça um novo quando expirar, ou ao receber `401 invalid_token`.
- **Credenciais erradas:** `401` com `{"error": "invalid_client", ...}`.
- **Outro tipo de pedido:** um `grant_type` diferente de `client_credentials` devolve `400 unsupported_grant_type`.

## 3. Registar um pedido de gasto

```
POST /api/v1/partner/expenses
Authorization: Bearer sfc_at_…
Content-Type: application/json
```

```json
{
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
| `externalRef` | recomendado | A referência no vosso sistema (1–64 caracteres: letras, algarismos, `. _ : / -`). Repetir um pedido com a mesma referência **não cria outro**: devolve o existente, com `"duplicate": true` |
| `nucleo` | sim | `direcao`, `atletismo`, `futsal` ou `rugby` (dentro dos permitidos ao cliente) |
| `category` | sim | Uma de: `Material e equipamentos`, `Deslocações e transportes`, `Inscrições, taxas e filiações`, `Arbitragem`, `Alimentação`, `Instalações e manutenção`, `Saúde e seguros`, `Comunicação e marketing`, `Serviços e honorários`, `Outros` |
| `title` | sim | 3–120 caracteres |
| `purpose` | não | Até 2000 caracteres |
| `supplier` | sim | 2–160 caracteres |
| `supplierNif` | não | 9 algarismos |
| `amount` | sim | Valor com IVA, maior que 0 e menor que 1 000 000, com 2 casas decimais |
| `dueDate` | não | Data limite de pagamento (não pode ser no passado) |
| `paymentInfo` | não | IBAN, referência MB, etc. (até 300 caracteres) |
| `files` | não | Até 3 anexos (PDF, JPG, PNG ou WebP, até 10 MB cada), em base64 |

**Resposta `201`:** o pedido com o **`id`**, que serve para consultar o estado, e o número interno (`number`, por exemplo `2026/001`). O formato é o mesmo da consulta (secção 4), com `"duplicate": false`.

O pedido entra no **fluxo normal de aprovação** do clube: os tesoureiros recebem o aviso por email, como num pedido feito no backoffice.

## 4. Consultar o estado

```
GET /api/v1/partner/expenses/{id}
GET /api/v1/partner/expenses?externalRef=ERP-2026-0042
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
| `pedido` | Aguarda aprovação do tesoureiro do núcleo | não |
| `aprovado_nucleo` | Aguarda aprovação da tesouraria da direção | não |
| `aprovado` | Aprovado, aguarda pagamento | não |
| `pago` | Pago (`payment` traz data, valor e meio de pagamento) | sim |
| `rejeitado` | Rejeitado (`rejectReason` traz o motivo) | sim |
| `anulado` | Anulado | sim |

Consulte o estado com intervalos razoáveis, por exemplo de hora a hora, até `final` ser `true`. O processo depende de pessoas e pode levar dias.

## 5. Erros e limites

| HTTP | `error` | Quando |
|---|---|---|
| 400 | `validation` / `invalid_due_date` / `invalid_file` | Dados em falta ou inválidos (o `message` explica) |
| 401 | `invalid_client` | Credenciais erradas, ou cliente revogado |
| 401 | `invalid_token` | Sem token, token inválido ou expirado: peça outro |
| 403 | `nucleo_not_allowed` | Núcleo fora dos permitidos ao cliente |
| 403 | `client_user_not_allowed` | A conta responsável deixou de poder pedir gastos (falar com o clube) |
| 404 | `not_found` | Pedido inexistente ou de outro cliente |
| 413 / 415 | `file_too_large` / `unsupported_file` | Anexo grande demais ou de tipo não aceite |
| 429 | `rate_limited` | Demasiados pedidos: aguarde um minuto |

**Limites por IP e por minuto:**
- 10 pedidos de token;
- 30 registos de pedidos;
- 120 consultas.

Todas as respostas de erro têm o formato `{"error": "...", "message": "..."}`.

## 6. Exemplo completo

```bash
BASE=https://www.serradofc.pt/api/v1/partner
TOKEN=$(curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -d grant_type=client_credentials $BASE/oauth/token | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"externalRef":"ERP-2026-0042","nucleo":"rugby","category":"Deslocações e transportes",
       "title":"Autocarro para o jogo em Coimbra","supplier":"Transportes Lda","amount":"350.00"}' \
  $BASE/expenses | jq '{id, number, status}'

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/expenses?externalRef=ERP-2026-0042" | jq '{status, statusLabel, final}'
```

## Segurança (do lado do clube)

- **Segredos e tokens:** só se guarda o SHA-256; os valores são aleatórios com 256 bits e são comparados em tempo constante.
- **Responsável:** cada pedido fica em nome da conta responsável, e essa pessoa não pode aprovar os pedidos que o cliente faz. A emissão de credenciais, as trocas de segredo e as revogações ficam na auditoria do backoffice.
- **Contas desativadas:** se a conta responsável for desativada ou perder a permissão de pedir gastos, o cliente deixa de conseguir registar pedidos.
