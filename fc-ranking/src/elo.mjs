// Cálculo do Elo, estatísticas, recordes e medalhas.
// Tudo é recalculado a partir da lista de partidas (ordem cronológica).

export const TIPOS = { A: 'Amistoso', C: 'Competição', T: 'Times Pré-def.' };
// "K" = quanto vale cada partida. Quanto maior, mais os pontos mexem.
export const K = { A: 40, T: 120, C: 160 };
export const INICIAL = 1000;
export const MIN_JOGOS_MEDALHA = 5;

const esperado = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

export function calcular(partidas, jogadores, { minJogos = 10, hoje = new Date() } = {}) {
  // partidas: [{id,data,tipo,p1,p2,g1,g2,pts_antigo}] já em ordem cronológica
  const nomes = new Map(jogadores.map((j) => [j.id, j.nome]));
  const S = new Map();
  const st = (id) => {
    if (!S.has(id)) {
      S.set(id, {
        id, nome: nomes.get(id), elo: INICIAL, pico: INICIAL, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0,
        seqV: 0, seqI: 0, seqD: 0, melhorV: null, melhorI: null, melhorD: null, forma: [],
        ultimaData: null,
      });
    }
    return S.get(id);
  };
  jogadores.forEach((j) => st(j.id));

  const lista = [];
  const mensal = new Map(); // 'AAAA-MM' -> Map(id -> {delta, j, v})
  const maisGanho = [], maisPerda = [];

  for (const m of partidas) {
    const a = st(m.p1), b = st(m.p2);
    const s1 = m.g1 > m.g2 ? 1 : m.g1 < m.g2 ? 0 : 0.5;
    const d = Math.round(K[m.tipo] * (s1 - esperado(a.elo, b.elo)));
    const item = {
      id: m.id, data: m.data, tipo: m.tipo, p1: m.p1, p2: m.p2, g1: m.g1, g2: m.g2,
      d1: d, d2: -d, r1: Math.round(a.elo), r2: Math.round(b.elo), antigo: m.pts_antigo,
    };
    lista.push(item);

    for (const [x, gp, gc, delta] of [[a, m.g1, m.g2, d], [b, m.g2, m.g1, -d]]) {
      x.elo += delta; x.pico = Math.max(x.pico, x.elo);
      x.j++; x.gp += gp; x.gc += gc; x.ultimaData = m.data;
      const r = gp > gc ? 'V' : gp < gc ? 'D' : 'E';
      if (r === 'V') x.v++; else if (r === 'E') x.e++; else x.d++;
      x.forma.push(r);
      x.seqV = r === 'V' ? x.seqV + 1 : 0;
      x.seqI = r !== 'D' ? x.seqI + 1 : 0;
      x.seqD = r === 'D' ? x.seqD + 1 : 0;
      if (!x.melhorV || x.seqV > x.melhorV.n) x.melhorV = { n: x.seqV, ate: m.data };
      if (!x.melhorI || x.seqI > x.melhorI.n) x.melhorI = { n: x.seqI, ate: m.data };
      if (!x.melhorD || x.seqD > x.melhorD.n) x.melhorD = { n: x.seqD, ate: m.data };
      const mes = m.data.slice(0, 7);
      if (!mensal.has(mes)) mensal.set(mes, new Map());
      const mm = mensal.get(mes);
      if (!mm.has(x.id)) mm.set(x.id, { id: x.id, delta: 0, j: 0, v: 0 });
      const z = mm.get(x.id); z.delta += delta; z.j++; if (r === 'V') z.v++;
    }
    maisGanho.push({ data: m.data, id: d >= 0 ? m.p1 : m.p2, adv: d >= 0 ? m.p2 : m.p1, pts: Math.abs(d), placar: `${m.g1} x ${m.g2}` });
  }

  const jogs = [...S.values()].map((x) => ({
    ...x, elo: Math.round(x.elo), pico: Math.round(x.pico), forma: x.forma.slice(-5),
    aprov: x.j ? Math.round(((x.v * 3 + x.e) / (x.j * 3)) * 100) : 0, sg: x.gp - x.gc,
    noRanking: x.j >= minJogos,
  }));
  const ranking = jogs.filter((x) => x.noRanking).sort((x, y) => y.elo - x.elo || y.aprov - x.aprov);
  ranking.forEach((x, i) => (x.pos = i + 1));
  const emAvaliacao = jogs.filter((x) => !x.noRanking && x.j > 0).sort((x, y) => y.j - x.j);

  // ---- Medalhas: top 3 de cada mês já encerrado (mín. de jogos no mês) ----
  const mesAtual = hoje.toISOString().slice(0, 7);
  const meses = [];
  const medalhas = new Map();
  for (const [mes, mm] of [...mensal.entries()].sort()) {
    if (mes >= mesAtual) continue;
    const top = [...mm.values()].filter((z) => z.j >= MIN_JOGOS_MEDALHA)
      .sort((x, y) => y.delta - x.delta || y.v - x.v).slice(0, 3);
    if (!top.length) continue;
    meses.push({ mes, podio: top.map((z) => ({ id: z.id, delta: Math.round(z.delta), j: z.j })) });
    top.forEach((z, i) => {
      if (!medalhas.has(z.id)) medalhas.set(z.id, { id: z.id, ouro: 0, prata: 0, bronze: 0 });
      medalhas.get(z.id)[['ouro', 'prata', 'bronze'][i]]++;
    });
  }
  const quadro = [...medalhas.values()].sort((x, y) => y.ouro - x.ouro || y.prata - x.prata || y.bronze - x.bronze);

  // ---- Recordes ----
  const top = (arr, n = 5) => arr.slice(0, n);
  const jogosOrd = (f) => [...lista].sort((x, y) => f(y) - f(x));
  const reg = (m) => ({ data: m.data, p1: m.p1, p2: m.p2, g1: m.g1, g2: m.g2 });
  const pares = new Map();
  for (const m of lista) {
    const k = [m.p1, m.p2].sort((x, y) => x - y).join('-');
    if (!pares.has(k)) pares.set(k, { a: Math.min(m.p1, m.p2), b: Math.max(m.p1, m.p2), n: 0 });
    pares.get(k).n++;
  }
  const comJogos = jogs.filter((x) => x.j > 0);
  const recordes = {
    goleadas: top(jogosOrd((m) => Math.abs(m.g1 - m.g2)).map(reg)),
    maisGols: top(jogosOrd((m) => m.g1 + m.g2).map(reg)),
    seqVitorias: top(comJogos.filter((x) => x.melhorV?.n).sort((x, y) => y.melhorV.n - x.melhorV.n).map((x) => ({ id: x.id, n: x.melhorV.n, ate: x.melhorV.ate, atual: x.seqV }))),
    seqInvicto: top(comJogos.filter((x) => x.melhorI?.n).sort((x, y) => y.melhorI.n - x.melhorI.n).map((x) => ({ id: x.id, n: x.melhorI.n, ate: x.melhorI.ate, atual: x.seqI }))),
    seqDerrotas: top(comJogos.filter((x) => x.melhorD?.n).sort((x, y) => y.melhorD.n - x.melhorD.n).map((x) => ({ id: x.id, n: x.melhorD.n, ate: x.melhorD.ate, atual: x.seqD }))),
    maiorGanho: top(maisGanho.sort((x, y) => y.pts - x.pts)),
    picos: top(comJogos.sort((x, y) => y.pico - x.pico).map((x) => ({ id: x.id, pico: x.pico }))),
    maisJogos: top([...comJogos].sort((x, y) => y.j - x.j).map((x) => ({ id: x.id, j: x.j }))),
    melhorAproveitamento: top(comJogos.filter((x) => x.noRanking).sort((x, y) => y.aprov - x.aprov).map((x) => ({ id: x.id, aprov: x.aprov, j: x.j }))),
    rivalidades: top([...pares.values()].sort((x, y) => y.n - x.n)),
  };

  return { partidas: lista, jogadores: jogs, ranking, emAvaliacao, quadro, meses, recordes, minJogos };
}
