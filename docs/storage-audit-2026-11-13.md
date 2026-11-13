# XRMOVI — Auditoria de Storage (somente leitura)
Data: 13/11/2026 · Projeto Supabase: `ztqtcbzjesrkuaijmylm`.

## Medição real
Somente objetos com bucket prefixado `xrmovi-` foram contabilizados.
Nenhum arquivo foi baixado, alterado ou excluído nesta auditoria.

| Bucket | Objetos | Bytes | Aproximado MiB | Público |
| --- | ---: | ---: | ---: | --- |
| xrmovi-odometer-proof | 11 | 14.459.406 | 13,79 | Não |
| xrmovi-record-attachments | 8 | 4.810.099 | 4,59 | Não |
| xrmovi-maintenance-docs | 1 | 2.570.118 | 2,45 | Não |
| xrmovi-company-logos | 8 | 420.193 | 0,40 | Não |
| xrmovi-fuel-receipts | 0 | 0 | 0,00 | Não |
| xrmovi-vehicle-docs | 0 | 0 | 0,00 | Não |
| **Total** | **28** | **22.259.816** | **21,23** | **Privados** |

O bucket `ir-extratos` é de outro produto e foi explicitamente excluído da medição.

### Perfil de mídia
- Quilometragem: 6 JPEGs = 13.161.173 bytes, média 2.142 KiB, maior JPEG 3.112.762 bytes.
- Quilometragem: 5 PNGs = 1.298.233 bytes.
- Anexos de registros: 7 PDFs = 4.630.678 bytes; 1 JPEG = 179.421 bytes.
- Manutenção: 1 PNG = 2.570.118 bytes.
- Logos: 6 PNGs = 415.003 bytes e 2 JPEGs = 5.190 bytes.
- Nenhum objeto do XRMOVI tem mais de 5 MiB no inventário consultado.

### Referências não localizadas (candidatos, não órfãos confirmados)
Consulta com `storage.objects` e as colunas atuais das tabelas principais de referência:

| Bucket | Objetos sem referência direta encontrada | Bytes |
| --- | ---: | ---: |
| Logos | 6 | 227.074 |
| Manutenção | 1 | 2.570.118 |
| Quilometragem | 2 | 2.545.825 |
| Anexos | 3 | 4.209.968 |
| **Total** | **12** | **9.552.985** |

**Atenção:** ausência de referência direta nas tabelas verificadas NÃO prova que o objeto possa ser excluído. Pode haver uso histórico, visualização por URL assinada, prévia, exclusão lógica, importação antiga ou rotina pendente. Os caminhos não são expostos no relatório.

A consulta também encontrou possíveis objetos com eTags repetidos dentro dos mesmos buckets. O eTag repetido sugere conteúdo possivelmente idêntico, mas não é substituto de verificação criptográfica independente nem autoriza remoção.

## Estratégia implementada
- Fotos e documentos novos: compressão no navegador por perfil (logo, foto do motorista, anexo).
- JPG e WebP: codificação de alta qualidade, limite de dimensões; somente usar o arquivo novo quando houver redução mínima de 8%.
- PNG: preservar transparência e evitar conversão com perdas; redimensionar somente quando exceder o máximo do perfil e se efetivamente reduzir espaço.
- PDF: **nenhuma regravação ou compactação**; manter bytes exatos inclusive documentos assinados digitalmente. Arquivos acima do limite são recusados, não adulterados.
- Caminhos e nomes de mídia coerentes com o tipo MIME resultante; nomes originais de anexos são mantidos para referência humana.
- Nova verificação local por SHA-256 evita envio repetido do mesmo anexo ao mesmo registro enquanto a aba estiver aberta.
- Progresso indeterminado durante a transferência: o upload padrão de Supabase Storage não fornece percentual real ao navegador. Não exibir porcentagens artificiais.

## Economia
**Redução real medida na base existente: 0 byte.** O sistema não processa nem altera arquivos anteriormente salvos.

O potencial será observado nos próximos uploads. A redução depende da resolução, qualidade e conteúdo da imagem. Exemplo ilustrativo, **não observado**: se futuras fotos equivalentes aos 13,16 MB dos JPEGs medidos forem reduzidas de 40% a 65%, deixariam de consumir cerca de 5,26 a 8,55 MB. Não é garantia e não é receita/custo de Supabase calculado.

## Validação manual remanescente
- iPhone/Safari e Android: orientação EXIF, nitidez de dígitos de hodômetro, textos pequenos e comprovantes.
- PDF real com assinatura ICP-Brasil e PDF protegido: preservar os bytes; verificar no Adobe Acrobat sem regravar.
- Perda de conexão durante transferência e o tratamento de resposta incerta do backend.
- Inventariar referências indiretas e exclusões auditadas antes de qualquer eventual limpeza.
- Para progresso percentual real e retomada de upload, avaliar TUS resumable com autenticação e política de bucket, em outra etapa: [Supabase Storage resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
