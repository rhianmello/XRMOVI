# XRMOVI — Ativação do pagamento automático Mercado Pago

**Estado:** código e funções implantados; cobranças reais protegidas até configurar as credenciais e testar a integração.

## 1. Configurar o Mercado Pago

1. Acesse https://www.mercadopago.com.br/developers/panel/app com a conta recebedora das mensalidades do XRMOVI.
2. Crie ou selecione uma aplicação exclusiva do XRMOVI e habilite Assinaturas.
3. Em credenciais de produção, copie o Access Token que começa com APP_USR-. Nunca compartilhe a chave.
4. No menu Webhooks, configure:
   https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/xrmovi-billing-webhook
5. Habilite os eventos subscription_authorized_payment, subscription_preapproval e payment quando disponíveis.
6. Salve e obtenha a assinatura secreta do webhook; ela é diferente do Access Token.

**Atenção:** a documentação do Mercado Pago informa que o modo de configuração de notificações para Assinaturas pode ser diferente da configuração padrão de Webhooks em Suas integrações. Antes de habilitar clientes pagantes, confirme na própria aplicação que os tópicos de assinatura chegam à URL configurada, com assinatura válida. Se sua integração não disponibilizar esses tópicos por esse painel, mantenha XRMOVI_BILLING_ENABLED desativado e siga o procedimento indicado pelo Mercado Pago para assinaturas.

Documentação oficial:
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks

## 2. Adicionar os segredos no Supabase

Acesse o painel https://supabase.com/dashboard/project/ztqtcbzjesrkuaijmylm/settings/functions e abra Edge Functions > Secrets.

| Secret | Valor |
|---|---|
| XRMOVI_MP_ACCESS_TOKEN | Access Token de PRODUÇÃO exclusivo do XRMOVI, prefixo APP_USR- |
| XRMOVI_MP_WEBHOOK_SECRET | Chave secreta de assinatura do webhook do Mercado Pago |
| XRMOVI_BILLING_ENABLED | true, somente após teste e validação da conta recebedora |

Não coloque chaves no GitHub, em páginas públicas, no JavaScript do site ou em mensagens.
SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY devem existir no ambiente privado de Edge Functions.

## Primeiro pagamento controlado (somente Código Kid)

1. Para habilitar apenas o piloto, cadastre em **Supabase Edge Functions > Secrets**: nome `XRMOVI_BILLING_ENABLED`, valor `true`.
2. **Não** cadastre `XRMOVI_BILLING_PILOT_ONLY=false`: o padrão seguro do backend é restringir o pagamento a usuários autorizados. O único usuário autorizado inicialmente é `codigokidniteroii@gmail.com`.
3. Em uma janela anônima, entre no XRMOVI com a conta Código Kid; a conta antiga de empresa/assinatura foi limpa, mas o login Auth foi preservado.
4. Crie empresa e contrato, abra **Minha assinatura**, selecione **Start (R$ 19,90/mês)**, e confira o valor antes do checkout.
5. **Pagamento real:** será cobrado e renovará mensalmente até cancelamento. Utilize um comprador diferente da conta recebedora Mercado Pago.
6. Concluído o pagamento, volte ao painel. Se continuar em avaliação, clique em **Verificar pagamento** em Minha assinatura. Esse botão consulta o provedor e não cria outra cobrança.
7. Se a primeira compra foi cobrada mas o plano ainda não está ativo, **não pague novamente**. Confira o painel de notificações, logs `xrmovi-billing-webhook` e o novo endpoint `xrmovi-reconcile-subscription`.
8. Para desligar novas cobranças, altere o secret `XRMOVI_BILLING_ENABLED` para `false`. Isso não cancela assinaturas recorrentes já contratadas: o cancelamento é gerenciado no Mercado Pago.
9. Somente após a validação da compra, webhook, renovação e cancelamento, abra o serviço geral, definindo `XRMOVI_BILLING_PILOT_ONLY=false`. Não faça essa mudança durante o piloto.

## 3. Checklist de homologação

1. Validar com credenciais e usuários de teste do Mercado Pago num ambiente separado. Testes não podem liberar acesso real.
2. Confirmar o nome da conta recebedora e os preços dos planos na base XRMOVI.
3. Criar novo cliente, empresa e contrato em https://frota.nospassa.com.br/.
4. Em Minha assinatura, escolher plano e iniciar checkout.
5. Concluir um pagamento real somente após autorização explícita para esse teste.
6. No Mercado Pago, comprovar o pagamento aprovado e a entrega do webhook HTTP 200.
7. No banco, confirmar billing_checkout_intents.status=paid, billing_ledger contendo exatamente 1 evento por fatura, billing_accounts.status=active e subscriptions.status=active.
8. Repetir webhook e verificar deduplicação; conferir renovação mensal e cancelamento.

## Segurança implementada

- O botão de checkout só habilita quando a função billing-readiness constata todos os segredos e XRMOVI_BILLING_ENABLED=true.
- Valor e limites do plano vêm das regras PostgreSQL, não do navegador.
- Webhook valida assinatura HMAC e busca pagamento, assinatura e fatura diretamente na API do Mercado Pago.
- A cobrança deve estar aprovada e a quantia em BRL deve corresponder ao plano.
- Ledger possui unicidade por evento da fatura, impedindo lançamento duplicado.
- Falhas antes de criar a assinatura no Mercado Pago são registradas para permitir nova tentativa.
- BI do proprietário distingue recebimento confirmado de mensalidade projetada.

## Links

- Landing: https://frota.nospassa.com.br/
- Assinatura: https://frota.nospassa.com.br/v3/#subscription
- Administração: https://frota.nospassa.com.br/admin/
- Painel Mercado Pago: https://www.mercadopago.com.br/developers/panel/app
- Painel Supabase: https://supabase.com/dashboard/project/ztqtcbzjesrkuaijmylm
