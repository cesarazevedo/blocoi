// ── Análises (big data) ───────────────────────────────────────
// Aba "Análises": cruza TODOS os anos da planilha pra achar padrões.
//
// REGRA DE OURO: tudo aqui é AGREGADO e ANÔNIMO.
// Nenhum número ou nome de unidade aparece em nenhum lugar desta aba
// (só percentuais do condomínio inteiro e categorias de despesa).
// Isso é proposital, pra não expor nem apontar ninguém.

let anToken = 0;

// Junta as receitas de todos os anos disponíveis: { 2024: [...], 2025: [...], ... }
async function anCarregarReceitas(forcar) {
  const anos = [...document.getElementById('sel-ano').options].map(o => parseInt(o.value));
  const out = {};
  await Promise.all(anos.map(async y => {
    if (y === anoSel) { out[y] = dadosReceitas; return; }
    if (dadosAnosAnteriores[y]) { out[y] = dadosAnosAnteriores[y]; return; }
    try {
      if (forcar) localStorage.removeItem(cacheKey(`Receitas ${y}`));
      out[y] = parseReceitas(await fetchSheetCached(`Receitas ${y}`));
    } catch (e) { /* ano sem dados: ignora */ }
  }));
  return out;
}

// % de pagamentos em dia de um mês (null = ainda não venceu / sem dados)
function anPctMes(unidades, mes, ano) {
  if (!unidades || !unidades.some(r => r.valores.some(v => v > 0))) return null; // ano sem lançamentos
  if (!mesVencido(mes, ano)) return null;
  const base = unidades.filter(r => !(r.isentos && r.isentos[mes]));
  if (!base.length) return null;
  return base.filter(r => r.valores[mes] > 0).length / base.length * 100;
}

const anMedia = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const anPct = v => Math.round(v) + '%';

function anDespesas(ano, ateMes = 11) {
  return dadosDespesas.filter(d =>
    d.dataParts && d.dataParts.length >= 3 &&
    parseInt(d.dataParts[2]) === ano && parseInt(d.dataParts[1]) - 1 <= ateMes);
}

function anPorCategoria(lista) {
  const m = {};
  lista.forEach(d => {
    const c = (d.categoria || '').trim() || 'Outros';
    m[c] = (m[c] || 0) + d.valor;
  });
  return m;
}

// ── Mapa de calor: meses × anos ───────────────────────────────
function anRenderHeatmap(anosData) {
  const anos = Object.keys(anosData).map(Number).sort((a, b) => b - a);
  const grade = {}; // grade[ano][mes] = pct|null
  anos.forEach(y => { grade[y] = MESES.map((_, m) => anPctMes(anosData[y], m, y)); });

  const cor = p => `hsl(${Math.round(p * 1.2)}, 58%, 36%)`; // 0% vermelho → 100% verde

  const cel = (p, y, m) => p === null
    ? `<td class="hm-cell hm-empty" title="${MESES_FULL[m]}/${y}: ainda sem dados">–</td>`
    : `<td class="hm-cell" style="background:${cor(p)}" title="${MESES_FULL[m]}/${y}: ${anPct(p)} dos pagamentos em dia">${anPct(p)}</td>`;

  const linhas = anos.map(y => {
    const m = anMedia(grade[y].filter(p => p !== null));
    return `<tr><th scope="row">${y}</th>${grade[y].map((p, i) => cel(p, y, i)).join('')}
      <td class="hm-cell hm-media">${m === null ? '–' : anPct(m)}</td></tr>`;
  });

  const medias = MESES.map((_, m) => anMedia(anos.map(y => grade[y][m]).filter(p => p !== null)));
  const mediaGeral = anMedia(medias.filter(p => p !== null));
  linhas.push(`<tr class="hm-total"><th scope="row">Média</th>${
    medias.map(p => p === null
      ? '<td class="hm-cell hm-empty">–</td>'
      : `<td class="hm-cell hm-media">${anPct(p)}</td>`).join('')
  }<td class="hm-cell hm-media">${mediaGeral === null ? '–' : anPct(mediaGeral)}</td></tr>`);

  document.getElementById('an-heatmap').innerHTML =
    `<table class="hm-table"><thead><tr><th></th>${MESES.map(m => `<th>${m}</th>`).join('')}<th>Ano</th></tr></thead>
     <tbody>${linhas.join('')}</tbody></table>`;

  return grade;
}

