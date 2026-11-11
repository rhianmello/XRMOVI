# XRMOVI — Cadastro guiado, comparação de planos e avisos de suporte

## Fluxo comercial implementado

1. Cliente cria login e confirma e-mail normalmente na landing.
2. O primeiro acesso à frota apresenta **Cadastro inicial**, com empresa, contrato inicial, cliente/código opcional e plano mensal.
3. O cadastro é concluído **em uma transação** por `public.xrmovi_onboarding_complete`; a conta permanece `pending`.
4. Se a conta puder entrar no checkout (piloto ou vendas liberadas), é encaminhada ao Mercado Pago para autorizar o pagamento.
5. Caso o checkout não esteja habilitado para a conta, o cliente vê somente **Minha assinatura**, sem acesso operacional.
6. Somente a confirmação do pagamento libera o sistema. O banco valida a autorização; o navegador não decide o direito de acesso.
7. Em **Minha assinatura**, o plano selecionado mostra empresas, contratos, veículos, logins e valor mensal com dados de `public.xrmovi_list_plans`.
8. Botões **Sair da conta** no menu lateral, na barra superior e no cadastro inicial.

## Notificações automáticas de suporte

- Mensagens de clientes geram registro na fila privada `xrmovi.support_email_outbox` automaticamente, via trigger.
- O job `xrmovi-support-mail-queue` consulta a função `xrmovi-support-email` a cada dois minutos.
- O worker usa Resend para enviar aviso para **rhian.udm@gmail.com**, sem incluir o texto da conversa.
- Há controle de tentativas e chave de idempotência por mensagem, para evitar notificações duplicadas.
- A Central do Proprietário mostra o status da configuração do provedor de e-mail.

**IMPORTANTE: envio de mensagens não estará ativo até configurar um serviço de e-mail transacional e verificar um domínio de remetente.** A fila continuará registrando novas mensagens para posterior envio; nenhum aviso de e-mail deve ser declarado entregue antes de confirmação do provedor.

### Segredos privados necessários no Supabase

Na seção **Edge Functions → Secrets**, cadastrar:

| Nome | Valor |
|---|---|
| `XRMOVI_RESEND_API_KEY` | API Key da conta de envio no Resend (prefixo `re_`) |
| `XRMOVI_SUPPORT_MAIL_FROM` | Remetente verificado, por exemplo `XRMOVI <avisos@xrmovi.com>` após configurar DNS no Resend |

O destinatário está definido como **rhian.udm@gmail.com** no worker. Não publicar chaves em GitHub ou frontend.

**Atenção à migração de domínio:** é possível usar um domínio próprio verificado da empresa já existente, se disponível. Ao mudar para xrmovi.com, configurar o SPF/DKIM no serviço de e-mail antes de enviar notificações de produção.

### Teste seguro

1. Confirmar que a Central do Proprietário indica provedor de e-mail configurado.
2. Enviar uma mensagem de cliente pelo painel `/cliente/`.
3. Confirmar nova linha em `xrmovi.support_email_outbox` e sua mudança para `sent`.
4. Conferir a mensagem na caixa de entrada `rhian.udm@gmail.com`.
5. Verificar se o botão **Abrir caixa de mensagens** leva ao BI do proprietário.

Este aviso é transacional, não um e-mail de marketing.


## Auditoria de 30/10/2026 — implementação e verificações

- A reconciliação da assinatura consulta o Mercado Pago mesmo quando o cadastro está como ativo: verifica a data `paid_through`, varre faturas paginadas, valida assinatura/fatura/pagamento, concilia apenas cobranças aprovadas e sincroniza cancelamento/pausa.
- A reconciliação é somente de leitura no Mercado Pago: usa GET, nunca inicia cobrança ou assinatura.
- As RPCs `xrmovi_support_mail_claim` e `xrmovi_support_mail_finish` validam `auth.jwt() ->> 'role'` e continuam disponíveis apenas ao `service_role`.
- O worker de suporte exige segredo de 256 bits guardado exclusivamente no Vault, enviado pelo cron a cada dois minutos. O endereço público não pode processar fila sem essa credencial.
- No celular, a barra superior contém troca de empresa e atalho para suporte, sem exigir menu lateral.
- O login tem **Esqueci minha senha** e a página `/redefinir-senha.html` usa uma sessão válida do Supabase para efetuar a alteração.
- Os testes de reconciliação e notificação simulam provedor e banco em memória e não geram cobrança nem enviam e-mail real.

### Pendências de configuração externa

**Suporte:** a verificação ao vivo do cron devolveu `503 not_configured`: faltam `XRMOVI_RESEND_API_KEY` e/ou `XRMOVI_SUPPORT_MAIL_FROM` com domínio remetente validado no Resend. O worker está autenticando corretamente, mas nenhuma entrega de e-mail pode ser garantida até concluir essa configuração. Mensagens reais ficam armazenadas na fila privada.

**Recuperação de senha:** em **Supabase → Authentication → URL Configuration → Redirect URLs**, autorizar `https://frota.nospassa.com.br/redefinir-senha.html`. Também é necessário que o provedor de e-mails do Supabase Auth esteja enviando mensagens. Verificar com uma conta de teste, sem alterar senha de usuários reais.

A verificação ponta a ponta de renovação com um pagamento real permanece pendente; os testes automatizados usam comprovantes e respostas simulados.
