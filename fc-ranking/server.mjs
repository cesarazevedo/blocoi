import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, bancoDe, confereSenha } from './src/db.mjs';
import { calcular, TIPOS } from './src/elo.mjs';
import { interpretar, normData, normTipo } from './src/parser.mjs';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT || 3000);
const db = bancoDe(abrirBanco(process.env.DB_PATH || path.join(raiz, 'data', 'fc.db')));

// ---------- Carga inicial: importa data/partidas.txt na primeira vez ----------
function semear() {
  const arq = path.join(raiz, 'data', 'partidas.txt');
  if (db.partidasCronologicas().length || !fs.existsSync(arq)) return;
  const { partidas } = interpretar(fs.readFileSync(arq, 'utf8'));
  db.transacao(() => {
    let seq = 1;
    for (const p of [...partidas].reverse()) db.inserir(p, seq++);
  });
  console.log(`Importadas ${partidas.length} partidas iniciais.`);
}
semear();

// ---------- Cálculo (guardado em memória até alguém mudar algo) ----------
let cache = null;
const limparCache = () => { cache = null; };
const minJogos = () => Number(db.config('minJogos', 10));
function dados() {
  if (!cache) {
    const r = calcular(db.partidasCronologicas(), db.jogadores(), { minJogos: minJogos() });
    r.partidas.reverse(); // mais recentes primeiro
    r.nomes = Object.fromEntries(db.jogadores().map((j) => [j.id, j.nome]));
    r.tipos = TIPOS;
    cache = JSON.stringify(r);
  }
  return cache;
}

// ---------- Utilidades HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const enviar = (res, status, corpo, tipo = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo));
};
const erro = (res, status, msg) => enviar(res, status, { erro: msg });
const lerCorpo = (req, limite = 12e6) => new Promise((ok, no) => {
  const partes = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limite) { no(new Error('Corpo grande demais')); req.destroy(); } else partes.push(c); });
  req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch { no(new Error('JSON inválido')); } });
  req.on('error', no);
});
const cookie = (req, nome) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === nome)?.[1];
const tentativas = new Map();
const limitar = (ip) => {
  const agora = Date.now(); const l = (tentativas.get(ip) || []).filter((t) => agora - t < 600000);
  tentativas.set(ip, l); return l.length >= 10;
};

function validar(p) {
  const data = normData(p.data);
  const tipo = ['A', 'C', 'T'].includes(p.tipo) ? p.tipo : normTipo(p.tipo);
  const p1 = String(p.p1 || '').trim(), p2 = String(p.p2 || '').trim();
  const g1 = Number(p.g1), g2 = Number(p.g2);
  if (!data) throw new Error('Data inválida');
  if (!p1 || !p2) throw new Error('Informe os dois jogadores');
  if (p1.toLowerCase() === p2.toLowerCase()) throw new Error('Os jogadores precisam ser diferentes');
  if (![g1, g2].every((n) => Number.isInteger(n) && n >= 0 && n < 100)) throw new Error('Placar inválido');
  return { data, tipo, p1, p2, g1, g2 };
}

async function lerImagem({ imagem, tipoMidia }) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error('Leitura de print não está ligada. Defina ANTHROPIC_API_KEY no servidor.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 8000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: tipoMidia || 'image/png', data: imagem } },
        { type: 'text', text: 'Esta imagem mostra uma lista de partidas de futebol (FC). Responda SOMENTE com um array JSON, na mesma ordem da imagem, de objetos {"data":"AAAA-MM-DD","tipo":"Amistoso|Competição|Times Pré-def.","p1":"nome","g1":0,"g2":0,"p2":"nome","pts":null ou número de pontos do jogador 1}. Sem explicações.' },
      ] }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Falha ao ler a imagem');
  const txt = j.content?.map((c) => c.text || '').join('') || '';
  const m = txt.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('Não consegui ler partidas na imagem');
  return JSON.parse(m[0]).map((x) => ({ data: normData(x.data), tipo: normTipo(x.tipo), p1: x.p1, g1: +x.g1, g2: +x.g2, p2: x.p2, pts_antigo: x.pts ?? null }));
}

