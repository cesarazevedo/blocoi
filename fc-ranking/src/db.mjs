import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function abrirBanco(arquivo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS jogadores (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS partidas (
      id INTEGER PRIMARY KEY, data TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'A',
      p1 INTEGER NOT NULL REFERENCES jogadores(id), p2 INTEGER NOT NULL REFERENCES jogadores(id),
      g1 INTEGER NOT NULL, g2 INTEGER NOT NULL, pts_antigo INTEGER, seq INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_partidas_data ON partidas(data, seq);
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expira INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  return db;
}

export const hashSenha = (senha) => {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(senha, sal, 64).toString('hex')}`;
};
export const confereSenha = (senha, h) => {
  const [sal, hex] = h.split(':');
  const a = Buffer.from(hex, 'hex'), b = scryptSync(senha, sal, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export function bancoDe(db) {
  const q = (sql) => db.prepare(sql);
  const api = {
    config(chave, padrao) { const r = q('SELECT valor FROM config WHERE chave=?').get(chave); return r ? r.valor : padrao; },
    setConfig(chave, valor) { q('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(chave, String(valor)); },
    jogadores: () => q('SELECT id, nome FROM jogadores ORDER BY nome').all(),
    jogadorPorNome(nome) {
      nome = nome.trim().replace(/\s+/g, ' ');
      const r = q('SELECT id FROM jogadores WHERE nome=?').get(nome);
      if (r) return r.id;
      return Number(q('INSERT INTO jogadores(nome) VALUES(?)').run(nome).lastInsertRowid);
    },
    partidasCronologicas: () => q('SELECT * FROM partidas ORDER BY data, seq, id').all(),
    proximaSeq: () => (q('SELECT MAX(seq) m FROM partidas').get().m ?? 0) + 1,
    inserir(p, seq) {
      const p1 = api.jogadorPorNome(p.p1), p2 = api.jogadorPorNome(p.p2);
      return Number(q('INSERT INTO partidas(data,tipo,p1,p2,g1,g2,pts_antigo,seq) VALUES(?,?,?,?,?,?,?,?)')
        .run(p.data, p.tipo, p1, p2, p.g1, p.g2, p.pts_antigo ?? null, seq ?? api.proximaSeq()).lastInsertRowid);
    },
    atualizar(id, p) {
      const p1 = api.jogadorPorNome(p.p1), p2 = api.jogadorPorNome(p.p2);
      return q('UPDATE partidas SET data=?,tipo=?,p1=?,p2=?,g1=?,g2=? WHERE id=?').run(p.data, p.tipo, p1, p2, p.g1, p.g2, id).changes;
    },
    apagar: (id) => q('DELETE FROM partidas WHERE id=?').run(id).changes,
    transacao(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    renomear: (id, nome) => q('UPDATE jogadores SET nome=? WHERE id=?').run(nome.trim().replace(/\s+/g, ' '), id).changes,
    apagarJogadoresSemJogos: () => q('DELETE FROM jogadores WHERE id NOT IN (SELECT p1 FROM partidas UNION SELECT p2 FROM partidas)').run().changes,
    admins: () => q('SELECT id, usuario FROM admins ORDER BY usuario').all(),
    totalAdmins: () => q('SELECT COUNT(*) n FROM admins').get().n,
    criarAdmin: (usuario, senha) => Number(q('INSERT INTO admins(usuario,hash) VALUES(?,?)').run(usuario.trim(), hashSenha(senha)).lastInsertRowid),
    adminPorUsuario: (u) => q('SELECT * FROM admins WHERE usuario=?').get(u.trim()),
    apagarAdmin: (id) => q('DELETE FROM admins WHERE id=?').run(id).changes,
    novaSessao(adminId) {
      const token = randomBytes(32).toString('hex');
      const expira = Date.now() + 1000 * 60 * 60 * 24 * 30;
      q('INSERT INTO sessoes(token,admin_id,expira) VALUES(?,?,?)').run(hashToken(token), adminId, expira);
      return { token, expira };
    },
    adminDaSessao(token) {
      if (!token) return null;
      q('DELETE FROM sessoes WHERE expira<?').run(Date.now());
      return q('SELECT a.id, a.usuario FROM sessoes s JOIN admins a ON a.id=s.admin_id WHERE s.token=?').get(hashToken(token)) || null;
    },
    fimSessao: (token) => q('DELETE FROM sessoes WHERE token=?').run(hashToken(token)),
  };
  return api;
}
