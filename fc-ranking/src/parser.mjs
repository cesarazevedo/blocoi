// Lê texto colado (do sistema antigo, CSV ou digitado) e devolve partidas.
const pad = (n) => String(n).padStart(2, '0');

export function normData(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
export function normTipo(s) {
  s = (s || '').toLowerCase();
  if (/^c$|compet/.test(s)) return 'C';
  if (/^t$|times|pr[eé]/.test(s)) return 'T';
  return 'A';
}
const SINAL = /[+\-−–]/;
const reData = /^[^\d]*?(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
const rePts = /^([+\-−–]?)\s*(\d+)\s*pts?$/i;
const reTipo = /^(amistoso|competi[cç][aã]o|times\s*pr[eé].*)$/i;
const rePlacar = /^(\d+)\s*[-xX×]\s*(\d+)$/;
const sinalNum = (sg, n) => (/[-−–]/.test(sg) ? -1 : 1) * Number(n);

export function interpretar(texto, { dataPadrao, tipoPadrao = 'A' } = {}) {
  const linhas = texto.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const partidas = [], erros = [];
  let ordem = 'cronologica';

  const velho = linhas.some((l) => rePts.test(l));
  if (velho) {
    // formato copiado do sistema antigo: data / tipo / nome / pts / placar / nome / pts (mais recente primeiro)
    ordem = 'recente-primeiro';
    for (let i = 0; i < linhas.length; i++) {
      const md = linhas[i].match(reData);
      if (!md) continue;
      const [tipo, n1, p1, placar, n2, p2] = linhas.slice(i + 1, i + 7);
      const mp = placar && placar.match(rePlacar);
      const a = p1 && p1.match(rePts);
      if (tipo && reTipo.test(tipo) && mp && a && n1 && n2) {
        partidas.push({ data: normData(md[1]), tipo: normTipo(tipo), p1: n1, g1: +mp[1], g2: +mp[2], p2: n2, pts_antigo: sinalNum(a[1], a[2]) });
        i += 6;
      } else erros.push(`Não entendi perto de: "${linhas[i]}"`);
    }
    return { partidas, erros, ordem };
  }

  for (const l of linhas) {
    if (/^(data|date)\b/i.test(l) && /jogador|player/i.test(l)) continue; // cabeçalho
    const sep = l.includes('|') ? '|' : l.includes(';') ? ';' : l.includes('\t') ? '\t' : null;
    if (sep) {
      const c = l.split(sep).map((s) => s.trim());
      const data = normData(c[0]);
      if (data && c.length >= 6 && /^\d+$/.test(c[3]) && /^\d+$/.test(c[4])) {
        partidas.push({ data, tipo: normTipo(c[1]), p1: c[2], g1: +c[3], g2: +c[4], p2: c[5], pts_antigo: c[6] !== undefined && c[6] !== '' ? Number(c[6]) : null });
        continue;
      }
    }
    // texto livre: [data] [tipo] Nome 2 x 1 Nome
    let resto = l, data = dataPadrao, tipo = tipoPadrao;
    const md = resto.match(/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(.*)$/);
    if (md) { data = normData(md[1]); resto = md[2]; }
    const mt = resto.match(/^(amistoso|competi[cç][aã]o|times pr[eé]-?def\.?)\s*[:\-]?\s+(.*)$/i);
    if (mt) { tipo = normTipo(mt[1]); resto = mt[2]; }
    const m = resto.match(/^(.+?)\s+(\d+)\s*[xX×-]\s*(\d+)\s+(.+)$/);
    if (m && data) partidas.push({ data: normData(data), tipo: normTipo(tipo), p1: m[1].trim(), g1: +m[2], g2: +m[3], p2: m[4].trim(), pts_antigo: null });
    else erros.push(`Não entendi: "${l}"${m && !data ? ' (falta a data)' : ''}`);
  }
  return { partidas, erros, ordem };
}