// ── Insights automáticos (sempre sobre o condomínio inteiro) ──
function anGerarInsights(anosData, grade) {
  const out = [];
  const add = (tone, ico, html) => out.push({ tone, ico, html });
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const fimMes = hoje.getMonth() - 1; // último mês "fechado" do ano corrente

  // Linha do tempo de adimplência (só meses que já venceram e têm dados)
  const serie = [];
  Object.keys(grade).map(Number).sort((a, b) => a - b).forEach(y =>
    grade[y].forEach((p, m) => { if (p !== null) serie.push({ y, m, p }); }));

  if (serie.length) {
    const ult = serie[serie.length - 1];
    const antes = serie.slice(0, -1).map(s => s.p);
    const mediaHist = anMedia(antes);
    if (mediaHist !== null) {
      const dif = ult.p - mediaHist;
      const tom = dif >= 3 ? 'good' : dif <= -3 ? 'warn' : 'info';
      const cmp = dif >= 3 ? 'acima da' : dif <= -3 ? 'abaixo da' : 'em linha com a';
      add(tom, dif >= 3 ? '📈' : dif <= -3 ? '📉' : '➖',
        `Em <strong>${MESES_FULL[ult.m]}/${ult.y}</strong>, <strong>${anPct(ult.p)}</strong> dos pagamentos esperados foram feitos — ${cmp} média histórica (${anPct(mediaHist)}).`);
    }
  }

  if (serie.length >= 6) {
    const rec = anMedia(serie.slice(-3).map(s => s.p));
    const ant = anMedia(serie.slice(-6, -3).map(s => s.p));
    const dif = rec - ant;
    if (Math.abs(dif) >= 3) {
      add(dif > 0 ? 'good' : 'warn', dif > 0 ? '🌱' : '⚠️',
        `Nos <strong>últimos 3 meses</strong> a adimplência média foi <strong>${anPct(rec)}</strong>, ${dif > 0 ? 'melhor' : 'pior'} que nos 3 meses anteriores (${anPct(ant)}).`);
    }
  }

  // Sequência de meses 100% em dia
  let seq = 0;
  for (let i = serie.length - 1; i >= 0 && serie[i].p >= 99.99; i--) seq++;
  if (seq >= 3) add('good', '🎉', `<strong>${seq} meses seguidos</strong> com 100% dos pagamentos em dia. Parabéns, moradores!`);

  // Sazonalidade: qual mês costuma ser o mais difícil
  const porMes = MESES.map((_, m) => {
    const v = Object.keys(grade).map(y => grade[y][m]).filter(p => p !== null);
    return { m, n: v.length, media: anMedia(v) };
  }).filter(x => x.n >= 2);
  if (porMes.length >= 4) {
    const pior = porMes.reduce((a, b) => (b.media < a.media ? b : a));
    const melhor = porMes.reduce((a, b) => (b.media > a.media ? b : a));
    if (melhor.media - pior.media >= 5) {
      add('info', '🗓️',
        `Olhando todos os anos, <strong>${MESES_FULL[pior.m]}</strong> costuma ser o mês com mais atrasos (média ${anPct(pior.media)}) e <strong>${MESES_FULL[melhor.m]}</strong> o mais tranquilo (${anPct(melhor.media)}). Vale um lembrete antes de ${MESES_FULL[pior.m]}.`);
    }
  }

  // Despesas: ano corrente vs mesmo período do ano passado (só meses fechados)
  if (fimMes >= 0) {
    const cur = anDespesas(anoAtual, fimMes), prev = anDespesas(anoAtual - 1, fimMes);
    const tCur = cur.reduce((s, d) => s + d.valor, 0), tPrev = prev.reduce((s, d) => s + d.valor, 0);
    const periodo = fimMes === 0 ? MESES_FULL[0] : `${MESES[0]} a ${MESES[fimMes]}`;
    if (tCur > 0 && tPrev > 0) {
      const dif = (tCur - tPrev) / tPrev * 100;
      const tom = dif <= -3 ? 'good' : dif >= 10 ? 'warn' : 'info';
      const cmp = Math.abs(dif) < 3 ? 'praticamente o mesmo valor que' : `${Math.abs(dif).toFixed(0)}% ${dif < 0 ? 'a menos' : 'a mais'} que`;
      add(tom, dif <= -3 ? '💚' : dif >= 10 ? '💸' : '⚖️',
        `De <strong>${periodo}/${anoAtual}</strong> o condomínio gastou <strong>${moeda(tCur)}</strong>, ${cmp} no mesmo período de ${anoAtual - 1} (${moeda(tPrev)}).`);

      // Categorias que mais mudaram
      const cC = anPorCategoria(cur), cP = anPorCategoria(prev);
      const variacoes = Object.keys(cC).filter(c => cP[c] > 0)
        .map(c => ({ c, dif: cC[c] - cP[c], pct: (cC[c] - cP[c]) / cP[c] * 100 }));
      const sobe = variacoes.filter(v => v.dif > 0 && v.pct >= 10).sort((a, b) => b.dif - a.dif)[0];
      const cai = variacoes.filter(v => v.dif < 0 && v.pct <= -10).sort((a, b) => a.dif - b.dif)[0];
      if (sobe) add('warn', '🔺', `A categoria que mais subiu foi <strong>${escHtml(sobe.c)}</strong>: +${sobe.pct.toFixed(0)}% (${moeda(sobe.dif)} a mais) em relação ao mesmo período de ${anoAtual - 1}.`);
      if (cai) add('good', '🔻', `A categoria que mais caiu foi <strong>${escHtml(cai.c)}</strong>: ${cai.pct.toFixed(0)}% (${moeda(-cai.dif)} a menos) em relação ao mesmo período de ${anoAtual - 1}.`);
    }

    // Cobertura: quanto entrou pra cada R$ 1 que saiu
    const rec = (anosData[anoAtual] || []).reduce((s, r) => s + r.valores.slice(0, fimMes + 1).reduce((a, v) => a + (v > 0 ? v : 0), 0), 0);
    if (rec > 0 && tCur > 0) {
      const razao = rec / tCur;
      add(razao >= 1 ? 'good' : 'warn', razao >= 1 ? '🪙' : '🕳️',
        `Para cada <strong>R$ 1,00</strong> gasto em ${periodo}/${anoAtual}, entraram <strong>${moeda(razao)}</strong> de cotas. ${razao >= 1 ? 'As cotas cobrem as despesas.' : 'As cotas sozinhas não cobriram as despesas do período.'}`);
    }
  }

  // Despesas do ano corrente (até agora): maior fatia e mês mais caro
  const ano = anDespesas(anoAtual);
  const totalAno = ano.reduce((s, d) => s + d.valor, 0);
  if (totalAno > 0) {
    const cats = Object.entries(anPorCategoria(ano)).sort((a, b) => b[1] - a[1]);
    add('info', '🥧', `Em ${anoAtual}, a maior fatia dos gastos é <strong>${escHtml(cats[0][0])}</strong>: ${moeda(cats[0][1])} (<strong>${(cats[0][1] / totalAno * 100).toFixed(0)}%</strong> do total).`);

    const porMesDesp = MESES.map((_, m) => ano.filter(d => parseInt(d.dataParts[1]) - 1 === m));
    const totais = porMesDesp.map(l => l.reduce((s, d) => s + d.valor, 0));
    const mesesComGasto = totais.filter(t => t > 0).length;
    if (mesesComGasto >= 3) {
      const mx = totais.indexOf(Math.max(...totais));
      const topCat = Object.entries(anPorCategoria(porMesDesp[mx])).sort((a, b) => b[1] - a[1])[0];
      add('info', '🏷️', `O mês mais pesado de ${anoAtual} foi <strong>${MESES_FULL[mx]}</strong> (${moeda(totais[mx])}), principalmente por <strong>${escHtml(topCat[0])}</strong>.`);
    }
  }

  return out;
}

