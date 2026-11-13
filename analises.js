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
}
