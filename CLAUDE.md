# Controle Condominial (Bloco I)

## Publicação
- Depois de fazer e testar cada mudança, **sempre** criar o pull request para `master` e fazer o merge, sem perguntar antes.
- Ao alterar arquivos do site, aumentar a versão do cache em `sw.js` (`blocoi-vNN`), senão o celular continua mostrando a versão antiga.

## Comunicação
- Responder em português, com linguagem simples, analogias e exemplos.

## Como o sistema funciona
- Site estático (HTML, CSS e JS puros, sem build). Os dados vêm de uma planilha Google (`SHEET_ID` em `app.js`), lida aba por aba em CSV (`fetchSheet`), sempre direto da planilha ao abrir o site (`primeiraCarga` em `app.js`). Com a página aberta, recarrega a cada 5 minutos (`REFRESH_INTERVAL`, relógio ↻ no topo), e o botão ↻ recarrega na hora. A cópia guardada no navegador (`CACHE_TTL`, 5 minutos) serve para trocas de ano/mês e, se a internet falhar, a última cópia é usada mesmo antiga.
- Abas da planilha: `Receitas AAAA`, `Despesas`, `Config`, `Comunicados`, `Contatos`, `FAQ`, `Pendencias`.
- Datas na planilha no formato DD/MM/AAAA, como texto.
- Para testar localmente: `python3 -m http.server` e Playwright, simulando as respostas da planilha (a biblioteca de gráficos vem de CDN e pode não carregar no ambiente de teste).
