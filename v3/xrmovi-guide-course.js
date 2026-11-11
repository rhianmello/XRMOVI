/*
 * XRMOVI Curso de Uso: verified navigation/manual for customer-facing fleet V3.
 * No model, API key, remote endpoint, or external customer-data transfer.
 * Last mapped against V3 interfaces on 2026-10-30.
 */
(function(global){
'use strict';
const topics = [
  {id:'start',group:'Primeiros passos',title:'Conhecer o painel',aliases:['como comecar','como iniciar','primeiros passos','como usar o xrmovi','o que tem no sistema','quais funcionalidades do site','me ensina o sistema','como funciona o site','quero aprender','curso completo'],view:'dashboard',
   intro:'O XRMOVI organiza a frota por empresa e contrato. Comece pela Visão Geral, confira indicadores e alertas, depois entre nos módulos pelo menu lateral.',
   steps:['Confirme o nome da empresa ativa no topo do painel.','Escolha um contrato, se quiser analisar apenas parte da frota.','Leia os cartões Frota Total, Operacionais, Em alerta, Itens vencidos e Revisões pendentes.','Abra Ativos / Veículos para cadastrar ou consultar a frota.','Use os módulos Manutenção / Despesas, Motoristas, Abastecimentos, Alertas e Relatórios financeiros para acompanhar a operação.'],
   note:'No celular, use o seletor Tela. As respostas do assistente respeitam a empresa e os filtros atuais.'},
  {id:'login',group:'Primeiros passos',title:'Entrar e sair da conta',aliases:['fazer login','entrar no sistema','acessar conta','senha login','sair do sistema','deslogar','fazer logout'],view:null,
   intro:'O acesso do XRMOVI é por conta autenticada. Não informe sua senha no chat e não compartilhe a mesma conta entre vários colaboradores.',
   steps:['Abra a página inicial do XRMOVI e escolha Entrar.','Informe o e-mail cadastrado e sua senha.','Depois de entrar, selecione sua empresa e abra o painel.','Para encerrar a sessão, clique em Sair da conta no menu lateral ou no topo, se estiver usando o celular.'],
   note:'Não é necessário criar outra conta para cada contrato; os acessos são organizados por empresa e pelo plano.'},
  {id:'password',group:'Primeiros passos',title:'Recuperar senha',aliases:['esqueci senha','esqueci minha senha','alterar senha','redefinir senha','mudar senha','recuperacao de senha','nao consigo entrar','esqueci acesso'],view:null,
   intro:'Se esqueceu a senha, o caminho correto é a recuperação de acesso, não criar um novo usuário para a mesma conta.',
   steps:['Na página de entrada, procure a opção Esqueci minha senha.','Informe seu e-mail cadastrado para solicitar o link de recuperação.','Confira a caixa de entrada e o spam.','Abra o link recebido, defina a senha nova e faça login novamente.'],
   note:'O recebimento depende da configuração do serviço de e-mail. Caso o link não chegue, use Mensagens / Suporte.'},
  {id:'company',group:'Organização',title:'Selecionar empresa ativa',aliases:['trocar empresa','mudar de empresa','outra empresa','empresa ativa','selecionar empresa','multiempresa','multiplas empresas'],view:'dashboard',
   intro:'Cada empresa tem seus próprios registros. O seletor de empresa ativa define quais informações do painel serão consultadas.',
   steps:['Encontre o seletor EMPRESA ATIVA na parte superior do menu lateral.','No celular, use o seletor Empresa no topo da página.','Selecione a empresa que deseja consultar.','Aguarde os dados atualizarem antes de fazer novas consultas ou lançamentos.'],
   note:'Trocar de empresa não transfere os veículos nem os registros para outra empresa.'},
  {id:'contracts',group:'Organização',title:'Criar e gerenciar contratos',aliases:['criar contrato','mudar contrato do carro','cadastrar contrato','novo contrato','adicionar contrato','incluir contrato','contrato da frota','vincular contrato'],view:'subscription',owner:true,
   intro:'Contratos ajudam a separar veículos e custos por atividade ou cliente. A criação acontece em Minha assinatura; a filtragem é feita no cabeçalho.',
   steps:['Abra Minha assinatura.','Na seção Criar contrato, selecione a empresa e preencha nome; cliente e código são opcionais.','Clique em Adicionar contrato.','Depois, use o seletor Contrato no topo da frota para consultar um contrato específico.','O seletor Contrato filtra os veículos que já possuem vínculo. Se você precisar atribuir um veículo a um contrato e não encontrar a opção, solicite ajuda em Mensagens / Suporte; essa edição não aparece no formulário atual de veículos.'],
   note:'A quantidade de contratos depende do plano. O titular gerencia a estrutura da assinatura.'},
  {id:'filters',group:'Organização',title:'Filtrar veículos, contratos e datas',aliases:['usar filtros','filtrar veiculos','filtrar por contrato','filtrar por categoria','limpar filtros','situacao do veiculo','buscar placa','buscar veiculo'],view:'dashboard',
   intro:'Os filtros do XRMOVI mudam o conjunto de veículos usado nos indicadores, gráficos e consultas. Eles não alteram cadastros.',
   steps:['Selecione a empresa ativa e, se necessário, um contrato no cabeçalho.','Na barra de filtros, pesquise placa, marca ou modelo.','Escolha categoria, situação e prazo de revisão, quando disponíveis.','Leia o resumo de filtros para saber quais critérios estão ativos.','Clique em Limpar todos para voltar à visão completa da empresa.'],
   note:'Os filtros de datas de cada módulo podem ser independentes dos filtros de veículos.'},
  {id:'dashboard',group:'Indicadores',title:'Entender a Visão Geral',aliases:['visao geral','entender dashboard','explicar indicadores','o que significa os cards','cartoes da tela','painel gerencial','resumo gerencial','kpis'],view:'dashboard',
   intro:'A Visão Geral resume a frota selecionada. Os cartões exibem total, veículos operacionais, manutenções em alerta, itens vencidos e revisões pendentes.',
   steps:['Frota Total conta os veículos nos filtros ativos.','Operacionais conta os veículos com situação Ativo.','Em alerta acompanha manutenções com prazo próximo ou vencido.','Itens vencidos também pode considerar outras pendências verificadas pelo painel, como despesas e CNH.','Revisões pendentes corresponde a serviços cadastrados ainda não concluídos.','Clique em um cartão para abrir a consulta relacionada.'],
   note:'Revisão vencida não altera automaticamente a situação operacional de um veículo.'},
  {id:'operational',group:'Indicadores',title:'O que significa operacional?',aliases:['o que e operacional','nao operacional','veiculo operacional','o que significa ativo','o que significa manutencao','o que significa inativo','status operacional','disponibilidade do carro'],view:'assets',
   intro:'No XRMOVI, operacional é o veículo com situação Ativo. Um veículo Em manutenção ou Inativo não conta como operacional.',
   steps:['Ativo: disponível para uso, conforme a situação cadastrada pelo responsável.','Em manutenção: fora da condição de operação por serviço ou reparo em andamento.','Inativo: veículo que não está em uso por outra razão.','Revisão vencida: alerta separado; não altera o status automaticamente.','Para modificar a situação, abra Ativos / Veículos, clique em Editar, escolha Situação operacional e Salvar.'],
   note:'A classificação no sistema não substitui inspeção mecânica nem avaliação de segurança.'},
  {id:'vehicle-add',group:'Veículos',title:'Cadastrar um veículo',aliases:['adicionar carro','adicionar veiculo','cadastrar veiculo','cadastrar carro','novo ativo','incluir caminhao','cadastrar caminhao','cadastrar maquina','como colocar carros'],view:'assets',writer:true,
   intro:'Veículos são cadastrados em Ativos / Veículos, dentro da empresa ativa, respeitando os limites da assinatura.',
   steps:['Entre em Ativos / Veículos.','Clique em + Novo ativo.','Preencha placa/identificação, categoria, marca e modelo; informe ano, KM e unidade se aplicável.','Escolha Situação operacional: Ativo, Em manutenção ou Inativo.','Vincule um motorista ativo, se desejar, e anexe o documento do veículo quando disponível.','Clique em Salvar e confira o veículo na lista.'],
   note:'Proprietários e gestores podem cadastrar. Um motorista vinculado não recebe automaticamente acesso ao sistema.'},
  {id:'vehicle-edit',group:'Veículos',title:'Editar veículo e mudar situação',aliases:['editar veiculo','editar carro','mudar situacao','mudar status do carro','status do carro','onde mudo o status do carro','como alterar situacao','alterar status','deixar inativo','colocar em manutencao','colocar o carro em manutencao','trocar status do veiculo','onde mudo operacional'],view:'assets',writer:true,
   intro:'A edição do veículo permite corrigir cadastro e definir disponibilidade operacional.',
   steps:['Abra Ativos / Veículos.','Localize a placa pela pesquisa ou pela lista.','Clique em Editar na linha correspondente.','No campo Situação operacional, selecione Ativo, Em manutenção ou Inativo.','Se mudar a situação, informe o motivo no campo disponível.','Clique em Salvar. A mudança de situação ficará no histórico do cadastro.'],
   note:'O KM já confirmado não pode ser substituído no cadastro: use KM e Troca de Óleo para registrar ou revisar leituras.'},
  {id:'vehicle-categories',group:'Veículos',title:'Categorias de veículos',aliases:['tipos de veiculo','categoria de veiculo','carro leve','van','caminhao','maquina','classificacao do veiculo'],view:'assets',
   intro:'O cadastro permite classificar veículos em Leve, Utilitário, Caminhão, Van, Trator, Máquina, Ônibus, Moto, Implemento, Equipamento e Outro.',
   steps:['Ao criar ou editar um ativo, abra o campo Categoria.','Escolha a classificação que melhor descreve a unidade.','Salve o cadastro.','Use o filtro Categoria para restringir os indicadores e o ranking de combustíveis.'],
   note:'Categoria descreve o tipo de ativo; Situação operacional descreve sua disponibilidade.'},
  {id:'drivers',group:'Pessoas',title:'Cadastrar ou editar motorista',aliases:['cadastrar motorista','adicionar motorista','novo motorista','editar motorista','cadastro de motorista','nome do motorista'],view:'drivers',writer:true,
   intro:'O cadastro de motorista é operacional e não equivale à criação de usuário para entrar no sistema.',
   steps:['Abra Motoristas.','Clique em + Novo motorista.','Informe o nome e, se tiver, telefone, número e categoria da CNH, validade e observações.','Escolha a situação do motorista e salve.','Para corrigir, use Editar na lista de motoristas.'],
   note:'Somente proprietário e gestor alteram cadastros. Os demais perfis têm consulta limitada dos dados privados.'},
  {id:'driver-link',group:'Pessoas',title:'Vincular motorista ao veículo',aliases:['vincular motorista','associar motorista ao carro','motorista responsavel','colocar motorista no veiculo','atribuir motorista'],view:'assets',writer:true,
   intro:'O XRMOVI permite associar um motorista responsável ao veículo da mesma empresa.',
   steps:['Cadastre o motorista na aba Motoristas e mantenha-o ativo.','Entre em Ativos / Veículos e abra Editar no veículo.','No campo de motorista, procure pelo nome e selecione o cadastro correto.','Clique em Salvar e verifique o nome na tabela de ativos.'],
   note:'Motorista inativo não pode receber um novo vínculo; um vínculo antigo pode ser preservado.'},
  {id:'cnh',group:'Pessoas',title:'Alertas de CNH e vencimento',aliases:['cnh vencida','validade da cnh','documento do motorista','renovar cnh','alerta de motorista','habilitacao vencendo'],view:'drivers',
   intro:'O sistema monitora a data de validade informada para motoristas ativos e alerta quando está vencida ou dentro dos próximos 30 dias.',
   steps:['Abra Motoristas.','Pesquise o profissional e confira a validade da CNH.','Se possuir permissão, clique em Editar para corrigir a data.','Consulte os avisos na Visão Geral e em Alertas.'],
   note:'Um motorista sem validade preenchida não gera alerta de vencimento; isso não significa documento regular.'},
  {id:'maintenance-plan',group:'Manutenção',title:'Programar manutenção por data ou KM',aliases:['programar manutencao','agendar revisao','criar revisao','servico preventivo','manutencao preventiva','revisao por km','revisao por data'],view:'maintenance',writer:true,
   intro:'A programação define o serviço e seu vencimento por data, quilometragem/horímetro ou ambos.',
   steps:['Entre em Manutenção / Despesas.','Clique em + Programar manutenção.','Selecione o veículo e descreva o serviço.','Defina uma data, uma leitura de KM/horímetro ou as duas informações.','Informe custo previsto e observações, se conhecidos.','Salve e acompanhe pelo filtro Pendentes.'],
   note:'O vencimento por KM não é convertido em dias. Manutenções concluídas permanecem no histórico.'},
  {id:'maintenance-edit',group:'Manutenção',title:'Corrigir uma manutenção programada',aliases:['editar manutencao','editar revisao','alterar prazo manutencao','reprogramar servico','corrigir servico','mudar data revisao'],view:'maintenance',writer:true,
   intro:'É possível editar a programação de um serviço pendente sem alterar seu veículo ou seus custos.',
   steps:['Abra Manutenção / Despesas e escolha Consultar manutenções.','Busque a placa ou o serviço e clique em Detalhes.','Escolha Editar programação.','Altere descrição, prazo por data ou KM, ou observações.','Informe obrigatoriamente o motivo e salve.'],
   note:'O XRMOVI registra alterações de manutenção para rastreabilidade. Uma versão desatualizada exige atualizar os dados.'},
  {id:'maintenance-close',group:'Manutenção',title:'Concluir manutenção e registrar custo',aliases:['concluir manutencao','finalizar revisao','fechar ordem de manutencao','registrar custo manutencao','custo realizado','servico concluido'],view:'maintenance',writer:true,
   intro:'Registrar custo e concluir manutenção são ações diferentes. Ao concluir, o sistema exige o custo realizado e a leitura de KM/horímetro.',
   steps:['Abra Manutenção / Despesas e localize o serviço.','Clique em Detalhes ou na ação correspondente.','Use Registrar custos para informar valores sem encerrar.','Para encerrar o serviço, escolha Concluir serviço.','Informe custo realizado e KM/horímetro na execução e confirme.','Confira o resultado no histórico e no relatório financeiro.'],
   note:'Não lance o mesmo custo novamente em Outras despesas, para evitar duplicidade.'},
  {id:'alerts',group:'Manutenção',title:'Entender os alertas e itens vencidos',aliases:['alertas','itens vencidos','em alerta','pendencias','aviso de vencimento','por que tem alerta','vencido no painel','manutencao vencida','proxima manutencao'],view:'alerts',
   intro:'A Central de Alertas reúne pendências de manutenção, de KM/troca de óleo e outras obrigações monitoradas conforme o cadastro.',
   steps:['Abra Alertas pelo menu ou clique no indicador Em alerta ou Itens vencidos.','Leia o nome do veículo, serviço ou documento e seu vencimento.','Abra o item para consultar os detalhes.','Corrija o cadastro de origem ou conclua o serviço, conforme a situação real.','Atualize o painel para confirmar que o aviso foi recalculado.'],
   note:'Não marque um serviço como concluído se ele ainda não foi executado.'},
  {id:'km-entry',group:'Quilometragem',title:'Atualizar o KM de um veículo',aliases:['atualizar km','cadastrar quilometragem','informar km','atualizar hodometro','registrar leitura','km total','alterar km do veiculo','hora maquina'],view:'assets',mileage:true,
   intro:'O campo exige a leitura TOTAL atual do hodômetro, e não a quilometragem percorrida desde o último registro.',
   steps:['Abra KM e Troca de Óleo no menu lateral, que leva à área de KM dentro de Ativos / Veículos.','Localize a placa desejada.','Informe a leitura TOTAL exibida no veículo.','Confira o alerta caso o valor seja menor que o KM já confirmado.','Confirme ou envie para conferência, dependendo das regras de validação.','Use Histórico KM para verificar a origem e os registros anteriores.'],
   note:'Exemplo: se o veículo já tem 20.000 km e percorreu mais 1.500, a nova leitura total é 21.500 km.'},
  {id:'km-bulk',group:'Quilometragem',title:'Registrar e conferir KM em lote',aliases:['km em lote','varios veiculos km','lancar km varios carros','km em varios carros','aprovar varias leituras','conferencia em lote','leitura em lote','atualizar varios km'],view:'assets',mileage:true,writer:true,
   intro:'O controle de KM permite lançar e conferir leituras de vários veículos, com validação antes de aprovar.',
   steps:['Abra KM e Troca de Óleo.','Localize a área de atualização em lote e selecione os veículos.','Informe o KM TOTAL por veículo ou o valor comum, quando apropriado.','Confirme as leituras e revise as pendências.','Leituras menores que o total já confirmado devem ser corrigidas ou rejeitadas, não aprovadas cegamente.'],
   note:'A origem e as decisões ficam registradas no histórico. Não use a função em lote sem conferir as placas.'},
  {id:'km-history',group:'Quilometragem',title:'Histórico e auditoria das leituras KM',aliases:['historico do km','origem da quilometragem','quem informou km','quem alterou km','auditoria km','corrigir km errado','km menor','km digitado errado','consertar km errado','km que cadastrei errado'],view:'assets',mileage:true,
   intro:'O histórico do KM identifica leituras recebidas, a origem do envio, conferências, correções e rejeições quando disponíveis.',
   steps:['Entre em KM e Troca de Óleo.','Na linha do veículo, clique em Histórico KM.','Confira a leitura enviada e o KM total aplicado, além do status da conferência.','Gestores também têm acesso à auditoria geral das leituras.','Se houver erro, use a correção/conferência autorizada em vez de tentar diminuir o KM pelo cadastro do veículo.'],
   note:'Registros legados podem não trazer autor ou leitura inicial completos.'},
  {id:'oil-plan',group:'Quilometragem',title:'Configurar aviso de troca de óleo',aliases:['configurar troca de oleo','troca de oleo por km','aviso de oleo','proxima troca de oleo','limite km oleo','programacao do oleo'],view:'assets',writer:true,mileage:true,
   intro:'A regra de óleo é definida por veículo, com intervalo, próxima leitura prevista e margem de aviso.',
   steps:['Abra Ativos / Veículos e clique em Editar no veículo.','Habilite Controle de óleo por quilometragem.','Informe Trocar óleo a cada, Próxima troca aos e o KM da última troca, se conhecido.','Escolha quantos quilômetros antes o sistema deve avisar.','Salve e acompanhe os avisos em KM e Troca de Óleo e em Alertas.'],
   note:'Use os intervalos prescritos para o veículo e a especificação de óleo; o sistema não determina o intervalo técnico.'},
  {id:'oil-complete',group:'Quilometragem',title:'Registrar troca de óleo concluída',aliases:['concluir oleo','troquei o oleo','registrar troca de oleo','historico troca oleo','marcar oleo concluido'],view:'assets',mileage:true,writer:true,
   intro:'Uma troca executada pode ser registrada com a leitura do veículo, data, óleo utilizado, custo e observações.',
   steps:['Abra KM e Troca de Óleo.','Encontre o veículo com plano de óleo configurado.','Clique em Concluir óleo.','Informe KM da troca, data, óleo utilizado, custo e observações.','Confirme e consulte Histórico de óleo para revisar os serviços.'],
   note:'Informe a execução real do serviço; um alerta não desaparece corretamente se o registro estiver incompleto.'},
  {id:'qr',group:'Quilometragem',title:'Usar o QR Code do veículo',aliases:['qr code','qrcode','codigo qr','leitura por celular','leitura por qr','qr do carro','como usar o qr code'],view:'assets',mileage:true,
   intro:'O QR Code facilita a consulta ou o envio de leitura de quilometragem por veículo, seguindo as permissões de acesso e conferência.',
   steps:['Abra KM e Troca de Óleo na empresa correta.','Na linha do veículo, clique em QR Code quando estiver disponível.','Abra o endereço associado no celular e siga o formulário de leitura.','Confira sempre a placa e informe a leitura TOTAL do veículo.','O gestor pode consultar a origem da leitura no Histórico KM.'],
   note:'O QR Code não autoriza registrar um KM inferior sem verificação.'},
  {id:'fuel',group:'Custos',title:'Registrar abastecimento',aliases:['registrar abastecimento','cadastrar abastecimento','novo abastecimento','lançar combustível','gasto com diesel','adicionar litros','posto de combustivel'],view:'fuel',writer:true,
   intro:'O módulo Abastecimentos registra custo e volume de combustível vinculados ao veículo da empresa.',
   steps:['Abra Abastecimentos.','Clique em + Registrar abastecimento.','Escolha o veículo e informe data, litros e valor total.','Preencha o KM/horímetro, posto e observações, se tiver.','Anexe o comprovante, se disponível, e salve.','Use o filtro de mês e categoria para consultar o ranking de custos.'],
   note:'O valor é registrado por abastecimento. A quilometragem total confirmada do veículo segue seu próprio controle.'},
  {id:'fuel-ranking',group:'Custos',title:'Entender o ranking de combustível',aliases:['ranking combustivel','quem gastou mais','carro que mais abasteceu','consumo de combustivel','gasto por veiculo','ranking abastecimento'],view:'fuel',
   intro:'O ranking soma as despesas de abastecimento registradas por veículo, no mês e nos filtros selecionados.',
   steps:['Abra Abastecimentos.','Selecione o mês desejado.','Escolha a categoria de veículo, se quiser restringir a lista.','Confira os valores associados a cada placa e compare os veículos.','Para análise completa, abra Relatórios financeiros e configure o período.'],
   note:'Ranking de valor gasto não é automaticamente indicador de consumo em km por litro.'},
  {id:'expenses',group:'Custos',title:'Cadastrar IPVA, multa ou despesa',aliases:['cadastrar despesa','registrar despesa','lançar multa','ipva','seguro veiculo','pedagio','lavagem','borracharia','licenciamento','despesa avulsa'],view:'maintenance',writer:true,
   intro:'Outras despesas têm cadastro separado das manutenções programadas, incluindo IPVA, multa, seguro, licenciamento, pedágio e outros.',
   steps:['Abra Manutenção / Despesas.','Clique em + Registrar despesa ou serviço.','Selecione o veículo e o tipo de despesa.','Preencha descrição, data, vencimento quando necessário e valor.','Informe a situação de pagamento e anexe comprovante, se tiver.','Salve e abra Consultar despesas e serviços para localizar o lançamento.'],
   note:'Não cadastre uma mesma manutenção novamente como despesa avulsa; isso poderia duplicar o custo.'},
  {id:'expenses-status',group:'Custos',title:'Despesas pagas, abertas e vencidas',aliases:['despesa em aberto','despesa paga','pagar despesa','multa vencida','pagamento vencido','porque nao aparece no financeiro'],view:'maintenance',
   intro:'Lançamentos em aberto continuam acompanhados por vencimento; o Financeiro consolida despesas avulsas pagas no período de pagamento.',
   steps:['Abra Manutenção / Despesas.','Selecione Consultar despesas e serviços.','Filtre por mês da despesa, tipo e pagamento: Todas, Em aberto, Vencidas ou Pagas.','Edite o lançamento para registrar o pagamento quando ele tiver ocorrido.','Consulte Relatórios financeiros para verificar os valores realizados.'],
   note:'Despesa em aberto não deve ser contabilizada como realizada até o registro de pagamento.'},
  {id:'financial',group:'Relatórios',title:'Consultar relatório financeiro',aliases:['relatorio financeiro','relatorio de custos','relatorio por periodo','relatorio mensal','relatorio diario','total gasto','gasto da frota','financeiro'],view:'financial',
   intro:'Relatórios financeiros consolidam combustível, manutenção realizada e despesas pagas nos veículos e no período selecionados.',
   steps:['Abra Relatórios financeiros.','Escolha Diário, Quinzenal, Mensal, Trimestral, Semestral ou Personalizado.','Defina data de referência ou intervalo De e Até.','Clique em Consultar período.','Confirme empresa, contrato e filtros de veículos antes de interpretar os totais.','Use Exportar relatório CSV ou Imprimir / salvar em PDF conforme sua necessidade.'],
   note:'Custos em aberto e custos efetivamente realizados são coisas diferentes.'},
  {id:'export',group:'Relatórios',title:'Exportar CSV ou salvar PDF',aliases:['exportar excel','baixar excel','exportar csv','gerar pdf do relatorio','baixar csv','salvar pdf','gerar pdf','imprimir relatorio','baixar relatorio'],view:'financial',
   intro:'Na versão atual, a exportação de dados financeiros é por CSV, que pode ser aberto no Excel, e PDF via recurso de impressão do navegador.',
   steps:['Abra Relatórios financeiros e consulte o período desejado.','Para planilha, clique em Exportar relatório CSV; depois abra o arquivo no Excel.','Para PDF, clique em Imprimir / salvar em PDF.','Na janela do navegador, escolha Salvar como PDF e confirme.','Verifique filtros, empresa e período no arquivo gerado.'],
   note:'CSV não é o mesmo formato que um arquivo .xlsx. Não prometa exportação XLSX nativa se o botão disponível é CSV.'},
  {id:'history',group:'Relatórios',title:'Consultar o histórico da frota',aliases:['historico da frota','historico de lancamentos','historico do abastecimento','registro antigo','registro passado','quem fez lancamento','auditoria historico','rastreabilidade'],view:'history',
   intro:'A aba Histórico reúne registros consultáveis de manutenção, abastecimentos e despesas pagas.',
   steps:['Abra Histórico.','Selecione a data inicial em De e a final em Até.','No filtro Tipo, escolha Manutenção, Abastecimento, Despesas pagas ou Todos.','Clique em Consultar para atualizar os registros.','Para histórico de leituras KM ou alterações de programação, use os históricos específicos de cada área.'],
   note:'Nem todo histórico identifica autor; isso depende do evento e da versão em que foi registrado.'},
  {id:'documents',group:'Documentos',title:'Anexar e consultar documentos',aliases:['documentacao','anexar documento','anexar crlv','anexar nota fiscal','upload pdf','documentos do carro','comprovante','ver anexos','arquivo do veiculo','ver documento'],view:'documents',
   intro:'Documentação consulta anexos associados aos veículos; documentos novos são anexados nos formulários de cadastro e lançamento.',
   steps:['Para anexar documento de veículo, abra Ativos / Veículos e use Editar ou Novo ativo.','Para nota fiscal de manutenção, abastecimento ou despesa, utilize o respectivo formulário.','Escolha um arquivo PDF, JPG, PNG ou WEBP de até 10 MB, quando o campo existir.','Salve o lançamento.','Abra Documentação para consultar os anexos vinculados e clique em Visualizar.'],
   note:'O armazenamento é privado e o acesso depende da autorização da empresa; não coloque documentos pessoais no chat.'},
  {id:'logo',group:'Organização',title:'Trocar a logo da empresa',aliases:['mudar logo','trocar logo','cadastrar logo','cadastrar a logo da minha empresa','alterar logo','foto da empresa','imagem da empresa','personalizar logo','logomarca'],view:'dashboard',writer:true,
   intro:'O painel permite personalizar a identidade visual da empresa ativa.',
   steps:['Abra a Visão Geral e localize a logo ou foto ao lado do nome da empresa.','Se tiver perfil de proprietário ou gestor, clique no ícone de lápis.','Escolha uma imagem PNG, JPG ou WEBP de até 2 MB.','Aguarde o aviso de confirmação e confira a logo atualizada.'],
   note:'A logo pode ser usada em saídas de relatório que tenham suporte à identidade da empresa.'},
  {id:'subscription',group:'Conta e plano',title:'Entender minha assinatura e limites',aliases:['minha assinatura','qual meu plano','limite de carros','limite de veiculos','limite de empresas','quantos usuarios','limite contratos','planos'],view:'subscription',
   intro:'Minha assinatura mostra o plano, a situação da conta e as cotas de empresas, contratos, veículos e logins.',
   steps:['Abra Minha assinatura no menu.','Confira o plano e o status apresentados pelo sistema.','Verifique as cotas e o consumo disponível.','Antes de adicionar ativos ou pessoas, confirme que há capacidade livre.','Se precisar ampliar o limite, o titular pode acessar Escolher / alterar plano.'],
   note:'As cotas são totais da assinatura: não são multiplicadas pela quantidade de empresas.'},
  {id:'change-plan',group:'Conta e plano',title:'Mudar de plano e pagar',aliases:['trocar plano','mudar plano','forma de pagamento','pagar mensalidade','assinar plano','pagar assinatura','mercado pago','checkout','renovar assinatura','confirmar pagamento','assinatura bloqueada'],view:'subscription',owner:true,
   intro:'O titular pode solicitar alteração de plano e iniciar pagamento pelo Mercado Pago, quando o serviço de cobrança estiver habilitado.',
   steps:['Abra Minha assinatura e localize Escolher / alterar plano.','Selecione o plano e confira os limites exibidos ao lado.','Solicitar mudança de plano registra a solicitação, mas não significa pagamento ou liberação imediata.','Quando habilitado, use Pagar com Mercado Pago e confirme o valor antes de autorizar o pagamento.','Volte ao painel e clique em Verificar pagamento se a confirmação ainda não aparecer.','Se uma tentativa já estiver pendente, use Retomar pagamento pendente em vez de iniciar outra cobrança.'],
   note:'O plano só é liberado após a confirmação efetiva do pagamento. Se o serviço estiver indisponível, converse com o suporte.'},
  {id:'company-add',group:'Conta e plano',title:'Adicionar mais uma empresa',aliases:['adicionar empresa','criar nova empresa','cadastrar empresa','segunda empresa','incluir empresa'],view:'subscription',owner:true,
   intro:'O titular pode adicionar empresas dentro da mesma assinatura, respeitando o limite contratado.',
   steps:['Abra Minha assinatura.','Localize a seção Adicionar empresa.','Preencha Nome da nova empresa e clique em Cadastrar empresa.','Selecione a empresa no seletor Empresa ativa para trabalhar com seus veículos.'],
   note:'Empresas diferentes têm cadastros separados. Veículos e contratos compartilham os limites globais do plano.'},
  {id:'users',group:'Conta e plano',title:'Convidar e vincular usuários',aliases:['criar usuario','adicionar usuario','convidar funcionario','adicionar login','vincular login','permissao gestor','acesso motorista','usuarios da empresa','funcionario acessar'],view:'subscription',owner:true,
   intro:'O titular gerencia usuários em Minha assinatura, vinculando e-mails já cadastrados e confirmados no XRMOVI.',
   steps:['Peça ao colaborador que crie uma conta XRMOVI e confirme o e-mail.','Abra Minha assinatura > Adicionar usuário.','Selecione a empresa.','Informe o e-mail confirmado e a permissão Gestor ou Motorista.','Clique em Vincular usuário e confirme se o colaborador consegue acessar a empresa autorizada.'],
   note:'Cadastrar motorista operacional não cria login; são cadastros diferentes. O número de acessos está sujeito ao plano.'},
  {id:'roles',group:'Conta e plano',title:'O que cada permissão pode fazer?',aliases:['permissoes','permissao','gestor pode','motorista pode','administrador pode','perfil de usuario','nao consigo editar','botao editar nao aparece'],view:'subscription',
   intro:'O XRMOVI diferencia o titular da assinatura, gestores e perfis de consulta ou motorista. Cada ação passa por validação de autorização.',
   steps:['Titular da assinatura: gerencia plano, empresas, contratos e vínculos de acesso.','Gestor: pode cadastrar e editar veículos, motoristas, manutenções e lançamentos autorizados.','Motorista e outros colaboradores: podem ter consultas ou fluxos específicos, mas não recebem automaticamente poderes de gestor.','Se um botão de edição não aparecer, confirme empresa ativa e permissão com o titular.'],
   note:'Não compartilhe credenciais para contornar as permissões. O painel interno do proprietário da plataforma é separado das contas dos clientes.'},
  {id:'support',group:'Ajuda',title:'Enviar mensagem ao suporte',aliases:['suporte','atendimento','abrir chamado','falar com suporte','pedir suporte','enviar mensagem','falar com administrador','reclamacao','problema na conta'],view:null,route:'../cliente/',
   intro:'A área Mensagens / Suporte permite ao titular conversar com a administração da plataforma.',
   steps:['No menu lateral, clique em Mensagens / Suporte.','Confira a empresa escolhida na página Minha conta e mensagens.','Digite sua dúvida no campo de mensagem.','Clique em Enviar mensagem.','Use Atualizar mensagens para consultar a resposta.'],
   note:'O assistente não envia mensagens sozinho. Não inclua senhas, tokens ou documentos sensíveis no texto.'},
  {id:'troubleshoot',group:'Ajuda',title:'Resolver painel vazio ou dados ausentes',aliases:['nao aparece nada','dados sumiram','frota vazia','nao carrega','painel zerado','erro de carregamento','numeros diferentes','tela zerada','contadores errados','valor nao aparece'],view:'dashboard',
   intro:'Números vazios ou diferentes podem ocorrer por empresa, contrato, filtros, período ou falha de consulta.',
   steps:['Confira a empresa ativa.','Verifique se o contrato e os filtros de busca, categoria e situação não estão limitando os resultados.','Clique em Limpar todos, se quiser ver a empresa inteira.','Confira o mês de abastecimento ou o período do relatório financeiro.','Use o botão Atualizar dados do banco.','Se o erro continuar, registre a tela e envie uma mensagem ao suporte.'],
   note:'Não recrie cadastros apenas porque uma consulta está vazia; primeiro confira os filtros.'},
  {id:'mobile',group:'Ajuda',title:'Usar o XRMOVI no celular',aliases:['acessar no celular','painel no celular','mobile','versao responsiva','menu do celular','tela do celular'],view:'dashboard',
   intro:'O dashboard é responsivo e oferece seletores de empresa e de tela quando o menu lateral fica reduzido.',
   steps:['Abra o endereço do XRMOVI no navegador do celular.','Entre com o mesmo login autorizado.','Use Empresa para escolher a empresa ativa.','No seletor Tela, escolha Visão Geral, Veículos, Motoristas, Abastecimentos ou o módulo desejado.','Se necessário, role a tela para encontrar os botões e as tabelas do módulo.'],
   note:'Uma tela pequena pode reposicionar filtros e ações sem alterar as permissões ou os dados.'}
];
const safe = value=>String(value||'');
const normalize = value=>safe(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const stop = new Set(['como','faco','fazer','para','uma','uns','pelo','pelo','sobre','qual','quais','onde','isso','essa','esse','meu','minha','seu','sua','essa','esse','pode','posso','quero','preciso','com','tem','que','por','dos','das','do','da','de','em','no','na','um','e','o','a','os','as','ser','estar','se','pelo','aqui','pra','ai','ali','eu','voce','agora','tela']);
const synonyms={mudo:'mudar',muda:'mudar',troco:'trocar',cadastra:'cadastrar',cadastro:'cadastrar',cadastrei:'cadastrar',altero:'alterar',alterei:'alterar',coloco:'colocar',coloca:'colocar',gero:'gerar',gera:'gerar',vejo:'ver',relatorios:'relatorio',veiculos:'veiculo',carros:'carro',motoristas:'motorista',contratos:'contrato',documentos:'documento',alertas:'alerta',despesas:'despesa',operacionais:'operacional',vencidas:'vencido',caminhoes:'caminhao',lanco:'lancar'};
function words(str){return normalize(str).split(' ').filter(w=>(w.length>2||w==='km'||w==='qr')&&!stop.has(w)).map(w=>synonyms[w]||w);}
function rank(question,topic){
 const q=normalize(question), qw=words(q);
 if(!qw.length)return 0;
 const aliases=[topic.title,...topic.aliases].map(normalize);
 let score=0;
 for(const alias of aliases){
  if(alias===q)return 120;
  if(q.includes(alias)&&alias.length>=8&&words(alias).length>=2)score=Math.max(score,85);
  const a=words(alias);
  if(a.length>1&&a.every(w=>qw.includes(w)))score=Math.max(score,56+a.length);
  if(a.length===1&&qw.includes(a[0])&&a[0].length>4&&!new Set(['carro','carros','veiculo','veiculos','empresa','motorista','sistema','status','registro','historico','tela','pagina','dados']).has(a[0]))score=Math.max(score,30);
 }
 const titleWords=words(topic.title);
 const common=titleWords.filter(w=>qw.includes(w)).length;
 score+=common*7;
 return score;
}
function find(question,opts={}){
 const q=normalize(question);
 if(!q)return null;
 const scored=topics.map(t=>({topic:t,score:rank(q,t)})).sort((a,b)=>b.score-a.score);
 if(scored[0].score<26)return null;
 if(scored[0].score<48&&scored[1]?.score>=scored[0].score-4)return null;
 return scored[0].topic;
}
function answer(topic,mode='steps',userRole=''){
 const intro=topic.intro;
 if(mode==='meaning')return intro+' '+(topic.note||'');
 const lines=topic.steps.map((step,i)=>(i+1)+'. '+step);
 const audience = topic.owner ? 'Requer acesso de titular da assinatura. ' : topic.writer?'Para gravar ou alterar dados, é necessário perfil de proprietário ou gestor. ':'';
 return intro+'\n\nPasso a passo:\n'+lines.join('\n')+'\n\n'+audience+(topic.note||'');
}
function chapters(){
 return Array.from(new Set(topics.map(t=>t.group)));
}
global.XrmoviGuideCourse=Object.freeze({
 version:'2026-10-30', topics:Object.freeze(topics), chapters, normalize, find, answer,
 getById:id=>topics.find(t=>t.id===id)||null
});
})(window);
