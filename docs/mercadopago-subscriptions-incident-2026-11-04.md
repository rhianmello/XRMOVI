# XRMOVI — auditoria Mercado Pago Subscriptions (04/11/2026)

## Evidências verificadas
- Função Supabase: `xrmovi-pix`, versão 12, `verify_jwt=true`.
- Origem: backend utiliza `https://api.mercadopago.com`.
- Autenticação: variável de ambiente `XRMOVI_MP_ACCESS_TOKEN`, validada apenas pelo prefixo `APP_USR-`. Não registrar nem divulgar seu valor.
- Tentativa antiga: ID Mercado Pago `5617d5a824a2434c939f2e19450470d6`, criada em 30/10/2026; status `pending` no banco XRMOVI. O status efetivo no provedor deve ser lido via GET.
- Falha observada pelo usuário: HTTP 400, mensagem `Invalid preapproval status param: canceled`. O corpo completo de resposta **não** foi coletado; não representar uma mensagem isolada como JSON exato da API.

## Request real localizado no código (sem credenciais)
- Método: `PUT`
- URL: `https://api.mercadopago.com/preapproval/5617d5a824a2434c939f2e19450470d6`
- Query string: nenhuma
- Body: `{"status":"canceled"}`
- Headers: `Authorization: Bearer [REDACTED]`, `Content-Type: application/json`
- Trecho anterior: `mp(path,"PUT",{status:"canceled"})`.
- O valor é uma constante literal, não há concatenação com timestamp ou timezone nesse caminho.
- Mecanismo de reprodução SEM efeito financeiro: mocks em `tests/mercadopago-preapproval.test.mjs`.

## Busca
- Função separada: `xrmovi-create-subscription`, versão 12.
- Chamada: `GET https://api.mercadopago.com/preapproval/search?payer_email=E-MAIL-URL-ENCODED&limit=50&offset=0`.
- Body: nenhum.
- Código existente: `new URLSearchParams({payer_email:String(intent.payer_email),limit:"50",offset:String(offset)})`; não inclui `status`.
- O parâmetro `status` não é necessário nesse fluxo. Não há motivo para definir enum de search sem especificação autoritativa de valores.
- A biblioteca `preapproval-transport.js` rejeita quaisquer opções extras, inclusive `status`, antes de enviar uma requisição.

## Correção aplicada
- Origem versionada: `supabase/functions/xrmovi-pix/index.ts` e `preapproval-transport.js`.
- Usa `cancelPreapproval(mp,providerId,{initial,verifyResource,onRejected})`: GET validado antes do PUT, `PUT` com apenas `status:"canceled"` e GET de confirmação.
- Em caso EXATO de HTTP 400 com `Invalid preapproval status param: canceled`, se o GET ainda trouxer `pending`/`paused`, faz uma ÚNICA tentativa alternativa usando `status:"cancelled"`, seguida de GET. O fallback não é parte documentada como status canônico; requer homologação real.
- Logs internos redigidos registram apenas status HTTP, `error` do provedor, mensagem sanitizada e até cinco `cause[].code/description`; jamais Access Token, CPF ou e-mail intencionalmente.
- Compara `id`, `external_reference` e `collector_id` antes de liberar o estado local.
- Ao receber erro do provedor, consulta o status novamente. Nunca considera o PUT bem-sucedido por inferência.
- Se a assinatura continuar aberta ou seu estado for desconhecido, interrompe a emissão de Pix e responde `CARD_CHECKOUT_PENDING` / HTTP 409.
- Registra classe de erro e código HTTP sem token, e-mail ou corpo completo de requisição.
- A função `xrmovi-create-subscription` não foi alterada; sua pesquisa já ocorre sem `status`.

## Teste automatizado (sem chamar Mercado Pago)
```bash
node --test tests/mercadopago-preapproval.test.mjs
```
Onze testes automatizados versionados cobrem cancelamento simples, fallback condicionado, 400 diferente, 403/500, cancelamento já confirmado, assinatura autorizada, divergência de identificador, falha em ambas tentativas, busca sem status e bloqueio de timestamp. Um ensaio local com nove cenários equivalentes passou em Node 22 (9/9). O workflow de CI GitHub `.github/workflows/test-mercadopago-preapproval.yml` executa a suíte versionada no push/PR; resultado de CI ainda não confirmado.

