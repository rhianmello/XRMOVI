# XRMOVI — Lembretes automáticos de renovação

Implantado em 03/11/2026.

## Como funciona

- Prazo considerado: `billing_accounts.paid_through` (data e hora de vencimento).
- Fuso horário: `America/Sao_Paulo`, com diferença por **dia civil**.
- Lembretes por e-mail em **7, 3 e 1 dia** antes do vencimento, para assinaturas ativas e pagas.
- Uma notificação por conta, data de vencimento e intervalo. A restrição UNIQUE evita repetições.
- Se a assinatura for renovada ou vencida antes do envio, o aviso antigo é descartado.
- E-mail para o titular cadastrado em Supabase Auth; endereço não é enviado ao navegador nem compartilhado entre empresas.
- **Pix:** avisar que o cliente deve renovar manualmente pela tela Minha assinatura.
- **Renovação antecipada por Pix:** liberada nos últimos 7 dias, preservando o saldo de dias já pagos e acrescentando o próximo mês somente após confirmação.
- **Cartão:** informar a renovação automática pelo Mercado Pago; nunca instruir o cliente a pagar novamente por Pix.
- O acesso operacional continua sujeito ao controle de pagamentos vigente: lembretes não cobram e não liberam assinaturas.

## Rotinas do Supabase

- `xrmovi-renewal-reminder-prepare`: `0 12 * * *` — 09:00 no Rio de Janeiro / São Paulo.
- `xrmovi-renewal-reminder-email`: `*/10 * * * *` — despacha a fila e repete falhas elegíveis.
- Tabela privada com RLS: `xrmovi.renewal_email_outbox`.
- SQL privado `xrmovi.queue_renewal_reminders()` cria os pedidos.
- RPCs de execução reservadas a `service_role`: `xrmovi_renewal_mail_claim`, `xrmovi_renewal_mail_current`, `xrmovi_renewal_mail_finish`.
- A Edge Function `xrmovi-renewal-email` recebe token de trabalho via Supabase Vault, autorizado por `xrmovi_support_worker_authorized`.
- Envio com Resend usa `Idempotency-Key` igual ao ID do lembrete para evitar duplicidades.
- Em `GET /functions/v1/xrmovi-support-email`, é possível conferir se a infraestrutura Resend compartilhada está pronta.

## Configuração externa obrigatória

**Atenção: verificação de 03/11/2026 — Resend respondeu `configured: false`.** A automação e o painel estão instalados, mas e-mails reais não sairão até a configuração.

No **Supabase do projeto aprovaai**, em **Project Settings → Edge Functions → Secrets**, confirmar:
1. `XRMOVI_RESEND_API_KEY`: chave válida de API Resend.
2. `XRMOVI_SUPPORT_MAIL_FROM`: remetente autorizado por domínio verificado (ex.: `XRMOVI <notificacoes@dominio-verificado>`).

Nunca adicionar essas credenciais ao GitHub nem enviar chaves em chat. A configuração deve ser feita pelo responsável diretamente no painel do Supabase/Resend. Após configurar, verificar o endpoint de saúde e um envio controlado. Uma fila sem destinatários elegíveis não envia nenhum e-mail.

## Interface

- A faixa no topo do painel alerta durante os 7 dias finais.
- Em Minha assinatura, o mesmo aviso apresenta dias restantes.
- A conta que paga por cartão vê indicação de renovação automática, não botão de cobrança Pix forçada.
- Após o vencimento, a mensagem avisa sobre a necessidade de regularização; o bloqueio da frota segue a regra de autorização existente.

## Verificações

- Node: `node --test v3/tests/renewal-reminders.test.cjs`.
- GitHub Actions: `XRMOVI safe billing tests`.
- Consultar o histórico `cron.job_run_details` para execução dos agendamentos.
- Consultar a fila `xrmovi.renewal_email_outbox` por status (`queued`, `processing`, `sent`, `skipped`).
