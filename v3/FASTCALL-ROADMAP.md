# XRMOVI — referência funcional FastCall, implementação original

Referência pública estudada: https://www.fastcall.com.br/ (outubro de 2026). Este projeto não utiliza código proprietário da FastCall.

## Implementado nesta etapa
- `v3/os.html` e `v3/os.js`: módulo de ordens de serviço, responsivo, com conta existente, empresa ativa, listagem, filtros, criação e edição.
- `xrmovi.work_orders`: OS por empresa, vínculo opcional a veículo, categoria (frota, predial, patrimônio, TI, outros), prioridade, status, custo previsto/real, responsável e prazo.
- RPCs `public.xrmovi_os_list` e `public.xrmovi_os_save` com verificações de associação, papel, veículo da mesma empresa e validações de entrada.
- Menu da V3 com ligação ao módulo.
- Sem alteração nem exclusão dos registros existentes de frota.

## A construir, em ordem de dependência
1. Histórico de eventos/apontamentos e comentários imutáveis por OS, anexos privados e assinatura digital.
2. Tipos e modelos de checklist por OS, checklist em campo, foto por item e não conformidades.
3. Materiais e estoque por empresa, consumo em OS com movimentações auditáveis e mínimo.
4. Manutenção preventiva automática por data e quilometragem, agendamento/cron e prevenção de OS duplicadas.
5. Patrimônio com tombamento, localização, QR Code, transferências e garantias.
6. Manutenção predial com locais e ambientes hierárquicos.
7. Help Desk com filas, regras de SLA, prioridades e notificações.
8. PCM: carteira, capacidade, planejamento, apontamento de execução.
9. Painel unificado multiempresa, custo por ativo, gráficos e PDF/CSV com logo.
10. Versão móvel instalável (PWA), fluxo de trabalho offline e sincronização, push, WhatsApp somente após integração aprovada.
11. Controles de planos e pagamentos separados dos outros projetos do Supabase.

## Regras obrigatórias
- Sem misturar empresas; autenticação + papel validados pelo backend.
- Arquivos privados e URLs assinadas; extensão e MIME validado.
- Nunca prometer que envio de push/WhatsApp está ativo enquanto não houver integração.
- Testar o navegador autenticado com conta de proprietário e conta sem autorização de escrita.
- Manter Frota CPL intacta e adaptar apenas padrões de interface/fluxo.
