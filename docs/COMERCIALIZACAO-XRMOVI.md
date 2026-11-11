> Atualização de 05/11/2026: o texto abaixo registra a implantação de 29/10 e não representa o estado atual do checkout. A disponibilidade atual vem de xrmovi-billing-readiness, incluindo autorização do piloto. Não existe mais billingEnabled em config.json. Cartão é recorrente e Pix é mensal manual. Consulte o README principal e o documento de incidente de 04/11 antes de operar pagamentos.

# XRMOVI — Assinaturas, cotas e implantação comercial

## Estado após a implementação de 29/10/2026
- A estrutura de assinaturas compartilhadas, cotas, permissão por titular e painel "Minha assinatura" está implantada.
- O checkout Mercado Pago e o webhook foram publicados como Edge Functions, **mas o checkout está DESATIVADO**.
- O site contém `v3/config.json` com `billingEnabled: false`; as funções exigem `XRMOVI_BILLING_ENABLED=true`.
- Nenhum cliente deve receber cobrança até a homologação financeira e de segurança.
- A solicitação manual de plano não equivale a pagamento, e não altera o plano automaticamente.

## Regras comerciais — limites por assinatura (não por empresa)

| Plano | Empresas | Usuários distintos | Contratos totais | Veículos totais | Mensalidade |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start | 1 | 1 | 1 | 5 | R$ 19,90 |
| Pro | 3 | 3 | 15 | 15 | R$ 39,90 |
| Business | 5 | 5 | 30 | 30 | R$ 64,90 |
| Advanced | 10 | 10 | 60 | 60 | R$ 99,90 |
| Enterprise | Sob medida | Sob medida | Sob medida | Sob medida | Sob consulta |

Regras:
1. Um veículo pertence a uma empresa e, quando vinculado, a um contrato ativo dessa mesma empresa.
2. Empresas, contratos, veículos e usuários consomem cotas compartilhadas de uma conta de assinatura.
3. O mesmo usuário autorizado em várias empresas ocupa **uma** vaga no limite global de usuários.
4. Contratos recém-criados podem temporariamente não possuir veículos. O limite de contratos é independente, mas ambos pertencem à cota total.
5. Apenas o titular da conta pode incluir empresas, vincular novos usuários ou solicitar mudança de plano.
6. Não há exclusão de registros quando o cliente atinge um limite. Novas inclusões são bloqueadas no banco.
7. Limites para trial expirado e assinatura pausada/cancelada bloqueiam novas inclusões; dados existentes permanecem.
8. Novos cadastros começam em trial Start de 14 dias. Planos superiores só mudam após confirmação financeira.

## Arquitetura
- Projeto Supabase da aplicação: esquema privado `xrmovi` no projeto `aprovaai`.
- `xrmovi.billing_accounts`: titular, plano, situação, vencimento, ID do provedor.
- `xrmovi.account_companies`: cada empresa pertence a uma conta comercial.
- `xrmovi.billing_checkout_intents` e `xrmovi.billing_ledger`: intenções de cobrança e pagamentos aprovados, com idempotência.
- Triggers no banco: `xrmovi_quota_companies`, `xrmovi_quota_members`, `xrmovi_quota_contracts`, `xrmovi_quota_vehicles`.
- RPCs públicas autenticadas: `xrmovi_account_overview`, `xrmovi_account_add_company`, `xrmovi_account_add_member`, `xrmovi_account_request_plan`, `xrmovi_checkout_prepare`.
- RPCs de serviço **não concedidas ao cliente**: `xrmovi_checkout_attach`, `xrmovi_checkout_settle`, `xrmovi_checkout_provider_status`.
- Front-end `v3/subscription-panel.js`; integrado ao `v3/xrmovi-adapter.js` e `v3/index.html`.

**Observação:** o esquema `xrmovi` não está exposto ao Data API. O navegador não acessa tabelas comerciais diretamente, apenas RPCs com verificações de autenticação/autorização. Não utilizar token de serviço no front-end.

## Como homologar Mercado Pago (ainda NÃO realizado)
1. Obter credenciais de uma **aplicação Mercado Pago do vendedor**, separadas das demais aplicações.
2. Em Supabase > Edge Functions > Secrets, configurar `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e conferir as chaves `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Não compartilhar credenciais por chat ou commit.
3. No painel Mercado Pago, registrar webhook `https://<ref>.supabase.co/functions/v1/xrmovi-billing-webhook` com os tópicos `subscription_authorized_payment` e `subscription_preapproval`.
4. Testar assinaturas pendentes, fatura aprovada, pagamento recusado, duplicidade, notificação atrasada e cancelamento em ambiente de teste. Validar se webhooks incluem `data.id` no query string, `x-request-id` e `x-signature`. Ajustar conforme eventos reais.
5. Auditar valor, moeda, associação da assinatura à conta, idempotência e período pago. Verificar em particular o primeiro pagamento antes de liberar o plano.
6. Confirmar que um usuário não consegue usar uma função de serviço com JWT comum e que a assinatura não pode ser ativada pela URL de retorno.
7. Validar visualmente o fluxo no navegador desktop e mobile, os erros de rede e a compatibilidade com o provedor.
8. Somente após aprovação da homologação, configurar `XRMOVI_BILLING_ENABLED=true` nos segredos Supabase; alterar `v3/config.json` para `billingEnabled: true`; atualizar cache e publicar.
9. Fazer primeiro uma transação real de pequeno valor em conta de teste autorizada, confirmar reconciliação e verificar renovação.

Não realizar o passo 8 antes da homologação. O link de pagamento nunca deve ativar cotas por si; o webhook valida no provedor e registra a fatura aprovada.

## Testes executados
- Conferido antes/depois: 2 empresas, 8 veículos, 2 contratos existentes.
- Painel: leitura autenticada do Start retorna empresas, veículos, contratos e vagas.
- Start: tentativa de segunda empresa e de sexto veículo bloqueadas por trigger.
- Business: criada empresa e contrato de teste dentro de transação com **rollback**; nenhuma linha de teste persistiu.
- Front-end: validação sintática do JS e confirmação dos elementos na página.
- Atestado que novos RPCs de conta exigem usuário autenticado; funções legadas de checklist/estoque tiveram acesso anônimo revogado.

## Limitações e próximos cuidados
- **Fluxo de troca de plano de assinantes já pagos:** o checkout recusa criar uma segunda recorrência sobre uma já ativa. Desenvolver fluxo de ajuste da assinatura no provedor e cobrança proporcional, para evitar duplicidade.
- **Convites:** a adição de usuário vincula e-mail já cadastrado e confirmado; não envia convite a pessoas que ainda não possuem conta.
- **Auditoria completa:** executar testes E2E reais de login/contratos/veículos, acessibilidade, LGPD, restauração de backup, tratamento de pagamentos contestados/estornados, conciliação periódica e notificações falhas.
- **Custos/termos:** antes da venda, publicar Termos de Uso, Privacidade e Política de Cancelamento, conferir custos de Storage, Edge Functions e Mercado Pago.

Fontes oficiais: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview e https://supabase.com/docs/guides/functions/auth
