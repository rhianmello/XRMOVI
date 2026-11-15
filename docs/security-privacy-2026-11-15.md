# XRMOVI — Auditoria de privacidade e endurecimento de QR Code (15/11/2026)

**Projeto:** `ztqtcbzjesrkuaijmylm` · **repositório:** `rhianmello/XRMOVI` · **escopo:** dados de clientes, RLS e fotografias submetidas por QR Code.  
**Regra:** nenhuma conta comercial, cobrança, arquivo de cliente, tabela de negócio ou dado pessoal é modificado pelos testes desta etapa.

## Proteções verificadas

- **Storage privado:** os seis buckets empresariais XRMOVI e o bucket separado `hml-xrmovi-storage` são privados, sujeitos a RLS. Não foram tornados públicos.
- **Tabelas:** 67 tabelas XRMOVI examinadas estavam com RLS ativa; sem leitura direta pelo papel anônimo nas tabelas avaliadas. Algumas tabelas privadas usam RLS sem políticas e não concedem SELECT direto — situação intencional, não abertura de dados.
- **Privilégios:** `xrmovi_qr_submit` e `xrmovi_qr_service_submit` não são executáveis diretamente pelas roles `anon` e `authenticated`; o serviço Edge efetua os cadastros autenticado pelo segredo no servidor.
- **Isolamento entre empresas:** teste read-only com uma identidade de um membro de empresa distinta, no PostgreSQL, confirmou **negação** nos helpers de acesso da empresa, documentos e logos. Nenhum conteúdo de documento ou imagem foi lido. O ensaio não equivale à tentativa real HTTP com duas contas autenticadas no aplicativo.
- **RPCs privilegiadas:** auditoria heurística das funções XRMOVI executáveis por usuários autenticados encontrou uma única função `xrmovi_list_plans` sem referência explícita a verificações de identidade; ela retorna apenas planos comerciais públicos. **Isso não comprova a segurança do código interno de todas as funções** — a análise de autorização deve ser contínua.
- **Candidatos a revisão do Storage** continuam apenas candidatos, sem exclusão automática.

## Correções no QR Code

Migração: `supabase/migrations/20261115170000_xrmovi_qr_proof_boundary_rate_guards.sql`.

1. No recebimento de **foto de KM**, preserva o limite original de **6 envios/hora por veículo**; o bloqueio do registro do veículo ocorre antes da contagem, impedindo a corrida entre duas submissões simultâneas.
2. No recebimento de comprovantes de **abastecimento e troca de óleo**, estabelece um limite conservador de **12 envios/hora por veículo**, serializado pelo mesmo bloqueio de registro. A contagem usa `vehicle_id`, não token rotacionável.
3. Ambos os fluxos exigem o caminho exato no bucket `xrmovi-odometer-proof`, vinculado ao **veículo determinado pelo token QR**, com nome aleatório UUID v4 e extensão JPG/PNG/WEBP, além de uma linha correspondente em `storage.objects` com tamanho de 100 a 5.242.880 bytes. O caminho informado não pode apontar para outro veículo.
4. As funções conservam validação de token, assinatura ativa, papéis e cadastros pendentes para revisão gerencial. Não foram alteradas regras de cobrança ou concessão de acesso.
5. O acesso direto aos dois RPCs permanece **restrito a `service_role`**; ninguém recebe chaves privadas no cliente.
6. A Edge Function atual continua salvando imagem primeiro e, se o registro for rejeitado, tenta remover o novo objeto. O limite de 12/hora bloqueia **novas linhas de comprovantes**; não impede, sozinho, requisições repetidas que consumam banda até alcançar a verificação. Rate limit antes do upload no gateway/Edge ainda é um reforço recomendado.

A migração é aditiva em verificações; não apaga arquivos, não reprocessa dados históricos e não altera as fotos existentes.

## Evidências e limitações

- `supabase/tests/xrmovi_cross_tenant_readonly_20261115.sql` é executado com **transação READ ONLY e ROLLBACK**, sem expor UUIDs, dados pessoais ou bytes de arquivo.
- Verificações de foto existentes identificaram 9 imagens de KM e 2 comprovantes nas rotas atuais, sem nome que destoasse dos formatos esperados. Não foi aberto nenhum arquivo.
- CI executa `tests/xrmovi-privacy-qr-20261115.test.mjs` para auditar limites, autorização, vínculo do arquivo e preservação dos contratos originais.
- **Sem teste produtivo de upload real com usuário controlado**: só a leitura dos metadados e as consultas de segurança SQL são produtivas; os testes automatizados e as provas de código não substituem um teste de dispositivo/rede reais.
- Nenhum valor monetário adicional foi contratado; custo extra corresponde a consultas e bloqueios simples de BD, sem custo comprovado mensurável.

