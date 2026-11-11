# XRMOVI — auditoria do funil comercial (05/11/2026)

## Escopo
Cadastro/autenticação, fluxo de contratação, Pix, cartão, confirmação financeira e medição de clientes adquiridos por campanha. Nenhuma cobrança financeira foi executada nesta auditoria.

## Evidências de produção (Supabase `aprovaai`, schema `xrmovi`)
- Contas criadas nos últimos 30 dias: **2**.
- Tentativas de checkout (cartão + Pix) nos últimos 30 dias: **3**.
- Clientes distintos com pagamento confirmado no banco: **1**.
- Pagamentos confirmados no banco: **1**, total **R$ 19,90**.
- Pix Start aprovado em 05/11/2026 com ID de pagamento do provedor registrado, conta ativa e validade até **05/12/2026**.
- Ledger de cartão `billing_ledger`: **0** pagamentos.
- Uma conta permanece pendente.
- Histórico recente de chamadas para `xrmovi-pix-webhook` incluía respostas 400/401, mas o fato de existirem tentativas rejeitadas não comprova que o provedor esteja mal configurado; também não comprova a entrega de um webhook válido. A aprovação do Pix foi observada no banco, não numa execução supervisionada do webhook.

## Implementação
1. Criada a tabela privada `xrmovi.marketing_attribution`, RLS habilitado e sem acesso direto anônimo/autenticado.
2. RPC `xrmovi_marketing_attribution_record` associa somente origem/meio/campanha ao usuário autenticado, em primeira atribuição e somente antes da primeira compra confirmada.
3. Captura de UTMs exclusivamente após consentimento de análise no frontend, com persistência temporária (30 dias), limpeza em caso de recusa e descarte após autenticação.
4. RPC administrativa `xrmovi_marketing_admin_dashboard` compara registros, tentativas, compradores distintos e recebimentos, usando `billing_ledger` e `pix_payment_intents.status='paid'`, com prevenção de duplicidade de ID de pagamento.
5. Aba **Vendas e conversões** integrada à administração em `/admin/`. Não exibe dados pessoais de clientes na visão por campanha.
6. Testes SQL verificaram receita R$19,90 e 1 cliente pagante, permissão de RPC, bloqueio de atribuição após pagamento e aceitação antes da compra com transação de teste revertida por ROLLBACK.

## Resultado dos fluxos
| Fluxo | Estado |
|---|---|
| Cadastro/login | Código e testes simulados existentes; não há evidência de conclusão com nova conta real nesta auditoria |
| Contratação | Código implantado; tentativas registradas, incluindo uma cancelada de cartão |
| Pix | Um pagamento real registrado como aprovado e conta ativa; renovação automática não se aplica ao Pix |
| Cartão recorrente | Função e testes simulados disponíveis; **nenhum pagamento real aprovado identificado no ledger** |
| Webhook financeiro | Validação de assinatura e conferência do provedor implementadas; **entrega ponta a ponta ainda sem homologação nesta auditoria** |
| Conversão interna | Implementada e auditada em `/admin/` |
| Conversão enviada ao Google Ads | Ainda não configurada: não confundir eventos GA4 de visitas/cadastros com compras aprovadas |

## Proteções
- Não foi criado pagamento, cancelada assinatura nem alterado o status financeiro.
- O uso de checkout deve permanecer no piloto até homologação de cartão, Pix e webhooks com usuário de teste autorizado.
- O token Mercado Pago e os segredos de webhook permanecem fora do frontend e do repositório.
- A atribuição por parâmetros UTM é informativa. Apenas os registros verificados pelo backend contam como vendas.
- Clientes existentes que já pagaram **não** recebem crédito retroativo por novos cliques em anúncio.

## Validação restante antes de tráfego pago nacional
- Testar autenticação com novo usuário de homologação e verificar se a política de confirmação por e-mail corresponde ao esperado.
- Testar checkout de cartão, aprovação, webhook com HTTP 200, faturamento e ativação em ambiente controlado.
- Testar novo Pix, retorno aprovado pelo provedor e entrega de webhook válido.
- Configurar uma conversão de compra no Google Ads/GA4 por eventos verificados no servidor, se desejar otimizar campanhas pelo faturamento.
- Confirmar publicação GitHub Pages e resultado final do CI para o commit correspondente.
