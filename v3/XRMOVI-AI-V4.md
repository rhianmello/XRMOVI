# XRMOVI VOZ — V4 (30/10/2026)

## Arquitetura entregue

O assistente permanece na rota `/v3/`, com uma única esfera e interface compacta. Ele utiliza:
- `xrmovi-assistant-brain.js`: interpretação determinística, continuidade entre perguntas, perguntas de esclarecimento, cálculos e comandos.
- `xrmovi-adapter.js`: camada de acesso aos dados **já autorizados** da empresa ativa, com RPC `xrmovi_cost_report` para meses comparados e `xrmovi_mileage_readings` para auditoria de KM.
- `xrmovi-guide-course.js`: as 41 aulas existentes, preservadas.
- `xrmovi-local-assistant.js` e CSS: interface, voz brasileira, velocidade 2x padrão, botão de interrupção, cinco temas, conteúdo de aula separado da conversa.
- `xrmovi-local-model.js` e `xrmovi-local-model-worker.js`: opção experimental, **desligada por padrão**, que tenta carregar um modelo quantizado em WebGPU. Requer internet para baixar o modelo e cache do navegador. Não depende de API paga de inferência.

## Proteção e limitações

- **Não recebe credenciais nem dados reais de usuários por um serviço de IA.** A consulta da frota ocorre pela sessão atual do Supabase. A IA generativa, quando ativada, recebe apenas a pergunta digitada e trechos do manual; não recebe os registros da empresa, nem tem ferramentas SQL.
- A camada de comandos pode **somente** abrir telas, preparar formulários, selecionar filtros ou consultar dados autorizados. Não altera registros, pagamentos ou planos automaticamente.
- Os dados são restritos à empresa/contrato/filtros atuais. Trocar de empresa ou sair limpa o contexto. Alterações de filtros durante uma consulta financeira impedem apresentar resultado desatualizado.
- Classificações e cálculos financeiros são determinísticos, não fabricados pelo modelo. Gastos usam lançamentos com valor informado; valores ausentes não compõem os totais.
- A auditoria de KM mostra remetente/revisor apenas quando a RPC autorizada devolve esses campos. Dados legados podem não ter autor.
- Comparações de empresas diferentes não são executadas automaticamente. Para análises multiempresa, seria necessário implementar um relatório agregado com permissões específicas.
- **Modo local:** `onnx-community/Qwen2.5-0.5B-Instruct`, Transformers.js `4.3.2`, quantização q4, WebGPU. Modelo base Qwen2.5-0.5B-Instruct licenciado Apache-2.0. A disponibilidade e desempenho dependem de GPU, memória, navegador, CDN e rede. A interface só mostra o modelo como pronto após uma geração de teste ocorrer de fato no navegador.
- Sem WebGPU, falha de download ou cancelamento, o **Assistente Essencial** continua disponível. Não há exigência de Python nem servidor de IA.
- Reconhecimento de voz por SpeechRecognition, quando disponível, **pode depender do fornecedor do navegador**; isso não é garantia de transcrição local.
- **Pendente de homologação humana:** uso completo do modelo local em navegadores/dispositivos reais, casos extremos de permissões e desempenho na infraestrutura de cada cliente. Testes automatizados de modelo são *mocks*: não baixam pesos e não comprovam inferência real.

## Como testar

1. Acesse `https://frota.nospassa.com.br/v3/` com a conta autorizada.
2. Abra o orbe e pergunte: `O que significa operacional?` → `E como faço para mudar isso?` → `Onde fica?` → `Me mostra`.
3. Pergunte `Quantos veículos eu tenho?`, `Quais estão em manutenção?`, `Qual veículo gastou mais combustível neste mês?`, `E o mês passado?`, `Compare os gastos dos dois últimos meses`.
4. Selecione outra empresa e verifique que os resultados e o assunto anterior sejam limpos.
5. Para testar o modo experimental, expanda `⚙ Voz e tema` e escolha `Ativar IA local (experimental)`. O primeiro download pode ser grande. A ativação não é obrigatória e pode ser cancelada.
6. Valide junto a usuários reais com diferentes papéis (titular, gestor, motorista) antes de apresentar a opção experimental comercialmente.

## Testes automatizados

- `v3/tests/assistant-course.test.cjs`: roteamento e cobertura das 41 aulas.
- `v3/tests/assistant-brain.test.cjs`: conversa encadeada, números autorizados, leitura KM, isolamento de empresa, comandos, papéis e recusas.
- `v3/tests/assistant-layout.test.cjs`: interface compacta e voz padrão.
- `v3/tests/assistant-local-model.test.cjs`: opção sob demanda, fallback e protocolo seguro (simulado).
- Regressões de assinaturas, pagamentos e suporte permanecem no fluxo GitHub Actions.

Não confundir o modelo generativo experimental com uma inteligência de produção homologada. O modo essencial é a base estável.
