# XRMOVI — correção de Subscriptions /preapproval (homologação)

## Escopo
Somente a Edge Function `supabase/functions/xrmovi-payment-sandbox/index.ts` e a tabela
`public.xrmovi_hml_card_subscriptions`. O código de produção
`xrmovi-create-subscription`, os dados comerciais e `bi-epc15` não foram modificados.

## Patch (diff conceitual — arquivos reais versionados no Git)
```diff
- if (action === "create_card_hml" || action === "inspect_card_hml")
+ if (["create_card_hml","inspect_card_hml","diagnose_card_hml"].includes(String(action)))

- update({ status: "pending" }) // feito antes de POST
+ update({ status: "creating", error_id: null, error_details: null })
  POST https://api.mercadopago.com/preapproval
+ if (response.ok && response.id) {
+   update({status:"created", provider_id: response.id,
+           provider_status: response.status})
+ } else if (!response.ok) {
+   const errorId = crypto.randomUUID()
+   update({status:"rejected", error_id:errorId,
+           error_details:sanitizedProviderError})
+ }
+ // Em falha de transporte, status fica creating até recuperação.
```

Arquivos:
- `supabase/functions/xrmovi-payment-sandbox/index.ts` — POST somente backend, verificação de vendedor/comprador de teste, busca paginada, tratamento de erros
- `supabase/migrations/20261112024600_xrmovi_hml_card_lifecycle.sql` — novos estados e colunas de diagnóstico
- `index.html` — exibe status local, status de provedor e error_id
- `tests/subscription-lifecycle.test.mjs` — proteções de regressão

## Payload ilustrativo (não enviar como pagamento real)

```json
{
  "reason": "XRMOVI HOMOLOGAÇÃO - Start",
  "external_reference": "xrmovi_hml_card_sandbox_only",
  "payer_email": "comprador-exemplo@testuser.com",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "end_date": "2027-11-12T02:00:00.000Z",
    "transaction_amount": 19.90,
    "currency_id": "BRL"
  },
  "back_url": "https://example.com/retorno",
  "status": "pending"
}
```

O código gera `end_date` dinamicamente, utiliza o domínio oficial do XRMOVI e só usa
um email de comprador de TESTE confirmado pela API; este email é exclusivamente ilustrativo.

## Exemplo de log sanitizado de falha (valores ilustrativos)

```json
{
  "error_id": "123e4567-e89b-42d3-a456-426614174000",
  "status": 400,
  "error": "bad_request",
  "message": "Both payer and collector must be real or test users",
  "cause": []
}
```

Não logar Access Token, tokenização de cartão, senha, CPF, email pessoal ou payload completo.

## Checklist de validação — TESTE apenas

- [x] Confirmar que browser chama somente Supabase (não chama `api.mercadopago.com/preapproval`).
- [x] Backend restringe execução ao administrador autenticado.
- [x] Segredo de teste no Supabase e diferente do token de produção.
- [x] Migração valida status local, ID do provedor e error_id.
- [x] Erro HTTP 400 histórico corrigido localmente para `rejected`.
- [ ] Testar diagnóstico das duas contas (vendedor e comprador de teste).
- [ ] Recuperar por external_reference com paginação completa.
- [ ] Apenas com ambos confirmados e registro liberado, executar uma única criação por POST.
- [ ] Conferir HTTP 2xx, `preapproval_id`, `status=created` local e `provider_status=pending`.
- [ ] Abrir link e pagar somente com cartão oficial de teste.
- [ ] Validar webhook separado e reconciliação sem registrar receita real.

**Não reiniciar automaticamente uma tentativa `creating` sem ID**: houve risco de
recurso criado remotamente sem resposta. A consulta paginada deve concluir antes de
qualquer decisão de retentar. **`rejected` não reabre automaticamente**.

## Limitação atual
O erro original HTTP 400 decorreu de identidades do comprador e vendedor incompatíveis.
O payload e a persistência estão corrigidos, mas a criação real de assinatura de TESTE
ainda depende de credencial de vendedor de teste e comprador de teste verificados.
Nenhum checkout/preapproval_id novo foi criado por este patch.