## Pendências operacionais que não devem ser alteradas automaticamente

| Tarefa | Situação | Próxima ação |
|---|---|---|
| Proteção contra senhas expostas | Supabase Advisor: desativada | Habilitar em Auth → configuração de proteção de senha, confirmando disponibilidade no plano |
| MFA da conta que administra Supabase/GitHub | Não verificado | Ativar TOTP na conta do proprietário, guardar códigos de recuperação; configurar política gradual para colaboradores |
| MFA dentro do aplicativo XRMOVI | Não comprovado | Implementar inscrição e desafio AAL2 primeiro em ambiente controlado; nunca bloquear clientes sem habilitação prévia |
| Backup e restauração | **Alto risco operacional:** a organização Supabase do projeto está no plano **Free**; o serviço de backup automático diário da plataforma é documentado apenas nos planos Pro, Team e Enterprise | Fazer imediatamente backup lógico e/ou configurar rotina criptografada externa, mantida fora deste repositório público; validar restauração isolada e retenção antes de confiar na proteção |
| Duas contas reais | Pendente | Utilizar somente contas de homologação controladas, sem acessar documentos de clientes |
| QR Code — pré-limite na Edge/WAF | Pendente | Mitigar desperdício de banda antes do envio, observando Edge Function implantada e testes seguros |
| RPCs SECURITY DEFINER | Avisos gerais do Supabase | Auditar permissões caso a caso e revisar escopo de chamadas; NÃO revogar em massa |
| Acesso legado ao QR por domínio antigo | Edge permite origem legada | Validar dependências de dispositivos já instalados antes de remover o domínio antigo |

**Regras de contenção:** não alterar Auth comercial, mercado pago, anúncios, GA4, SEO, vendas, contas reais, dados de clientes ou outras funções fora do QR e das políticas verificadas.

## Recuperação de desastre — decisão urgente para o proprietário

**Constatação em 15/11/2026:** organização Supabase `rhianmello` está no plano `free`. O plano gratuito **não oferece os backups diários agendados gerenciados pela plataforma** documentados para Pro/Team/Enterprise. Ainda não foi comprovada uma exportação criptografada independente.

**Não foi executado backup nesta auditoria:** os conectores disponíveis não permitem fazer um `pg_dump` seguro para um destino criptografado privado sem credenciais e política de chaves. Copiar dados de clientes para um repositório público ou para relatórios de chat constituiria uma exposição de dados; por isso não ocorreu.

Ação necessária:
1. Acessar o painel Supabase do projeto → **Database → Backups** e confirmar se existe qualquer backup disponível. Registrar data e método, sem divulgar conteúdo.
2. Enquanto permanecer no Free, executar periodicamente o `supabase db dump` usando ambiente do proprietário, com senha DB em um gerenciador de segredos e saída criptografada em armazenamento privado **fora do GitHub**. Proteger também os arquivos do Storage, pois um dump apenas do Postgres não é backup dos bytes das fotos/documentos.
3. Definir retenção, alertas de falha e realizar **teste de restauração em ambiente separado autorizado**, sem sobrescrever o banco produtivo nem incorrer em projeto pago sem aprovação.
4. Se optar por Pro ou outro serviço pago, confirmar preço e aprovação expressa previamente. Não houve compra/upgrade nesta etapa.
5. Estabelecer plano LGPD para retenção, eliminação legítima, logs de incidentes e registro de resposta a incidentes.

**Não afirmar que backups e recuperação estão homologados até existir cópia e restauração comprovadas.**

## Links oficiais para conclusão de controles de plataforma

- Configuração de segurança de senha: https://supabase.com/docs/guides/auth/password-security
- MFA da conta de administração: https://supabase.com/docs/guides/platform/multi-factor-authentication
- MFA para aplicativos: https://supabase.com/docs/guides/auth/auth-mfa
- Backups Supabase: https://supabase.com/docs/guides/platform/backups
