# Logo da empresa — XRMOVI V3

A Central Operacional usa `company.name`, `logo_path` e `logo_url` retornados por `xrmovi_my_companies`. Sem imagem, mostra “Logo / Foto”. O lápis aparece somente para `owner` e `manager`.

O upload aceita PNG, JPEG e WebP de até **2 MB**, conforme o bucket existente. A imagem precisa ser decodificável e ter no máximo 25 megapixels. Cada envio cria um caminho novo `<company_id>/<uuid>.<ext>` no bucket privado `xrmovi-company-logos`; imagens anteriores são preservadas. Se a gravação no banco falhar, a logo anterior permanece ativa e o erro aparece junto à logo.

`xrmovi_company_logo_save(cid, p_path)` confirma o vínculo e papel atual do usuário, o prefixo da empresa e a existência do objeto. A RPC altera apenas a referência da logo. As políticas existentes do Storage verificam o vínculo na leitura e exigem `owner`/`manager` no upload. O schema `xrmovi` continua sem acesso direto pelo navegador.

A migration adiciona `xrmovi.companies.logo_url` e sincroniza esse campo quando `logo_path` muda, inclusive pela edição de identidade já existente. A URL persistida é a URL autenticada estável do Storage, sem token temporário. O bucket permanece privado: para exibir a logo, `company-branding.js` baixa a imagem com a sessão atual e usa uma URL local de objeto.

## Uso em futuros relatórios PDF

Na página V3, use:

```js
const branding = await window.XrmoviCompanyBranding.forPdf();
// { companyId, name, logo_url, logoDataUrl }
// logoDataUrl: PNG compatível com jsPDF, ou null quando não há logo.
```

O helper captura a empresa antes de aguardar o download, preserva transparência e converte WebP/JPEG em PNG com lado máximo de 1600 pixels. Assim, o relatório usa a mesma identidade da tela, sem persistir URLs assinadas que expiram. Uma falha de acesso ou de imagem rejeita a Promise para o gerador tratar explicitamente.

Os relatórios e scripts legados em `cpl-original/` não são executados pelo adaptador V3. Esta alteração prepara a identidade compartilhada; não ativa exportações que ainda estão desabilitadas.

## Verificação

O teste de autorização SQL usa registros temporários dentro de uma transação e executa `ROLLBACK`. Verifica proprietário, gestor, motorista, usuário sem sessão, empresa alheia, caminho inválido, objeto inexistente e sincronização da URL.

O teste de interface usa o HTML real e simula o Supabase, sem credenciais nem alteração de dados de clientes. Ele verifica upload, falhas, permissões, troca de empresa e preparação para PDF.
