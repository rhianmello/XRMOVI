# XRMOVI — migração controlada

Este repositório será a nova base do XRMOVI em xrmovi.com.br.

## Situação (11/11/2026)
- Origem do código: rhianmello/nospassa-frotas (não alterar durante a migração).
- Projeto Supabase existente: ztqtcbzjesrkuaijmylm (nome de exibição alterado para XRMOVI).
- Schema operacional: xrmovi.
- O sistema antigo ainda utiliza frota.nospassa.com.br.
- O Supabase Auth é compartilhado entre aplicações e não deve ser limpo em massa.
- Não copiar dados de clientes antigos. Preservar a conta administrativa e apenas dados explicitamente autorizados.

## Bloqueios de segurança antes de qualquer limpeza
1. Produzir e validar backup recuperável do PostgreSQL (schema, dados, funções, triggers, RLS) e Storage; não guardar backups nem segredos neste repositório público.
2. Conferir assinaturas e intenções de pagamento no Mercado Pago; cancelar/conciliar as que forem efetivamente encerradas antes de excluir registros. Históricos de transações necessárias para auditoria devem ser retidos.
3. Identificar todas as aplicações que compartilham o schema public e auth.users, incluindo tabelas de monitoramento, investimentos e outros sistemas.
4. Validar relacionamentos e ações ON DELETE; não excluir auth.users em massa.
5. Separar dados do proprietário de clientes, testes, cobrança e logs.
6. Atualizar URLs de autenticação, retornos e webhooks para xrmovi.com.br; manter o domínio antigo até os testes passarem.
7. Executar testes e homologação antes de alterar GitHub Pages, DNS ou produção.

## Regras
- Nenhuma limpeza destrutiva antes do backup verificável e conferência de cobranças.
- Não inserir service_role, tokens ou segredos em GitHub Pages.
- Preservar o projeto bi-epc15.
- Preservar o repositório original como referência e fallback.
