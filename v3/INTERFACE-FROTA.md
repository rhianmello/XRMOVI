# Navegação e ações da frota

O módulo de manutenção foi ampliado para `Manutenção / Despesas` e há uma tela `Motoristas`. Consulte `MOTORISTAS-DESPESAS.md` para cadastro, vínculo ao veículo, categorias de despesa e regras de pagamento/Financeiro. O histórico de registros passou a incluir despesas pagas, sem alterar o histórico auditável das manutenções.

Cada item do menu abre uma tela exclusiva no mesmo aplicativo, identificada por `#assets`, `#maintenance` etc. Voltar e recarregar preservam a navegação. No celular há um seletor de tela. Os módulos e registros existentes continuam disponíveis; os quatro atalhos retirados do menu não foram reintroduzidos.

## Ações no contexto

- Um alerta específico na Visão Geral ou em Alertas abre os detalhes da manutenção pelo **ID**, em painel lateral, mantendo a tela de origem. `Ver todos` continua abrindo a lista geral de Alertas.
- O mesmo painel é acessível por `Detalhes` na Manutenção e por `Ver manutenção` nos lançamentos financeiros. Exibe o veículo, serviço, vencimentos, custos, leitura e observações.
- `owner` e `manager` podem editar a programação de serviços pendentes, registrar custos e concluir. Outros membros podem consultar os detalhes e o histórico.
- Editar programação altera título, vencimento por data/KM e observações, exigindo motivo. Não altera o veículo, custos nem situação do serviço.
- Registrar custos e concluir são ações distintas. A conclusão exige custo realizado e leitura na execução, aceita zero e grava custos e encerramento em uma única operação atômica.
- Salvar atualiza listas e indicadores na origem. Uma versão desatualizada do registro é bloqueada, com opção de atualizar os detalhes antes de tentar novamente.

## Filtros e cartões

Empresa, contrato e filtros de veículos são compartilhados. O resumo visível identifica contrato, busca, categoria, situação e vencimento, além dos filtros locais e do período financeiro da tela atual.

`Revisões pendentes` abre a Manutenção com situação `Pendentes` e pesquisa local vazia, preservando contrato e filtros de veículos. A navegação normal pelo menu preserva a consulta local. `Limpar filtros desta tela` mantém os filtros compartilhados; `Limpar todos` também limpa contrato e filtros de veículos e restaura os períodos padrão. A empresa ativa nunca é trocada por esses controles.

Os filtros de dias usam datas, sem converter quilômetros em dias. O histórico de registros tem intervalo próprio. O mês financeiro é compartilhado por Abastecimentos e Financeiro, sempre identificado no resumo. A categoria do ranking afeta apenas o ranking e seus registros de combustível.

## Financeiro

Total, Combustível e Manutenção realizada são clicáveis. Cada valor mostra os lançamentos correspondentes ao período e aos veículos filtrados, com data, tipo, descrição e valor. Valores não informados aparecem explicitamente e não compõem o total. Abrir uma manutenção mantém a tela financeira como origem.

## Histórico e segurança

A migration `20261029133949_maintenance_navigation_actions.sql` adiciona uma revisão técnica e a tabela privada `xrmovi.maintenance_changes`. Atualizações de manutenção passam a registrar valores anteriores/novos, autor, data e motivo quando disponível. O histórico começa com esta atualização; não se apresenta como reconstrução de alterações anteriores. A consulta do painel mostra as últimas 50 alterações por serviço.

O histórico é protegido por RLS, sem acesso direto dos clientes, e tem bloqueio de atualização/exclusão. As RPCs verificam a associação atual à empresa e os papéis permitidos. As funções privilegiadas usam `search_path` vazio e não podem ser executadas por `anon`/`PUBLIC`, seguindo a fronteira já existente entre a API e o schema privado. A revisão impede sobrescrita concorrente. APIs legadas permanecem disponíveis e suas atualizações também são capturadas pelo trigger.

Nenhum registro existente foi excluído. A criação inicial de serviço mantém sua recuperação de falha no custo previsto sem duplicar a manutenção. Documentos continuam no Storage privado e abrem por URL assinada.

## Validação

- Interface: `node --test v3/tests/fleet-interface.test.cjs v3/tests/company-branding.test.cjs`, com Playwright/Chromium disponíveis; usa API simulada, sem credenciais de clientes.
- Banco: `supabase/tests/maintenance_navigation_actions.sql`; verifica histórico, concorrência, atomicidade, papéis e isolamento, sempre com `ROLLBACK` dos registros temporários.
