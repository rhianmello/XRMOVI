# XRMOVI — Pagamento mensal via Pix (02/11/2026)

## Fluxo publicado
- Cadastro inicial: cartão recorrente **ou** Pix mensal manual.
- Área Minha assinatura: botão **Pagar por Pix · mensal**.
- Valor e plano sempre vêm da conta no Supabase; jamais confiar em valores enviados pelo navegador.
- Edge Functions: `xrmovi-pix` (JWT obrigatório) e `xrmovi-pix-webhook` (assinatura HMAC obrigatória).
- Código e CPF do pagador são enviados diretamente à função protegida. CPF não é persistido na base XRMOVI.
- API Mercado Pago: `POST /v1/payments` com `payment_method_id=pix`, `X-Idempotency-Key`, `external_reference` e `notification_url`.
- Retorno: QR Code Pix, Copia e Cola, vencimento e link oficial (se fornecido).
- Confirmação: webhook assinado ou botão de verificar; ambos consultam novamente a API do Mercado Pago. Apenas `approved`, valor, moeda, referência e meio `pix` consistentes podem liquidar.
- Banco: `xrmovi.pix_payment_intents`, RPCs `xrmovi_pix_*` protegidas, RLS ativado.
- Entitlement: `xrmovi.company_is_paid` aceita cartão efetivamente pago ou Pix liquidado; nunca aceita tentativa pendente.
- Renovação Pix: manual, mês a mês. **Não há débito automático via Pix.**
- A conta mantém bloqueio quando o prazo pago expira.

## Troca cartão para Pix
Ao escolher gerar Pix, o backend verifica tentativas de cartão. Caso haja preapproval pendente, busca seu estado no provedor e cancela o preapproval antes de encerrar a tentativa no banco. Se a assinatura já estiver autorizada, impede emissão de Pix; nunca cria duas cobranças intencionalmente.

## Limites de implantação
- Somente contas autorizadas pelo piloto se `XRMOVI_BILLING_PILOT_ONLY` estiver ativo.
- Exige `XRMOVI_BILLING_ENABLED=true`, token e segredo do Mercado Pago já configurados no backend.
- Assegurar que a conta Mercado Pago tenha Pix habilitado.
- Não houve realização de um Pix com dinheiro real por automação. Verificar pessoalmente emissão, cobrança, webhook, liberação e vencimento em um teste controlado.
- Para reembolso, contestação ou migração de assinatura, conferir manualmente no provedor antes de ajustes administrativos; esses casos exigem homologação adicional.
- Testes CI: `v3/tests/pix-payment.test.cjs`. Verificação de transações reais não é simulada nem substituída por testes estáticos.
