# XRMOVI V3

Painel autenticado em /v3/. Consulte o README principal para arquitetura, rotas, testes e pendências comerciais.

A estrutura visual originou-se do módulo Frota CPL. Os scripts de cpl-original/js/ permanecem como referência e não são executados.

O adaptador integra seleção de empresa, veículos, motoristas, manutenção, despesas, abastecimentos, documentos, alertas e relatórios por RPCs XRMOVI. Permissões e acesso operacional são conferidos no backend.

A disponibilidade de pagamento vem do backend. Cartão é recorrente; Pix tem renovação manual. Cadastro e QR emitido não equivalem a pagamento.

Na raiz: npm test e npm run test:browser. Os mocks não substituem homologação do fluxo completo autenticado.
