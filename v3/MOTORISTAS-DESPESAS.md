# Motoristas e despesas da frota

## Entrada dos lançamentos

`Registrar despesa ou serviço` e `Programar manutenção` ficam sempre visíveis no topo do módulo. As abas inferiores servem para consultar os registros, sem esconder a ação de cadastro da outra aba. Despesas/serviços avulsos iniciam em `Outros serviços / despesas`, com descrição livre; exemplos: lavagem e borracharia. IPVA e as demais categorias continuam disponíveis. Custos de uma manutenção existente são registrados no próprio serviço para evitar duplicação no Financeiro.

Depois de criar uma despesa ou serviço avulso, a consulta de despesas é aberta no mês informado para exibir o lançamento. Depois de programar manutenção, a consulta de serviços pendentes é aberta. Os filtros compartilhados de empresa/veículo/contrato continuam preservados.

O menu `Manutenção / Despesas` contém dois controles: serviços de manutenção, com o fluxo e histórico existentes, e outras despesas dos veículos. `Motoristas` abre um cadastro operacional da empresa; não cria usuários nem contas de acesso.

## Motoristas e veículos

- Nome é obrigatório. Telefone, número/categoria/validade de CNH e observações são opcionais.
- `owner`/`manager` cadastram e editam; os demais membros consultam dados operacionais, sem telefone, número da CNH ou observações privadas.
- O veículo tem um motorista responsável opcional. O formulário permite buscar por nome e selecionar um motorista ativo da empresa.
- Inativação não exclui registros nem remove vínculos existentes. Um motorista inativo pode ser mantido no veículo que já o tinha, mas não pode receber novos vínculos.
- Salvar veículo e motorista é uma operação atômica. A API existente continua responsável pelas validações e pelos limites da assinatura. Van e Equipamento foram acrescentados à lista de categorias aceitas, compatibilizando o cadastro com a frota já existente.
- Os vínculos têm chave estrangeira composta por empresa e ID, impedindo associação entre empresas até fora da interface. A tabela de ativos mostra o motorista efetivamente vinculado, preservando o campo de unidade/local no cadastro.

## Outras despesas

Tipos: IPVA, multa, seguro, licenciamento, pedágio e outros. Cada lançamento pertence a um veículo e guarda descrição, data da despesa, vencimento opcional, valor positivo com duas casas decimais, pagamento opcional e observações.

O controle lista despesas por mês da despesa, tipo, pagamento e pesquisa, combinado com contrato e filtros de veículos. Pagamento é registrado em formulário antes de salvar; a data não pode estar no futuro. Lançamentos abertos com vencimento até 30 dias aparecem nos Alertas e na Visão Geral, abrindo os detalhes na origem.

O Financeiro soma somente **despesas pagas**, pelo mês do pagamento, em cartão e lançamentos separados de combustível e manutenção realizada. Lançamentos em aberto não aumentam o total realizado. Serviços de manutenção continuam com seu próprio controle de custos, sem migração nem duplicação automática para outras despesas. O histórico de registros também permite consultar despesas pagas no período escolhido.

## Persistência e segurança

A migration `20261029140157_drivers_vehicle_expenses.sql` cria os cadastros privados, adiciona `vehicles.driver_id` e complementa as APIs de veículos e Financeiro sem remover campos anteriores. Não há endpoint de exclusão. As atualizações de motoristas, despesas e vínculos são auditadas em `xrmovi.registry_changes`; o histórico é protegido contra atualização e exclusão. Edições de cadastro e despesa usam revisão para detectar gravações concorrentes.

As novas tabelas têm RLS e não recebem acesso direto dos clientes. As RPCs verificam associação atual à empresa e papel; funções privilegiadas têm `search_path` vazio, execução revogada de `PUBLIC`/`anon` e filtros explícitos de empresa. Atribuir motorista não altera acesso ao sistema nem consome assento de usuário.

Validação do banco em `supabase/tests/drivers_vehicle_expenses.sql`, sempre com `ROLLBACK`, cobrindo papéis, privacidade, isolamento, vínculos atômicos, motorista inativo, validação da assinatura, pagamento, total financeiro, concorrência e auditoria. Os testes de interface usam a API simulada em `v3/tests/fleet-interface.test.cjs`.

## Alertas de CNH

Motoristas ativos com validade da CNH vencida ou nos próximos 30 dias entram nos alertas, na prévia da Visão Geral e nos respectivos contadores. O alerta abre o cadastro do motorista na própria tela; owner/manager podem corrigir a validade e o alerta é recalculado após salvar. Motoristas inativos e cadastros sem validade informada não geram alerta de vencimento.

Sem filtros de veículos, são considerados todos os motoristas ativos da empresa, inclusive sem veículo vinculado. Com contrato ou outro filtro de veículos aplicado, entram apenas os motoristas vinculados aos veículos correspondentes. A prévia prioriza alertas de CNH e mantém o limite de seis itens; a tela Alertas apresenta a lista completa. Não há alteração de tabelas nem de dados existentes.
