# XRMOVI — Etapa 4B: relatório administrativo de armazenamento e confiabilidade

**Data:** 13/11/2026 · **Projeto:** `ztqtcbzjesrkuaijmylm`  
**Repositório:** `rhianmello/XRMOVI` · **Fonte:** consultas somente-leitura no SQL Editor do Supabase.

## Inventário verificado, sem alteração de arquivos

| Bucket privado | Objetos | Bytes | MiB aproximados |
| --- | ---: | ---: | ---: |
| xrmovi-odometer-proof | 11 | 14.459.406 | 13,79 |
| xrmovi-record-attachments | 8 | 4.810.099 | 4,59 |
| xrmovi-maintenance-docs | 1 | 2.570.118 | 2,45 |
| xrmovi-company-logos | 8 | 420.193 | 0,40 |
| xrmovi-fuel-receipts | 0 | 0 | 0 |
| xrmovi-vehicle-docs | 0 | 0 | 0 |
| **Total** | **28** | **22.259.816** | **21,23** |

Os buckets do XRMOVI permanecem privados. Nenhum objeto existente foi excluído, baixado ou reprocessado. O bucket `ir-extratos` de outro produto está excluído.

### Candidatos a revisão humana, não a exclusão

| Bucket | Sem referência direta atual | Bytes | Coincidência de ETag com objetos ativos |
| --- | ---: | ---: | ---: |
| Logotipos | 6 | 227.074 | 0 |
| Manutenção | 1 | 2.570.118 | 0 |
| Quilometragem | 2 | 2.545.825 | 0 |
| Anexos de registros | 3 | 4.209.968 | 2 |
| **Total** | **12** | **9.552.985** | **2** |

Referências consultadas: `xrmovi.companies.logo_path`, `odometer_reports.photo_path`, `driver_service_submissions.photo_path`, `record_attachments.object_path`, `maintenance_attachments.object_path`, `fuel_receipts.object_path`, `vehicle_documents.object_path`, `document_deletion_audit.object_path`.

- **Zero candidatos apareceram no histórico de exclusão consultado.** Isso NÃO significa que não possuam outras referências indiretas ou históricos antigos.
- **Dois candidatos possuem ETag igual ao de um arquivo com referência ativa**, possível conteúdo semelhante. ETag não confirma sozinho identidade criptográfica nem justifica remoção.
- As datas de criação dos candidatos variam de 28/10 a 12/11/2026; o inventário é um retrato do momento da consulta.
- Para uma revisão administrativa, executar `docs/storage-review-4b.sql` no SQL Editor: retorna identificadores pseudonimizados, tamanho, data e classificação, sem expor caminhos pessoais. **Não inclui comando de exclusão.**
- Sem evidência complementar de todas as referências, **nenhum dos 12 candidatos deve ser apagado**.

## Decisão técnica — TUS

A documentação Supabase recomenda TUS para arquivos maiores que 6 MiB, conectividade instável e progresso real. O maior objeto do Storage no inventário tem 3.855.698 bytes; portanto a implantação é **preventiva para novos anexos de 6–10 MiB**, e não muda o histórico armazenado.

- Arquivos até 6 MiB: mantém upload padrão com progresso **indeterminado** até o servidor confirmar, sem simular percentual.
- Anexos acima de 6 MiB e até o limite permitido: TUS usando dependência `tus-js-client@4.3.1`, chunks de 6 MiB, progresso baseado em bytes efetivamente reportados e tentativas de retomada.
- Caminho segregado por empresa, tipo e registro; URL de retomada vinculada à identidade, bucket e arquivo; `upsert=false`; sessão do usuário continua verificada pelo Supabase.
- Cancelamento não solicita exclusão remota, para permitir retomada posterior.
- Resposta incerta do Storage é conciliada com o mesmo caminho de objeto; falha depois de registro concluído não deve ser apresentada como falha do upload.
- **Limite:** o nome aleatório do objeto é mantido na memória enquanto a aba fica aberta. Reabrir a página inicia outro objeto; retomada após reiniciar o navegador ainda não é garantida e não deve ser anunciada como concluída.

## Comprovantes legados

A rotina em `v3/cpl-original/js/frota.js` foi vinculada ao otimizador compartilhado, preservando a interface antiga `data:image/jpeg;base64,...`, o limite de 650.000 caracteres e o backend `fleet_fuel_receipt_save`. Isso não altera os comprovantes já armazenados.

## Métricas de upload

A Central de Documentos informa, para a **sessão atual no navegador e empresa selecionada**:

- envios concluídos, bytes originais, bytes finais, bytes poupados;
- contagem de erros e interrupções;
- progresso real (somente TUS) e tamanho original/final.

Nenhum nome de arquivo, documento ou caminho é transmitido para serviço externo de analytics por essa rotina. Essas métricas não devem ser confundidas com totais financeiros ou estatísticas globais de todos os clientes. Os totais históricos do Storage podem ser medidos com o segundo SELECT em `docs/storage-review-4b.sql`.

## Economia

- Redução efetivamente medida nos **arquivos já existentes**: **0 bytes**; não foram modificados.
- A Etapa 3 registrou 47% de economia em um arquivo sintético de teste de foto; não representa a média real dos usuários.
- A economia efetiva futura poderá ser comparada por arquivo/empresa apenas quando ocorrerem novos uploads, a partir das métricas do navegador.
- Estimar custos em R$ exige preços, volume futuro e transferência medidos; não há projeção econômica confiável só com o inventário atual.

## Validações ainda externas ou restritas

1. Assinatura **ICP-Brasil/PAdES real** e PDF criptografado/permitido: confirmar em ferramentas oficiais; a rotina nova não altera nem regrava bytes de PDFs, mas os testes automatizados usam arquivos sintéticos.
2. Orientação EXIF e legibilidade de nota/hodômetro em **iOS Safari e Android físicos**.
3. TUS contra o endpoint real com credenciais de **conta controlada**: testes automatizados usam cliente mock e não efetuam uploads no bucket de clientes.
4. Em caso de mudança de navegador, perda de sessão ou remoção de armazenamento local, a retomada entre sessões não é garantida.
5. Persistência de métricas agregadas no servidor precisaria de schema, políticas e revisão de autorização em etapa separada; **não foi adicionado endpoint público nem alteradas permissões nesta etapa**.

## Fontes técnicas

- [Supabase: Resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [tus-js-client v4 API](https://github.com/tus/tus-js-client/blob/main/docs/api.md)