// ---------- Rotas ----------
async function rota(req, res, url) {
  const { pathname: p } = url, m = req.method;
  const admin = db.adminDaSessao(cookie(req, 'fc_sess'));
  const exigeAdmin = () => { if (!admin) { erro(res, 401, 'Faça login como administrador'); return false; } return true; };
  const mutacao = m !== 'GET' && m !== 'HEAD';
  if (mutacao && !(req.headers['content-type'] || '').includes('application/json')) return erro(res, 415, 'Use JSON');

  if (p === '/api/dados' && m === 'GET') return enviar(res, 200, dados());
  if (p === '/api/me' && m === 'GET') return enviar(res, 200, { admin, precisaCriarAdmin: db.totalAdmins() === 0, minJogos: minJogos(), leituraPrint: !!process.env.ANTHROPIC_API_KEY });
  if (p === '/api/export.csv' && m === 'GET') {
    const d = JSON.parse(dados()); const rev = [...d.partidas].reverse();
    const linhas = ['data;tipo;jogador1;gols1;gols2;jogador2;pts_antigo_j1;elo_j1', ...rev.map((x) => [x.data, TIPOS[x.tipo], d.nomes[x.p1], x.g1, x.g2, d.nomes[x.p2], x.antigo ?? '', x.d1].join(';'))];
    return enviar(res, 200, '﻿' + linhas.join('\n'), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="partidas.csv"' });
  }

  if (p === '/api/setup' && m === 'POST') {
    if (db.totalAdmins() > 0) return erro(res, 403, 'Já existe administrador');
    const b = await lerCorpo(req);
    if (!b.usuario?.trim() || (b.senha || '').length < 8) return erro(res, 400, 'Informe usuário e senha (mínimo 8 caracteres)');
    const id = db.criarAdmin(b.usuario, b.senha); return abrirSessao(res, id);
  }
  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || '';
    if (limitar(ip)) return erro(res, 429, 'Muitas tentativas. Espere alguns minutos.');
    const b = await lerCorpo(req);
    const a = db.adminPorUsuario(String(b.usuario || ''));
    if (!a || !confereSenha(String(b.senha || ''), a.hash)) { tentativas.get(ip).push(Date.now()); return erro(res, 401, 'Usuário ou senha incorretos'); }
    return abrirSessao(res, a.id);
  }
  if (p === '/api/logout' && m === 'POST') {
    db.fimSessao(cookie(req, 'fc_sess') || '');
    return enviar(res, 200, { ok: true }, undefined, { 'set-cookie': 'fc_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
  }

  if (!p.startsWith('/api/admin/')) return erro(res, 404, 'Não encontrado');
  if (!exigeAdmin()) return;
  const b = mutacao ? await lerCorpo(req) : {};

  if (p === '/api/admin/partidas' && m === 'POST') {
    const v = validar(b); const id = db.inserir(v); limparCache(); return enviar(res, 201, { id });
  }
  let mm;
  if ((mm = p.match(/^\/api\/admin\/partidas\/(\d+)$/))) {
    if (m === 'PUT') { const v = validar(b); if (!db.atualizar(+mm[1], v)) return erro(res, 404, 'Partida não existe'); db.apagarJogadoresSemJogos(); limparCache(); return enviar(res, 200, { ok: true }); }
    if (m === 'DELETE') { db.apagar(+mm[1]); db.apagarJogadoresSemJogos(); limparCache(); return enviar(res, 200, { ok: true }); }
  }
  if (p === '/api/admin/importar' && m === 'POST') {
    let lista, erros = [], ordem = 'cronologica';
    if (Array.isArray(b.partidas)) lista = b.partidas;
    else if (b.imagem) { lista = await lerImagem(b); ordem = 'recente-primeiro'; }
    else {
      const r = interpretar(String(b.texto || ''), { dataPadrao: b.dataPadrao, tipoPadrao: b.tipoPadrao });
      lista = r.partidas; erros = r.erros; ordem = r.ordem;
    }
    if (b.ordem) ordem = b.ordem;
    const validas = [];
    lista.forEach((x, i) => { try { validas.push({ ...validar(x), pts_antigo: x.pts_antigo ?? null }); } catch (e) { erros.push(`Linha ${i + 1}: ${e.message}`); } });
    const nomes = new Set(db.jogadores().map((j) => j.nome.toLowerCase()));
    const novos = [...new Set(validas.flatMap((x) => [x.p1, x.p2]).filter((n) => !nomes.has(n.toLowerCase())))];
    if (!b.confirmar) return enviar(res, 200, { previa: true, partidas: validas, erros, novosJogadores: novos, ordem });
    if (erros.length && !b.ignorarErros) return erro(res, 400, 'Há linhas com erro. Corrija ou escolha ignorar.');
    const ordenadas = ordem === 'recente-primeiro' ? [...validas].reverse() : validas;
    db.transacao(() => { let seq = db.proximaSeq(); for (const x of ordenadas) db.inserir(x, seq++); });
    limparCache(); return enviar(res, 201, { importadas: validas.length });
  }
  if (p === '/api/admin/config' && m === 'PUT') {
    const n = Number(b.minJogos); if (!Number.isInteger(n) || n < 1 || n > 500) return erro(res, 400, 'Número inválido');
    db.setConfig('minJogos', n); limparCache(); return enviar(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/jogadores\/(\d+)$/)) && m === 'PUT') {
    const nome = String(b.nome || '').trim(); if (!nome) return erro(res, 400, 'Nome vazio');
    try { db.renomear(+mm[1], nome); } catch { return erro(res, 409, 'Já existe jogador com esse nome'); }
    limparCache(); return enviar(res, 200, { ok: true });
  }
  if (p === '/api/admin/admins' && m === 'GET') return enviar(res, 200, db.admins());
  if (p === '/api/admin/admins' && m === 'POST') {
    if (!b.usuario?.trim() || (b.senha || '').length < 8) return erro(res, 400, 'Informe usuário e senha (mínimo 8 caracteres)');
    try { db.criarAdmin(b.usuario, b.senha); } catch { return erro(res, 409, 'Esse usuário já existe'); }
    return enviar(res, 201, { ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/admins\/(\d+)$/)) && m === 'DELETE') {
    if (+mm[1] === admin.id) return erro(res, 400, 'Você não pode remover a si mesmo');
    db.apagarAdmin(+mm[1]); return enviar(res, 200, { ok: true });
  }
  return erro(res, 404, 'Não encontrado');
}

function abrirSessao(res, adminId) {
  const { token } = db.novaSessao(adminId);
  const seguro = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return enviar(res, 200, { ok: true }, undefined, { 'set-cookie': `fc_sess=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax${seguro}` });
}

function estatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const pub = path.join(raiz, 'public'); const arq = path.normalize(path.join(pub, rel));
  if (!arq.startsWith(pub + path.sep) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return erro(res, 404, 'Não encontrado');
  enviar(res, 200, fs.readFileSync(arq), MIME[path.extname(arq)] || 'application/octet-stream', { 'cache-control': 'no-cache' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try { url.pathname.startsWith('/api/') ? await rota(req, res, url) : estatico(req, res, url); }
  catch (e) { console.error(e); if (!res.headersSent) erro(res, 400, e.message || 'Erro'); }
}).listen(PORTA, () => console.log(`FC Ranking em http://localhost:${PORTA}`));
