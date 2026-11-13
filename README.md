# XRMOVI — novo repositório oficial

Migração de código realizada em 11/11/2026 a partir de [rhianmello/nospassa-frotas](https://github.com/rhianmello/nospassa-frotas).

## Situação da transferência
- 198 arquivos de código, configuração pública, testes e recursos textuais copiados.
- Arquivo `README.md` substituído por este guia.
- Arquivo `CNAME` presente aponta para `xrmovi.com.br`.
- Vídeo comercial `assets/videos/XRMOVI_comercial_web.mp4` está no repositório. A reprodução em produção depende de teste no navegador.
- Supabase permanece no mesmo projeto: `ztqtcbzjesrkuaijmylm`. Não migrar dados nem excluir usuários.
- Projeto `bi-epc15` não faz parte deste repositório ou migração e não deve ser alterado.

## Publicação em xrmovi.com.br
1. Verificar visualização, áudio e poster do vídeo comercial já versionado.
2. Conferir URL Configuration / Redirect URLs de Authentication no Supabase, pagamentos e funções Supabase.
3. Conferir URLs absolutas antigas em SEO, analytics, autenticação e URLs de retorno do Mercado Pago; atualizar **somente no novo repositório**.
4. Configurar GitHub Pages deste repositório com a branch `main`, pasta `/ (root)` e domínio personalizado `xrmovi.com.br`, somente após revisão.
5. Confirmar resolução DNS, emissão de HTTPS e testes de login, cadastro, checkout, administração e mobile.
6. Depois que o novo domínio estiver íntegro, planejar redirecionamento do domínio antigo.

## Componentes
- `index.html`: landing page, planos e autenticação.
- `v3/`: plataforma de gestão de frotas.
- `admin/`: painel administrativo.
- `supabase/functions/`: cobrança, reconciliação, e-mails e serviços.
- `supabase/migrations/`: histórico de alterações do banco (**não executar novamente indiscriminadamente**).
- `tests/` e `v3/tests/`: testes.
- `assets/`: identidade e mídia.

## Regras de segurança
- Não inserir tokens privados, `service_role` ou segredos do Mercado Pago no GitHub público.
- Não apagar usuários do Supabase.
- Não tocar no projeto `bi-epc15`.
- Não interromper a publicação do repositório antigo antes da homologação.