## Requests manuais (usar somente em ambiente autorizado e controlado)
```bash
# Só leitura: não altera cobranças.
curl -sS -G 'https://api.mercadopago.com/preapproval/search' \
  -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  --data-urlencode 'limit=50' \
  --data-urlencode 'offset=0'

# CANCELA assinatura real. Execute APENAS após conferir ID/conta/status.
curl -sS -X PUT 'https://api.mercadopago.com/preapproval/SEU_ID_VALIDADO' \
  -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"status":"canceled"}'

# Confirmação de status (sempre após PUT).
curl -sS -X GET 'https://api.mercadopago.com/preapproval/SEU_ID_VALIDADO' \
  -H "Authorization: Bearer $MP_ACCESS_TOKEN"
```

## Limitação da verificação
Não foi feito PUT real para a assinatura antiga nessa intervenção: a API já retornou 400 ao usuário, e repetir a mutação sem entender a restrição do provedor pode ser inseguro. O teste automatizado usa mock. O fato de os formatos estarem corretos não prova que o provedor aceite a transição do status atual. O acesso à criação de Pix permanece bloqueado enquanto a assinatura anterior não estiver comprovadamente cancelada.

## Publicação e acompanhamento
1. [x] Alteração do backend `xrmovi-pix` v12 implantada no Supabase, com fallback estritamente condicionado.
2. [x] Fonte e testes versionados no GitHub.
3. [x] Testes locais de mock equivalentes executados: 9/9; [ ] confirmar execução dos 11 testes no CI.
4. [ ] Validar GET real com credencial de produção no backend, sem expor token.
5. [ ] Se PUT seguir em 400, coletar `error` e `cause[].code` redigidos da API e abrir chamado Mercado Pago com ID da assinatura.
6. [ ] Só depois de GET confirmar cancelamento, confirmar reconciliação XRMOVI e testar novo Pix.
7. [ ] Testar checkout completo com ambiente e usuário de teste, sem gerar cobrança indevida.

Documentação:
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/search-preapproval/get

## Resultado da tentativa real após o fallback
- Em 04/11/2026 às 19:29 UTC, o primeiro PUT retornou HTTP 400 com `Invalid preapproval status param: canceled` (observado no log interno, com dados redigidos).
- A tentativa antiga passou para `canceled` no banco após validação da resposta do provedor; o RPC `xrmovi_pix_card_cancelled` concluiu.
- Foi aberta uma nova intenção Pix, mas ela permaneceu em `created`, **sem identificador de pagamento do Mercado Pago**.
- Uma chamada subsequente à Edge Function Pix terminou em HTTP 502. Ainda não há resposta bruta suficiente para determinar a causa desse novo erro.
- Versão 12: log redigido para falhas em `POST /v1/payments`, preservando apenas HTTP status, tipo do erro e até cinco pares código/descrição sanitizada. **Não foi criado pagamento de teste para diagnosticar.**
- Recomendação: nova tentativa única e autenticada pelo próprio titular; caso falhe, verificar o log interno da função `xrmovi-pix`, sem publicar CPF, token, e-mail ou dados completos do pagador.

## Falha subsequente de Pix e correção (04/11/2026)
- Evidência visual: após confirmação por e-mail do cancelamento do plano Start, criação do Pix falhou em `POST /v1/payments` com HTTP 400: `The name of the following parameters is wrong: currency_id`.
- Causa localizada na Edge Function `xrmovi-pix`: o JSON de criação incluía `payment_method_id:"pix", currency_id:"BRL"`.
- Documentação do Mercado Pago para criação Pix em `/v1/payments` usa `transaction_amount`, `description`, `payment_method_id:"pix"` e `payer` (não envia `currency_id`).
- Correção: payload isolado no módulo `supabase/functions/xrmovi-pix/pix-payment-payload.js`; `currency_id` eliminado **somente da requisição POST**. Validação de `payment.currency_id==="BRL"` na consulta da resposta e no webhook foi preservada.
- `X-Idempotency-Key` continua utilizando `prepared.id` existente. Não foi gerada nem ativada cobrança na atualização.
- Estado de publicação: Supabase Edge Function `xrmovi-pix` versão **13**, ACTIVE, JWT habilitado; conteúdo confirmado igual ao GitHub.
- Testes: dois novos cenários versionados em `tests/mercadopago-preapproval.test.mjs`; sete verificações locais de sintaxe/contrato no Node.js 22 passaram. CI integral ainda pendente de confirmação.
- No instante da última verificação, a intenção Pix estava `created` sem ID de pagamento associado; ledger de cobrança sem registros. Uma nova tentativa única do titular poderá verificar a resposta real. Em caso de falha, usar o log redigido `XRMOVI Pix creation rejected`.
- Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
