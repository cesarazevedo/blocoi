# FC Ranking

Site de ranking dos jogos de FC: Rankings (Elo), Medalhas, Recordes, Partidas com filtros e Admin.

## Rodar

```bash
npm start        # http://localhost:3000
npm test
```

Precisa de Node 22.5 ou mais novo. Não tem dependências para instalar.

- Na primeira vez, as partidas de `data/partidas.txt` são carregadas no banco (SQLite, `data/fc.db`).
- Abra **Admin** e crie o primeiro administrador. Depois ele cria os outros.
- Variáveis: `PORT`, `DB_PATH` (onde fica o banco), `COOKIE_SECURE=1` (se usar HTTPS),
  `ANTHROPIC_API_KEY` (liga a leitura de print na importação).
- Em hospedagem, aponte `DB_PATH` para um disco persistente, senão o banco some a cada deploy.