function anRenderInsights(lista) {
  const el = document.getElementById('an-insights');
  if (!lista.length) {
    el.innerHTML = '<div class="insight insight-info"><span class="insight-ico">🔍</span><p>Ainda não há dados suficientes para gerar insights. Eles aparecem conforme a planilha vai sendo preenchida.</p></div>';
    return;
  }
  el.innerHTML = lista.map(i =>
    `<div class="insight insight-${i.tone}"><span class="insight-ico" aria-hidden="true">${i.ico}</span><p>${i.html}</p></div>`).join('');
}

async function renderAnalises(forcar = false) {
  if (!document.getElementById('an-heatmap')) return;
  const token = ++anToken;
  const anosData = await anCarregarReceitas(forcar);
  if (token !== anToken) return; // chegou uma chamada mais nova, descarta esta
  const grade = anRenderHeatmap(anosData);
  anRenderInsights(anGerarInsights(anosData, grade));
  anRenderForaDoNormal();
  anRenderCategorias();
  renderResumoCompartilhar();
}

// ══════════════════════════════════════════════════════════════
// Despesas por categoria: evolução, gastos fora do normal, cartão
// (sempre só categorias e totais; nunca descrição nem fornecedor)
// ══════════════════════════════════════════════════════════════
const AN_CORES = ['#667eea', '#11998e', '#f7971e', '#ff758c', '#4facfe', '#a0aec0'];
const anYM = (y, m) => y * 12 + m;
const anNum1 = v => v.toFixed(1).replace('.', ',');

