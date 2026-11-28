# Controle Condominial (Bloco I)

## Publicação
- Depois de fazer e testar cada mudança, **sempre** criar o pull request para `master` e fazer o merge, sem perguntar antes.
- Ao alterar arquivos do site, aumentar a versão do cache em `sw.js` (`blocoi-vNN`), senão o celular continua mostrando a versão antiga.

## Comunicação
- Responder em português, com linguagem simples, analogias e exemplos.

## Como o sistema funciona
- Site estático (HTML, CSS e JS puros, sem build). Os dados vêm de uma planilha Google (`SHEET_ID` em `app.js`), lida aba por aba em CSV (`fetchSheet`), com cache de 30 minutos no navegador.
- Abas da planilha: `Receitas AAAA`, `Despesas`, `Config`, `Comunicados`, `Contatos`, `FAQ`, `Pendencias`.
- Datas na planilha no formato DD/MM/AAAA, como texto.
- Para testar localmente: `python3 -m http.server` e Playwright, simulando as respostas da planilha (a biblioteca de gráficos vem de CDN e pode não carregar no ambiente de teste).