// { porCat: { categoria: { ym: total } }, totalMes: { ym: total }, primeiro: ym mais antigo }
function anAgregar() {
  const porCat = {}, totalMes = {};
  let primeiro = Infinity;
  dadosDespesas.forEach(d => {
    if (!d.dataParts || d.dataParts.length < 3) return;
    const y = parseInt(d.dataParts[2]), m = parseInt(d.dataParts[1]) - 1;
    if (isNaN(y) || isNaN(m)) return;
    const k = anYM(y, m), c = (d.categoria || '').trim() || 'Outros';
    (porCat[c] = porCat[c] || {})[k] = (porCat[c][k] || 0) + d.valor;
    totalMes[k] = (totalMes[k] || 0) + d.valor;
    if (k < primeiro) primeiro = k;
  });
  return { porCat, totalMes, primeiro };
}

// Últimos 12 meses, terminando no mês atual
function anJanela12() {
  const h = new Date(), out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(h.getFullYear(), h.getMonth() - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth(), k: anYM(d.getFullYear(), d.getMonth()) });
  }
  return out;
}

// ── 2) Evolução dos gastos por categoria ──────────────────────
let anCatChart = null;
function anRenderCategorias() {
  const cv = document.getElementById('an-chart-cat');
  const vazio = document.getElementById('an-cat-vazio');
  if (!cv || typeof Chart === 'undefined') return;
  if (anCatChart) { anCatChart.destroy(); anCatChart = null; }

  const jan = anJanela12();
  const { porCat } = anAgregar();
  const soma = c => jan.reduce((s, j) => s + (porCat[c][j.k] || 0), 0);
  const cats = Object.keys(porCat).filter(c => soma(c) > 0).sort((a, b) => soma(b) - soma(a));
  cv.parentElement.style.display = cats.length ? '' : 'none';
  vazio.style.display = cats.length ? 'none' : '';
  if (!cats.length) return;

  const series = cats.slice(0, 5).map(c => ({ nome: c, vals: jan.map(j => porCat[c][j.k] || 0) }));
  const resto = cats.slice(5);
  if (resto.length) series.push({ nome: 'Outras', vals: jan.map(j => resto.reduce((s, c) => s + (porCat[c][j.k] || 0), 0)) });

  anCatChart = new Chart(cv, {
    type: 'line',
    data: {
      labels: jan.map(j => `${MESES[j.m]}/${String(j.y).slice(2)}`),
      datasets: series.map((s, i) => ({
        label: s.nome, data: s.vals, borderColor: AN_CORES[i], backgroundColor: AN_CORES[i],
        borderWidth: 2.5, pointRadius: 3, tension: 0,
        segment: { borderDash: c => (c.p1DataIndex === 11 ? [5, 5] : undefined) } // mês em andamento
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: tColor(), font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${moeda(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: tColor(), font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: tColor(), font: { size: 10 }, callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: gColor() } }
      }
    }
  });
}

// ── 3) Gastos fora do normal ──────────────────────────────────
// Regra: um gasto chama atenção quando é pelo menos 1,5× a média dos meses
// anteriores da própria categoria (até 12 meses, mínimo 4) E a diferença é
// relevante (≥ 10% do gasto mensal médio do condomínio). Evita alarme à toa.
function anForaDoNormal() {
  const { porCat, totalMes, primeiro } = anAgregar();
  const itens = [];
  let historicoCurto = true;

  anJanela12().forEach(j => {
    const ini = Math.max(primeiro, j.k - 12);
    const n = j.k - ini;
    if (!isFinite(primeiro) || n < 4) return;
    historicoCurto = false;
    let somaTot = 0;
    for (let k = ini; k < j.k; k++) somaTot += totalMes[k] || 0;
    const mediaTot = somaTot / n;
    if (mediaTot <= 0) return;

    Object.keys(porCat).forEach(c => {
      const v = porCat[c][j.k] || 0;
      if (v <= 0) return;
      let s = 0;
      for (let k = ini; k < j.k; k++) s += porCat[c][k] || 0;
      const base = s / n;
      if (base > 0 && v >= base * 1.5 && v - base >= mediaTot * 0.1)
        itens.push({ tipo: 'cat', y: j.y, m: j.m, c, v, base, ratio: v / base });
    });

    const vt = totalMes[j.k] || 0;
    if (vt >= mediaTot * 1.4 && vt - mediaTot >= mediaTot * 0.1)
      itens.push({ tipo: 'mes', y: j.y, m: j.m, v: vt, base: mediaTot, ratio: vt / mediaTot });
  });

  itens.sort((a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m) || b.ratio - a.ratio);
  return { itens: itens.slice(0, 8), historicoCurto };
}

function anRenderForaDoNormal() {
  const el = document.getElementById('an-anomalias');
  if (!el) return;
  const { itens, historicoCurto } = anForaDoNormal();
  const agora = new Date();
  const emAndamento = i => i.y === agora.getFullYear() && i.m === agora.getMonth() ? ' <em>(mês em andamento)</em>' : '';

  if (historicoCurto) {
    el.innerHTML = '<div class="insight insight-info"><span class="insight-ico">🔍</span><p>Ainda há poucos meses de histórico para comparar. Esta análise começa a funcionar a partir do 5º mês de despesas lançadas.</p></div>';
  } else if (!itens.length) {
    el.innerHTML = '<div class="insight insight-good"><span class="insight-ico">✅</span><p>Nenhum gasto fora do padrão nos últimos 12 meses. Tudo dentro do esperado.</p></div>';
  } else {
    el.innerHTML = itens.map(i => i.tipo === 'cat'
      ? `<div class="insight insight-warn"><span class="insight-ico" aria-hidden="true">🚨</span><p><strong>${escHtml(i.c)}</strong> em <strong>${MESES_FULL[i.m]}/${i.y}</strong>: ${moeda(i.v)}, cerca de <strong>${anNum1(i.ratio)}×</strong> a média dos meses anteriores (${moeda(i.base)})${emAndamento(i)}.</p></div>`
      : `<div class="insight insight-warn"><span class="insight-ico" aria-hidden="true">📊</span><p><strong>${MESES_FULL[i.m]}/${i.y}</strong> como um todo: ${moeda(i.v)} em gastos, cerca de <strong>${anNum1(i.ratio)}×</strong> a média mensal (${moeda(i.base)})${emAndamento(i)}.</p></div>`
    ).join('');
  }
}

// ── 6) Cartão "Resumo do mês" para compartilhar ───────────────
function anRR(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function anTexto(ctx, txt, x, y, { size = 32, peso = 400, cor = '#1a202c', alinh = 'left', maxW } = {}) {
  let s = size;
  const fam = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.font = `${peso} ${s}px ${fam}`;
  if (maxW) while (ctx.measureText(txt).width > maxW && s > 14) { s -= 1; ctx.font = `${peso} ${s}px ${fam}`; }
  ctx.fillStyle = cor; ctx.textAlign = alinh; ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, x, y);
}

// Mesmos cálculos do Resumo das Finanças, para os números baterem
// (usado pela imagem e pelo texto, que nunca divergem entre si)
function anDadosResumo() {
  const recMes = dadosReceitas.reduce((s, r) => s + r.valores[mesSel], 0);
  const pagas = dadosReceitas.filter(r => r.valores[mesSel] > 0).length;
  const total = dadosReceitas.length;
  const despMes = despMesAtual(dadosDespesas, mesSel, anoSel);
  const totalDesp = despMes.reduce((s, d) => s + d.valor, 0);
  const venceu = mesVencido(mesSel, anoSel);
  const isentos = dadosReceitas.filter(r => r.isentos && r.isentos[mesSel]).length;
  const inadPct = total > 0 && venceu ? (total - pagas - isentos) / total * 100 : null;
  const recAcum = dadosReceitas.reduce((s, r) => s + r.valores.slice(0, mesSel + 1).reduce((a, b) => a + b, 0), 0);
  const despAcum = dadosDespesas
    .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 <= mesSel)
    .reduce((s, d) => s + d.valor, 0);
  const cats = {};
  despMes.forEach(d => { const c = (d.categoria || '').trim() || 'Outros'; cats[c] = (cats[c] || 0) + d.valor; });
  return {
    recMes, totalDesp, saldoMes: recMes - totalDesp,
    adPct: inadPct === null ? null : 100 - inadPct,
    caixa: recAcum - despAcum + saldoAnterior,
    mesLabel: `${MESES_FULL[mesSel]}/${anoSel}`,
    top: Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3)
  };
}

function renderResumoCompartilhar() {
  const cv = document.getElementById('an-resumo-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, P = 60;
  const verde = '#11998e', verm = '#e53e5c', cinza = '#4a5568';
  const { recMes, totalDesp, saldoMes, adPct, caixa, mesLabel, top } = anDadosResumo();

  anRenderResumoTexto();

  // fundo
  ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H);

  // cabeçalho
  const g = ctx.createLinearGradient(0, 0, W, 260);
  g.addColorStop(0, '#667eea'); g.addColorStop(1, '#764ba2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
  anTexto(ctx, 'CONTROLE CONDOMINIAL', P, 90, { size: 28, peso: 700, cor: 'rgba(255,255,255,.8)' });
  anTexto(ctx, `Resumo de ${mesLabel}`, P, 170, { size: 66, peso: 700, cor: '#fff', maxW: W - 2 * P });
  anTexto(ctx, 'Prestação de contas para os moradores', P, 222, { size: 28, cor: 'rgba(255,255,255,.85)' });

  // saldo em caixa
  ctx.fillStyle = '#fff'; anRR(ctx, P, 300, W - 2 * P, 250, 24); ctx.fill();
  anTexto(ctx, 'SALDO EM CAIXA', P + 40, 362, { size: 26, peso: 700, cor: cinza });
  anTexto(ctx, moeda(caixa), P + 40, 460, { size: 88, peso: 700, cor: caixa >= 0 ? verde : verm, maxW: W - 2 * P - 80 });
  anTexto(ctx, `acumulado de Jan a ${MESES[mesSel]}/${anoSel}`, P + 40, 518, { size: 26, cor: cinza });

  // três quadros
  const tw = (W - 2 * P - 2 * 24) / 3;
  [['ARRECADADO', recMes, verde], ['GASTOS', totalDesp, '#f7971e'], ['SALDO DO MÊS', saldoMes, saldoMes >= 0 ? verde : verm]]
    .forEach(([rot, val, cor], i) => {
      const x = P + i * (tw + 24);
      ctx.fillStyle = '#fff'; anRR(ctx, x, 580, tw, 190, 24); ctx.fill();
      ctx.fillStyle = cor; anRR(ctx, x, 580, 10, 190, 5); ctx.fill();
      anTexto(ctx, rot, x + 34, 640, { size: 22, peso: 700, cor: cinza, maxW: tw - 50 });
      anTexto(ctx, moeda(val), x + 34, 716, { size: 38, peso: 700, cor, maxW: tw - 50 });
    });

  // adimplência
  ctx.fillStyle = '#fff'; anRR(ctx, P, 800, W - 2 * P, 190, 24); ctx.fill();
  anTexto(ctx, 'PAGAMENTOS EM DIA', P + 40, 860, { size: 26, peso: 700, cor: cinza });
  if (adPct === null) {
    anTexto(ctx, 'Prazo de pagamento ainda em andamento', P + 40, 935, { size: 34, cor: cinza, maxW: W - 2 * P - 80 });
  } else {
    const ad = adPct;
    anTexto(ctx, `${Math.round(ad)}%`, W - P - 40, 862, { size: 56, peso: 700, cor: ad >= 90 ? verde : ad >= 70 ? '#f7971e' : verm, alinh: 'right' });
    ctx.fillStyle = '#e2e8f0'; anRR(ctx, P + 40, 900, W - 2 * P - 80, 34, 17); ctx.fill();
    ctx.fillStyle = ad >= 90 ? verde : ad >= 70 ? '#f7971e' : verm;
    if (ad > 0) { anRR(ctx, P + 40, 900, Math.max(34, (W - 2 * P - 80) * ad / 100), 34, 17); ctx.fill(); }
  }

  // maiores gastos do mês (só categorias)
  ctx.fillStyle = '#fff'; anRR(ctx, P, 1020, W - 2 * P, 220, 24); ctx.fill();
  anTexto(ctx, 'ONDE O DINHEIRO FOI UTILIZADO ', P + 40, 1080, { size: 26, peso: 700, cor: cinza });
  if (!top.length) {
    anTexto(ctx, 'Sem gastos lançados neste mês', P + 40, 1160, { size: 32, cor: cinza });
  } else {
    top.forEach(([c, v], i) => {
      const y = 1130 + i * 38, bw = 330;
      anTexto(ctx, c, P + 40, y, { size: 24, cor: '#1a202c', maxW: 300 });
      ctx.fillStyle = '#e2e8f0'; anRR(ctx, P + 360, y - 20, bw, 20, 10); ctx.fill();
      ctx.fillStyle = AN_CORES[i]; anRR(ctx, P + 360, y - 20, Math.max(14, bw * v / totalDesp), 20, 10); ctx.fill();
      anTexto(ctx, `${moeda(v)}`, W - P - 40, y, { size: 24, peso: 700, alinh: 'right' });
    });
  }

  // rodapé
  anTexto(ctx, `Valores da planilha de transparência do condomínio · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
    W / 2, 1300, { size: 22, cor: cinza, alinh: 'center', maxW: W - 2 * P });
}

function anResumoBlob() {
  return new Promise(res => document.getElementById('an-resumo-canvas').toBlob(res, 'image/png'));
}

async function anResumoBaixar() {
  renderResumoCompartilhar();
  const blob = await anResumoBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `resumo-condominio-${anoSel}-${String(mesSel + 1).padStart(2, '0')}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function anResumoCompartilhar() {
  renderResumoCompartilhar();
  const blob = await anResumoBlob();
  const file = new File([blob], `resumo-condominio-${anoSel}-${String(mesSel + 1).padStart(2, '0')}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Resumo de ${MESES_FULL[mesSel]}/${anoSel}` }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  anResumoBaixar(); // sem compartilhamento nativo (ex.: computador): baixa a imagem
}

document.getElementById('btn-resumo-baixar')?.addEventListener('click', anResumoBaixar);
document.getElementById('btn-resumo-compartilhar')?.addEventListener('click', anResumoCompartilhar);

// ── 6b) Resumo do mês em TEXTO (pronto para colar no WhatsApp) ─
// Usa *asteriscos* para negrito, que é como o WhatsApp entende.
function anResumoTexto() {
  const { recMes, totalDesp, saldoMes, adPct, caixa, mesLabel, top } = anDadosResumo();
  const linhas = [
    `🏢 *Resumo de ${mesLabel}*`,
    'Prestação de contas · Controle Condominial',
    '',
    `💰 *Saldo em caixa:* ${moeda(caixa)}`,
    `(acumulado de Jan a ${MESES[mesSel]}/${anoSel})`,
    '',
    `📥 Arrecadado no mês: ${moeda(recMes)}`,
    `📤 Gastos no mês: ${moeda(totalDesp)}`,
    `📊 Saldo do mês: ${moeda(saldoMes)}`,
    '',
    adPct === null
      ? `⏳ Pagamentos: prazo ainda em andamento (vence dia 10/${MESES[(mesSel + 1) % 12]})`
      : `✅ Pagamentos em dia: ${Math.round(adPct)}%`
  ];
  if (top.length) {
    linhas.push('', '🧾 *Onde o dinheiro foi utilizado*');
    top.forEach(([c, v]) => linhas.push(`• ${c}: ${moeda(v)} (${Math.round(v / totalDesp * 100)}%)`));
  } else {
    linhas.push('', '🧾 Sem gastos lançados neste mês.');
  }
  linhas.push('', '_Valores da planilha de transparência do condomínio._');
  return linhas.join('\n');
}

function anRenderResumoTexto() {
  const el = document.getElementById('an-resumo-texto');
  if (el) el.value = anResumoTexto();
}

async function anCopiarTexto() {
  const btn = document.getElementById('btn-texto-copiar');
  const txt = anResumoTexto();
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
    // plano B para navegadores que bloqueiam a área de transferência
    const el = document.getElementById('an-resumo-texto');
    el.select();
    try { ok = document.execCommand('copy'); } catch (e2) { /* sem cópia automática */ }
    window.getSelection().removeAllRanges();
  }
  const antes = btn.textContent;
  btn.textContent = ok ? '✅ Copiado!' : '⚠️ Selecione e copie manualmente';
  setTimeout(() => { btn.textContent = antes; }, 2200);
}

async function anCompartilharTexto() {
  const txt = anResumoTexto();
  if (navigator.share) {
    try { await navigator.share({ text: txt }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  anCopiarTexto(); // sem compartilhamento nativo: copia
}

document.getElementById('btn-texto-copiar')?.addEventListener('click', anCopiarTexto);
document.getElementById('btn-texto-compartilhar')?.addEventListener('click', anCompartilharTexto);
