// ── Configuração ──────────────────────────────────────────────
const SHEET_ID = '1kPpRfPsT3sL-6-5gCZzLwbb4zvxUVBOZHI7CtQ5GU2Q';
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Estado ────────────────────────────────────────────────────
let dadosReceitas = [];   // [{unidade, valores:[12]}]
let dadosDespesas = [];   // [{data,dataParts,categoria,descricao,fornecedor,valor,status}]
let dadosComunicados = []; // [{titulo,texto,data,ativo,validade}]
let dadosContatos = [];   // [{nome,cargo,categoria,telefone,email,empresa,obs}]
let saldoAnterior = 0;
let mesSel = new Date().getMonth();
let anoSel = new Date().getFullYear();

// ── Modo Privado (LGPD) ───────────────────────────────────────
let modoPrivado = false;
let mapaUnidades = {};

function buildMapaUnidades() {
  mapaUnidades = {};
  dadosReceitas.forEach((r, i) => {
    mapaUnidades[r.unidade] = `ap${i + 1}`;
  });
}

function nomUnidade(u) {
  return modoPrivado ? (mapaUnidades[u] || '—') : u;
}

// Seletor de ano — preenchido dinamicamente após detectar abas disponíveis
const selAno = document.getElementById('sel-ano');

async function probeYear(year) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(`Receitas ${year}`)}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const firstLine = (await res.text()).split(/\r?\n/)[0].toUpperCase();
    return firstLine.includes('RECEITAS') && firstLine.includes(String(year));
  } catch { return false; }
}

async function inicializarAnos() {
  const anoAtual = new Date().getFullYear();
  const candidatos = Array.from({ length: anoAtual - 2014 + 2 }, (_, i) => 2015 + i);
  const resultados = await Promise.all(candidatos.map(probeYear));
  const anosValidos = candidatos.filter((_, i) => resultados[i]);
  if (anosValidos.length === 0) anosValidos.push(anoAtual);
  selAno.innerHTML = '';
  anosValidos.forEach(y => selAno.add(new Option(y, y)));
  anoSel = anosValidos[anosValidos.length - 1];
  selAno.value = anoSel;
}

document.getElementById('sel-mes').value = mesSel;

// ── Utilitários ───────────────────────────────────────────────
function moeda(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function parseMoeda(str) {
  if (!str || str.trim() === '') return 0;
  const cleaned = str.replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.').trim();
  return parseFloat(cleaned) || 0;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao carregar aba "${sheetName}"`);
  return parseCSV(await res.text());
}

// ── Parse dados ───────────────────────────────────────────────
function parseConfig(rows) {
  const map = {};
  rows.slice(1).forEach(r => {
    const u = (r[0] || '').trim();
    if (!u || isNaN(+u)) return;
    map[u] = r.slice(1, 13).map(v => !!(v || '').trim());
  });
  return map;
}

function parseReceitas(rows, isentosMap = {}) {
  // Linha 0 = cabeçalho (célula mesclada + meses), ignorar
  // Linha TOTAL = ignorar
  return rows.slice(1).filter(r => {
    const u = (r[0] || '').trim();
    return u && u !== 'TOTAL' && !u.startsWith('RECEITAS') && !isNaN(+u);
  }).map(r => {
    const unidade = r[0].trim();
    // Isentos: vem da aba Config (primário) ou fallback por valor negativo/-texto ISENTO na célula
    const fromConfig = isentosMap[unidade];
    const isentos = fromConfig || r.slice(1, 13).map(v => (v || '').trim().toUpperCase() === 'ISENTO' || parseMoeda(v) < 0);
    return {
      unidade,
      valores: r.slice(1, 13).map(parseMoeda),
      isentos
    };
  });
}

function parseDespesas(rows) {
  return rows.slice(1).filter(r => {
    const d = (r[0] || '').trim();
    return d && d !== 'Data' && !d.startsWith('DESPESAS') && r[4];
  }).map(r => {
    const parts = (r[0] || '').split('/');
    return {
      data: r[0], dataParts: parts,
      categoria: r[1] || '', descricao: r[2] || '',
      fornecedor: r[3] || '', valor: parseMoeda(r[4]),
      status: r[5] || ''
    };
  }).filter(r => r.valor > 0);
}

function parseComunicados(rows) {
  return rows.slice(1).filter(r => (r[0] || '').trim()).map(r => {
    const ativo = (r[3] || '').trim();
    const valStr = (r[4] || '').trim();
    let validade = null;
    if (valStr) {
      const p = valStr.split('/');
      validade = p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(valStr);
    }
    return { titulo: r[0] || '', texto: r[1] || '', data: r[2] || '',
             ativo: ativo === '' || ativo.toUpperCase() === 'TRUE', validade };
  }).filter(c => c.ativo && (!c.validade || c.validade >= new Date()));
}

// ── Filtrar despesas por mês/ano ──────────────────────────────
function despMesAtual(dados, mes, ano) {
  return dados.filter(d => {
    if (!d.dataParts || d.dataParts.length < 3) return false;
    return parseInt(d.dataParts[1]) - 1 === mes && parseInt(d.dataParts[2]) === ano;
  });
}

// ── Render ────────────────────────────────────────────────────
function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function renderDashboard() {
  const mesLabel = `${MESES_FULL[mesSel]}/${anoSel}`;
  set('dash-subtitle', `Resumo financeiro · ${mesLabel}`);

  // Receitas do mês
  const recMes = dadosReceitas.reduce((s, r) => s + r.valores[mesSel], 0);
  const pagas  = dadosReceitas.filter(r => r.valores[mesSel] > 0).length;
  const total  = dadosReceitas.length;

  // Despesas do mês
  const despMes = despMesAtual(dadosDespesas, mesSel, anoSel);
  const totalDesp = despMes.reduce((s, d) => s + d.valor, 0);

  const saldoMes = recMes - totalDesp;
  // Só conta inadimplência para o mês selecionado se já venceu (dia 10 do mês seguinte)
  const mesJaVenceu = mesVencido(mesSel, anoSel);
  const isentosCount = dadosReceitas.filter(r => r.isentos && r.isentos[mesSel]).length;
  const inadimplCount = mesJaVenceu ? (total - pagas - isentosCount) : 0;
  const inadimpl = total > 0 ? (inadimplCount / total * 100) : 0;

  // ── Saldo em caixa acumulado (Jan até mês selecionado) ──
  const recAcum  = dadosReceitas.reduce((s, r) => s + r.valores.slice(0, mesSel + 1).reduce((a,b) => a+b, 0), 0);
  const despAcum = dadosDespesas
    .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 <= mesSel)
    .reduce((s, d) => s + d.valor, 0);
  const saldoCaixa = recAcum - despAcum + saldoAnterior;

  set('kpi-caixa', moeda(saldoCaixa));
  const subSaldo = saldoAnterior !== 0
    ? `Jan a ${MESES[mesSel]}/${anoSel} · Inclui saldo de ${anoSel - 1} · ${saldoCaixa >= 0 ? '✓ positivo' : '⚠ negativo'}`
    : `Jan a ${MESES[mesSel]}/${anoSel} · ${saldoCaixa >= 0 ? '✓ positivo' : '⚠ negativo'}`;
  set('kpi-caixa-sub', subSaldo);
  set('kpi-caixa-rec',  moeda(recAcum));
  set('kpi-caixa-desp', moeda(despAcum));
  set('kpi-caixa-mes',  moeda(saldoMes));
  renderSparkline();

  set('kpi-saldo',       moeda(recMes));
  set('kpi-saldo-sub',   `${pagas} de ${total} unidades pagas`);
  set('kpi-despesas',    moeda(totalDesp));
  set('kpi-despesas-sub',`${despMes.length} lançamento(s)`);
  set('kpi-receitas',    moeda(saldoMes));
  set('kpi-receitas-sub', saldoMes >= 0 ? '✓ Positivo' : '⚠ Negativo');
  set('kpi-inad',        mesJaVenceu ? inadimpl.toFixed(1) + '%' : '—');
  set('kpi-inad-sub',    mesJaVenceu ? `${inadimplCount} unidade(s) em aberto` : `vence dia 10/${MESES[mesSel + 1] || 'Jan'}`);
  set('badge-inad', inadimplCount);

  // Últimos lançamentos: mistura receitas pagas + despesas do mês
  const lancamentos = [];
  dadosReceitas.filter(r => r.valores[mesSel] > 0).forEach(r => {
    lancamentos.push({ data: `${String(mesSel+1).padStart(2,'0')}/${anoSel}`, descricao: 'Taxa de condomínio', unid: nomUnidade(r.unidade), valor: r.valores[mesSel], tipo: 'rec' });
  });
  despMes.forEach(d => {
    lancamentos.push({ data: d.data, descricao: d.descricao, unid: '—', valor: d.valor, tipo: 'desp' });
  });
  lancamentos.sort((a,b) => a.data.localeCompare(b.data));

  const tb = document.getElementById('tbody-lancamentos');
  if (lancamentos.length === 0) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="5">Sem lançamentos neste mês</td></tr>`;
  } else {
    tb.innerHTML = lancamentos.slice(0, 12).map(l => `
      <tr>
        <td>${l.data}</td>
        <td>${l.descricao}</td>
        <td>${l.unid}</td>
        <td class="${l.tipo==='rec'?'trend-up':'trend-down'}">${l.tipo==='rec'?'+':'-'} ${moeda(l.valor)}</td>
        <td><span class="pill ${l.tipo==='rec'?'pill-green':'pill-orange'}">${l.tipo==='rec'?'Receita':'Despesa'}</span></td>
      </tr>`).join('');
  }

  renderGaugeAdimplencia();
  renderTendenciaInad();
  renderTopDespesas(despMes);
  renderProjecaoCaixa();
  renderBarChart();
  renderDoughnut(despMes);
}

function renderReceitas() {
  const mesLabel = `${MESES_FULL[mesSel]}/${anoSel}`;
  set('rec-subtitle', `Arrecadação do condomínio · ${mesLabel}`);

  const filMes    = parseInt(document.getElementById('fil-rec-mes').value);
  const filStatus = document.getElementById('fil-rec-status').value;

  // Definir qual(is) coluna(s) mostrar
  const mesesMostrar = filMes === -1 ? MESES.map((_,i)=>i) : [filMes];

  // KPIs (sempre baseados no mês do header)
  const recMes = dadosReceitas.reduce((s, r) => s + r.valores[mesSel], 0);
  const pagas  = dadosReceitas.filter(r => r.valores[mesSel] > 0);
  const aberto = dadosReceitas.filter(r => r.valores[mesSel] === 0 && !(r.isentos && r.isentos[mesSel]));

  set('kpi-rec-total', moeda(recMes));
  set('kpi-rec-total-sub', mesLabel);
  set('kpi-rec-pagas', pagas.length);
  set('kpi-rec-pagas-sub', `de ${dadosReceitas.length} unidades`);
  set('kpi-rec-ticket', pagas.length ? moeda(recMes / pagas.length) : '—');
  const recMesVenceu = mesVencido(mesSel, anoSel);
  set('kpi-rec-aberto', recMesVenceu ? aberto.length : '—');
  set('kpi-rec-aberto-sub', recMesVenceu ? `unidade(s) inadimplentes` : `vence dia 10/${MESES[(mesSel + 1) % 12]}`);

  // Tabela
  const th = document.getElementById('rec-th-mes');
  th.textContent = 'Mês(es)';

  const rows = [];
  if (filMes === -1) {
    dadosReceitas.forEach(r => {
      const mesesPagos = MESES.filter((_, mi) => r.valores[mi] > 0);
      const totalPago  = r.valores.reduce((s, v) => s + v, 0);
      const hasAberto  = MESES.some((_, mi) => r.valores[mi] === 0 && !(r.isentos && r.isentos[mi]) && mesVencido(mi, anoSel));
      const status     = mesesPagos.length > 0 ? 'pago' : hasAberto ? 'aberto' : 'isento';
      if (filStatus && filStatus !== status) return;
      rows.push({ unidade: r.unidade, mes: mesesPagos.length > 0 ? mesesPagos.join(', ') : '—', valor: totalPago, status });
    });
  } else {
    mesesMostrar.forEach(mi => {
      dadosReceitas.forEach(r => {
        const v = r.valores[mi];
        const isento = r.isentos && r.isentos[mi];
        const status = v > 0 ? 'pago' : isento ? 'isento' : 'aberto';
        if (filStatus && filStatus !== status) return;
        rows.push({ unidade: r.unidade, mes: MESES[mi], valor: v, status });
      });
    });
  }

  linhasReceitasCSV = rows;

  const tb = document.getElementById('tbody-receitas');
  if (rows.length === 0) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="4">Nenhum registro encontrado</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${nomUnidade(r.unidade)}</strong></td>
      <td>${r.mes}</td>
      <td>${r.valor > 0 ? moeda(r.valor) : '—'}</td>
      <td><span class="pill ${r.status==='pago'?'pill-green':r.status==='isento'?'pill-gray':'pill-red'}">${r.status==='pago'?'Pago':r.status==='isento'?'Isento':'Em aberto'}</span></td>
    </tr>`).join('');
}

let linhasReceitasCSV = [];
let linhasDespesasCSV = [];

// ── Exportar tabelas em CSV ───────────────────────────────────
function baixarCSV(nome, cabecalho, linhas) {
  const esc = v => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  // ";" como separador e BOM UTF-8: o Excel em português abre certinho, com acentos
  const csv = [cabecalho, ...linhas].map(l => l.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const numCSV = v => v.toFixed(2).replace('.', ',');

function exportarReceitasCSV() {
  const nomeStatus = { pago: 'Pago', isento: 'Isento', aberto: 'Em aberto' };
  baixarCSV(`receitas-${anoSel}.csv`, ['Unidade', 'Mês(es)', 'Valor', 'Status'],
    linhasReceitasCSV.map(r => [nomUnidade(r.unidade), r.mes, r.valor > 0 ? numCSV(r.valor) : '', nomeStatus[r.status]]));
}

function exportarDespesasCSV() {
  baixarCSV(`despesas-${MESES[mesSel].toLowerCase()}-${anoSel}.csv`,
    ['Data', 'Categoria', 'Descrição', 'Fornecedor', 'Valor', 'Status'],
    linhasDespesasCSV.map(d => [d.data, d.categoria, d.descricao, d.fornecedor, numCSV(d.valor), d.status]));
}

function renderDespesas() {
  const mesLabel = `${MESES_FULL[mesSel]}/${anoSel}`;
  set('desp-subtitle', `Pagamentos realizados · ${mesLabel}`);

  const filCat    = document.getElementById('fil-desp-cat').value;
  const filStatus = document.getElementById('fil-desp-status').value;

  // Preenche dropdown de categorias na primeira vez
  const selCat = document.getElementById('fil-desp-cat');
  if (selCat.options.length === 1) {
    const cats = [...new Set(dadosDespesas.map(d => d.categoria))].sort();
    cats.forEach(c => { const o = new Option(c, c); selCat.add(o); });
  }

  // Filtra pelo mês do header + filtros da aba
  const base = despMesAtual(dadosDespesas, mesSel, anoSel);
  const rows = base.filter(d => {
    if (filCat && d.categoria !== filCat) return false;
    if (filStatus && d.status !== filStatus) return false;
    return true;
  });

  // KPIs
  const totalBase = base.reduce((s,d)=>s+d.valor,0);
  const pagas     = base.filter(d=>d.status==='Pago');
  const aPagar    = base.filter(d=>d.status!=='Pago');
  set('kpi-desp-total', moeda(totalBase));
  set('kpi-desp-sub', mesLabel);
  set('kpi-desp-pagas', moeda(pagas.reduce((s,d)=>s+d.valor,0)));
  set('kpi-desp-pagas-sub', `${pagas.length} lançamento(s)`);
  set('kpi-desp-apagar', moeda(aPagar.reduce((s,d)=>s+d.valor,0)));
  set('kpi-desp-apagar-sub', `${aPagar.length} lançamento(s)`);
  set('kpi-desp-count', rows.length);
  set('kpi-desp-count-sub', 'filtrados');

  linhasDespesasCSV = rows;

  const tb = document.getElementById('tbody-despesas');
  if (rows.length === 0) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="6">Nenhuma despesa encontrada</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(d => `
    <tr>
      <td>${d.data}</td>
      <td><span class="pill pill-blue">${d.categoria}</span></td>
      <td>${d.descricao}</td>
      <td>${d.fornecedor}</td>
      <td style="text-align:right">${moeda(d.valor)}</td>
      <td><span class="pill ${d.status==='Pago'?'pill-green':'pill-orange'}">${d.status}</span></td>
    </tr>`).join('');
}

function renderInadimplencia() {
  const mesLabel = `${MESES_FULL[mesSel]}/${anoSel}`;
  set('inad-subtitle', `Unidades com pagamentos em aberto · ${mesLabel}`);
  set('inad-mes-label', mesLabel);

  // Inadimplentes = unidades onde algum mês até mesSel já venceu (dia 10 do mês seguinte) e não foi pago
  const inadimpl = dadosReceitas.map(r => {
    // Dívidas de anos anteriores vêm primeiro, com o ano na etiqueta (ex.: Jan/2026)
    const antigos = Object.keys(dadosAnosAnteriores).map(Number).sort((a, b) => a - b)
      .flatMap(y => {
        const ra = dadosAnosAnteriores[y].find(x => x.unidade === r.unidade);
        if (!ra) return [];
        return MESES
          .map((m, i) => ({ mes: `${m}/${y}`, idx: i, valor: ra.valores[i] }))
          .filter(m => m.valor === 0 && !(ra.isentos && ra.isentos[m.idx]) && mesVencido(m.idx, y));
      });
    const atuais = MESES.slice(0, mesSel + 1)
      .map((m, i) => ({ mes: m, idx: i, valor: r.valores[i] }))
      .filter(m => m.valor === 0 && !(r.isentos && r.isentos[m.idx]) && mesVencido(m.idx, anoSel));
    return { unidade: r.unidade, mesesAbertos: [...antigos, ...atuais] };
  }).filter(r => r.mesesAbertos.length > 0);

  const total = dadosReceitas.length;
  const taxa  = total > 0 ? inadimpl.length / total * 100 : 0;
  const maxMeses = inadimpl.reduce((m, r) => Math.max(m, r.mesesAbertos.length), 0);

  set('kpi-inad-taxa', taxa.toFixed(1) + '%');
  set('kpi-inad-taxa-sub', `${inadimpl.length} de ${total} unidades`);
  document.getElementById('inad-bar').style.width = taxa.toFixed(1) + '%';
  set('kpi-inad-count', inadimpl.length);
  set('kpi-inad-count-sub', `unidade(s) com pendências`);
  set('kpi-inad-max', maxMeses === 0 ? '—' : maxMeses + ' mês(es)');
  set('kpi-inad-ok', total - inadimpl.length);
  set('kpi-inad-ok-sub', `em dia até ${MESES[mesSel]}`);
  set('badge-inad', inadimpl.length);

  const tb = document.getElementById('tbody-inad');
  if (inadimpl.length === 0) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="3">Nenhuma unidade inadimplente neste período 🎉</td></tr>`;
    return;
  }
  tb.innerHTML = inadimpl.map(r => {
    const n = r.mesesAbertos.length;
    return `<tr>
      <td><strong>${nomUnidade(r.unidade)}</strong></td>
      <td>${r.mesesAbertos.map(m=>m.mes).join(', ')}</td>
      <td>${n}</td>
    </tr>`;
  }).join('');
}

// ── Regra de vencimento: dia 10 do mês seguinte ───────────────
function mesVencido(mesIdx, ano) {
  // mesIdx=0 (Jan) vence dia 10/Fev, mesIdx=11 (Dez) vence 10/Jan do ano seguinte
  return new Date() >= new Date(ano, mesIdx + 1, 10);
}

// ── Charts ────────────────────────────────────────────────────
let barChart, doughnutChart, fundoChart, sparklineChart, gaugeChart, inadTendChart;

function isDark() { return document.documentElement.dataset.theme === 'dark'; }
function tColor() { return isDark() ? '#a0aec0' : '#718096'; }
function gColor() { return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; }

function renderSparkline() {
  const ctx = document.getElementById('sparkline-caixa');
  if (!ctx) return;
  if (sparklineChart) { sparklineChart.destroy(); sparklineChart = null; }

  const labels = [];
  const data = [];
  for (let m = 0; m <= mesSel; m++) {
    const recAcum = dadosReceitas.reduce((s, r) => s + r.valores.slice(0, m + 1).reduce((a, b) => a + b, 0), 0);
    const despAcum = dadosDespesas
      .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 <= m)
      .reduce((s, d) => s + d.valor, 0);
    labels.push(MESES[m]);
    data.push(recAcum - despAcum + saldoAnterior);
  }

  const positivo = data[data.length - 1] >= 0;
  const cor = positivo ? 'rgba(100,255,180,0.9)' : 'rgba(255,100,100,0.9)';
  const corFill = positivo ? 'rgba(100,255,180,0.15)' : 'rgba(255,100,100,0.15)';

  sparklineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: cor,
        backgroundColor: corFill,
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: data.map((_, i) => i === data.length - 1 ? 4 : 0),
        pointBackgroundColor: cor
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => moeda(ctx.parsed.y) }
      }},
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function renderBarChart() {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  if (barChart) barChart.destroy();

  const labelsR = MESES.map((m,i) => dadosReceitas.reduce((s,r)=>s+r.valores[i],0));
  const labelsD = MESES.map((_,i) => {
    const mes = i, ano = anoSel;
    return despMesAtual(dadosDespesas, mes, ano).reduce((s,d)=>s+d.valor,0);
  });
  const labelsS = labelsR.map((r,i) => r - labelsD[i]);

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: [
        { label: 'Receitas', data: labelsR, backgroundColor: 'rgba(17,153,142,0.7)', borderRadius: 5 },
        { label: 'Despesas', data: labelsD, backgroundColor: 'rgba(247,151,30,0.7)',  borderRadius: 5 },
        { label: 'Saldo',    data: labelsS, backgroundColor: labelsS.map(v => v >= 0 ? 'rgba(102,126,234,0.7)' : 'rgba(255,100,100,0.7)'), borderRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: tColor(), font: { size: 11 } } },
        zeroLine: {}
      },
      scales: {
        x: { ticks: { color: tColor() }, grid: { color: gColor() } },
        y: {
          ticks: {
            color: tColor(),
            stepSize: 200,
            callback: v => 'R$' + (v/1000).toFixed(1).replace('.',',') + 'k'
          },
          grid: { color: gColor() }
        }
      }
    },
    plugins: [{
      id: 'zeroLine',
      afterDraw(chart) {
        const yAxis = chart.scales.y;
        if (yAxis.min >= 0) return;
        const y = yAxis.getPixelForValue(0);
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.beginPath();
        ctx2.moveTo(chart.chartArea.left, y);
        ctx2.lineTo(chart.chartArea.right, y);
        ctx2.strokeStyle = '#aaa';
        ctx2.lineWidth = 1.5;
        ctx2.stroke();
        ctx2.restore();
      }
    }]
  });
}

function renderDoughnut(despMes) {
  const ctx = document.getElementById('chart-doughnut');
  if (!ctx) return;
  if (doughnutChart) doughnutChart.destroy();

  const cats = {};
  (despMes || despMesAtual(dadosDespesas, mesSel, anoSel)).forEach(d => {
    cats[d.categoria] = (cats[d.categoria] || 0) + d.valor;
  });

  const labels = Object.keys(cats);
  const values = labels.map(k => cats[k]);
  const cores = ['#667eea','#11998e','#f7971e','#ff758c','#4facfe','#a78bfa','#48bb78','#f6ad55'];

  set('chart-donut-label', `${MESES[mesSel]}/${anoSel}`);

  if (labels.length === 0) {
    doughnutChart = new Chart(ctx, {
      type: 'doughnut', data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }] },
      options: { plugins: { legend: { display: false } } }
    });
    return;
  }

  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: cores.slice(0, labels.length), borderWidth: 2, borderColor: isDark() ? '#1a1d27' : '#fff' }]
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: tColor(), font: { size: 10 }, padding: 10 } } }
    }
  });
}

function renderGaugeAdimplencia() {
  const ctx = document.getElementById('gauge-adimplencia');
  if (!ctx) return;
  if (gaugeChart) { gaugeChart.destroy(); gaugeChart = null; }

  const pagas = dadosReceitas.filter(r => r.valores[mesSel] > 0).length;
  const total  = dadosReceitas.length;
  const pct    = total > 0 ? (pagas / total * 100) : 0;
  const cor    = pct >= 80 ? '#48bb78' : pct >= 60 ? '#f6ad55' : '#fc8181';
  const label  = pct >= 80 ? 'Boa' : pct >= 60 ? 'Regular' : 'Baixa';

  set('gauge-pct-label', pct.toFixed(0) + '%');
  set('gauge-units-label', `${pagas} de ${total} unidades pagas`);
  const sl = document.getElementById('gauge-status-label');
  if (sl) { sl.textContent = label; sl.style.color = cor; }

  gaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, 100 - pct],
        backgroundColor: [cor, isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'],
        borderWidth: 0
      }]
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      animation: false,
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderTendenciaInad() {
  const ctx = document.getElementById('chart-inad-trend');
  if (!ctx) return;
  if (inadTendChart) { inadTendChart.destroy(); inadTendChart = null; }

  const labels = [], data = [];
  const total = dadosReceitas.length;
  for (let m = 0; m <= mesSel; m++) {
    if (!mesVencido(m, anoSel)) break;
    const pagas = dadosReceitas.filter(r => r.valores[m] > 0).length;
    labels.push(MESES[m]);
    data.push(total > 0 ? parseFloat(((total - pagas) / total * 100).toFixed(1)) : 0);
  }

  const emptyEl = document.getElementById('inad-trend-empty');
  if (data.length === 0) {
    emptyEl.style.display = 'block'; ctx.style.display = 'none';
    set('inad-trend-badge', '—');
    return;
  }
  emptyEl.style.display = 'none'; ctx.style.display = '';

  const ultimo = data[data.length - 1];
  const penult = data.length > 1 ? data[data.length - 2] : null;
  let badge = '—', badgeColor = tColor();
  if (penult !== null) {
    if (ultimo < penult)      { badge = '↓ Melhorou'; badgeColor = '#48bb78'; }
    else if (ultimo > penult) { badge = '↑ Piorou';   badgeColor = '#fc8181'; }
    else                      { badge = '→ Estável';  badgeColor = tColor();  }
  }
  const badgeEl = document.getElementById('inad-trend-badge');
  if (badgeEl) { badgeEl.textContent = badge; badgeEl.style.color = badgeColor; }

  inadTendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#ff758c',
        backgroundColor: 'rgba(255,117,140,0.1)',
        borderWidth: 2, tension: 0.4, fill: true,
        pointRadius: data.map((_, i) => i === data.length - 1 ? 4 : 2),
        pointBackgroundColor: '#ff758c'
      }]
    },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + '%' } } },
      scales: {
        x: { ticks: { color: tColor(), font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: tColor(), font: { size: 10 }, callback: v => v + '%' }, grid: { color: gColor() }, min: 0 }
      }
    }
  });
}

function renderTopDespesas(despMes) {
  const dados = despMes || despMesAtual(dadosDespesas, mesSel, anoSel);
  const cats  = {};
  dados.forEach(d => { cats[d.categoria] = (cats[d.categoria] || 0) + d.valor; });
  const totalDesp = Object.values(cats).reduce((s, v) => s + v, 0);
  const sorted    = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cores     = ['#667eea', '#11998e', '#f7971e', '#ff758c', '#4facfe'];

  set('top-desp-mes', `${MESES[mesSel]}/${anoSel}`);

  const el = document.getElementById('top-despesas-list');
  if (!el) return;
  if (sorted.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-style:italic;font-size:0.8rem;padding:28px 0">Sem despesas neste mês</div>`;
    return;
  }
  el.innerHTML = sorted.map(([cat, val], i) => {
    const pct = totalDesp > 0 ? (val / totalDesp * 100) : 0;
    return `
      <div class="top-desp-item">
        <div class="top-desp-header">
          <span class="top-desp-name">${cat}</span>
          <span class="top-desp-val">${moeda(val)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct.toFixed(1)}%;background:${cores[i]};transition:width 0.4s ease"></div>
        </div>
        <div class="top-desp-pct">${pct.toFixed(1)}% do total</div>
      </div>`;
  }).join('');
}

function renderProjecaoCaixa() {
  const el = document.getElementById('proj-caixa-list');
  if (!el) return;

  // Últimos 6 meses disponíveis antes do mês selecionado
  const janela = 6;
  const mesesRef = [];
  for (let i = mesSel - 1; i >= 0 && mesesRef.length < janela; i--) mesesRef.push(i);

  if (mesesRef.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-style:italic;font-size:0.8rem;padding:28px 0">Dados insuficientes</div>`;
    return;
  }

  const mediaRec  = mesesRef.reduce((s, i) => s + dadosReceitas.reduce((a, r) => a + r.valores[i], 0), 0) / mesesRef.length;
  const mediaDesp = mesesRef.reduce((s, i) => {
    return s + dadosDespesas.filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 === i).reduce((a, d) => a + d.valor, 0);
  }, 0) / mesesRef.length;
  const mediaSaldo = mediaRec - mediaDesp;

  // Saldo atual em caixa (acumulado até mesSel)
  const recAcum  = dadosReceitas.reduce((s, r) => s + r.valores.slice(0, mesSel + 1).reduce((a, b) => a + b, 0), 0);
  const despAcum = dadosDespesas
    .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 <= mesSel)
    .reduce((s, d) => s + d.valor, 0);
  let saldoBase = recAcum - despAcum + saldoAnterior;

  const projecoes = [1, 2, 3].map(n => {
    const mesIdx = mesSel + n;
    const mesNome = mesIdx < 12 ? MESES[mesIdx] : MESES[mesIdx - 12];
    saldoBase += mediaSaldo;
    return { mes: mesNome, saldo: saldoBase };
  });

  const corSeta = s => s >= 0 ? 'var(--c-receitas)' : 'var(--c-inadimplencia)';
  const icone   = s => s >= 0 ? '▲' : '▼';

  el.innerHTML = `
    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px">
      Baseado na média de receitas (${moeda(mediaRec)}) e despesas (${moeda(mediaDesp)}) dos últimos ${mesesRef.length} meses
    </div>
    ${projecoes.map((p, n) => `
      <div class="top-desp-item">
        <div class="top-desp-header">
          <span class="top-desp-name">${p.mes}/${anoSel + (mesSel + n + 1 >= 12 ? 1 : 0)}</span>
          <span style="font-weight:700;color:${corSeta(p.saldo)}">${icone(p.saldo)} ${moeda(Math.abs(p.saldo))}</span>
        </div>
      </div>`).join('')}
    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:8px;font-style:italic">
      Saldo médio mensal projetado: ${mediaSaldo >= 0 ? '+' : ''}${moeda(mediaSaldo)}
    </div>`;
}

function renderFundo() {
  const ctx = document.getElementById('chart-fundo');
  if (!ctx || fundoChart) return;
  fundoChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan','Fev','Mar'],
      datasets: [{ label: 'Saldo acumulado', data: [37680, 37680, 38720], borderColor: '#4facfe', backgroundColor: 'rgba(79,172,254,0.1)', tension: 0.4, fill: true, pointBackgroundColor: '#4facfe' }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: tColor(), font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: tColor() }, grid: { color: gColor() } },
        y: { ticks: { color: tColor(), callback: v => 'R$'+(v/1000).toFixed(1).replace('.',',')+'k' }, grid: { color: gColor() }, min: 30000 }
      }
    }
  });
}

function renderComunicados() {
  const el = document.getElementById('comm-list');
  if (!el) return;
  if (!dadosComunicados.length) {
    el.innerHTML = '<p style="color:var(--c-muted);font-size:.85rem">Nenhum comunicado ativo.</p>';
    return;
  }
  el.innerHTML = dadosComunicados.map(c => `
    <div class="comm-card geral">
      <div class="comm-card-title">${c.titulo}</div>
      ${c.texto ? `<div class="comm-card-meta">${c.texto}</div>` : ''}
    </div>`).join('');
}

const TICKER_ICONS = {
  'limpeza': '🧹', 'conservação': '🧹', 'conservacao': '🧹',
  'cosern': '⚡', 'energia': '⚡', 'luz': '⚡',
  'manutenção': '🔧', 'manutencao': '🔧', 'reparo': '🔧',
  'água': '💧', 'agua': '💧', 'caern': '💧',
  'segurança': '🔒', 'seguranca': '🔒', 'portaria': '🔒',
  'administração': '📋', 'administracao': '📋', 'taxa': '📋',
  'desinsetização': '🪲', 'desinsetizacao': '🪲', 'dedetização': '🪲', 'dedetizacao': '🪲', 'pragas': '🪲',
  'jardim': '🌿', 'jardinagem': '🌿',
  'elevador': '🛗',
  'internet': '📡', 'telecom': '📡',
  'compras': '🛒', 'mercado': '🛒', 'supermercado': '🛒',
};

function tickerIcon(cat) {
  const k = cat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (const [key, icon] of Object.entries(TICKER_ICONS)) {
    if (k.includes(key)) return icon;
  }
  return '📌';
}

function renderTicker() {
  const container = document.getElementById('semestral-cards');
  if (!container || dadosDespesas.length === 0) return;

  // Últimos 6 meses a partir de mesSel/anoSel
  const janelas = [];
  let m = mesSel, a = anoSel;
  for (let i = 0; i < 6; i++) {
    janelas.push({ mes: m, ano: a });
    m--; if (m < 0) { m = 11; a--; }
  }

  const mesInicio = janelas[janelas.length - 1];
  const mesFim    = janelas[0];
  set('semestral-periodo', `${MESES[mesInicio.mes]}/${mesInicio.ano} – ${MESES[mesFim.mes]}/${mesFim.ano}`);

  // Soma por categoria em cada mês da janela
  const totaisPorCat = {};
  const mesesComDados = new Set();

  dadosDespesas.forEach(d => {
    if (!d.dataParts) return;
    const dm = parseInt(d.dataParts[1]) - 1;
    const da = parseInt(d.dataParts[2]);
    const pertence = janelas.some(j => j.mes === dm && j.ano === da);
    if (!pertence) return;
    const key = `${da}-${dm}`;
    mesesComDados.add(key);
    const cat = d.categoria || 'Outros';
    totaisPorCat[cat] = (totaisPorCat[cat] || {});
    totaisPorCat[cat][key] = (totaisPorCat[cat][key] || 0) + d.valor;
  });

  const numMeses = Math.max(mesesComDados.size, 1);

  const itens = Object.entries(totaisPorCat)
    .map(([cat, porMes]) => {
      const total = Object.values(porMes).reduce((s, v) => s + v, 0);
      return { cat, media: total / numMeses, total };
    })
    .filter(x => x.media > 0)
    .sort((a, b) => b.media - a.media);

  if (itens.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-style:italic;font-size:0.8rem">Sem dados no período</div>`;
    return;
  }

  const cores = ['#667eea','#11998e','#f7971e','#ff758c','#4facfe','#a18cd1','#fddb92','#d4fc79'];
  container.innerHTML = itens.map(({ cat, media, total }, i) => `
    <div style="
      background:var(--surface2,var(--surface));
      border:1px solid var(--border);
      border-radius:10px;
      padding:12px 16px;
      min-width:140px;
      flex:1 1 140px;
      border-top:3px solid ${cores[i % cores.length]};
    ">
      <div style="font-size:1.4rem;margin-bottom:4px">${tickerIcon(cat)}</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px">${cat}</div>
      <div style="font-size:1.05rem;font-weight:700;color:var(--text)">${moeda(media)}<span style="font-size:0.65rem;color:var(--text-muted);font-weight:400">/mês</span></div>
      <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px">Total: ${moeda(total)}</div>
    </div>`).join('');
}

let dreChart;

function renderDRE() {
  const ano = anoSel;
  set('dre-subtitle', `Demonstrativo de Resultado do Exercício · ${ano}`);
  set('dre-ano-label', `${ano}`);
  set('dre-chart-label', `${ano}`);

  const recMeses  = MESES.map((_,i) => dadosReceitas.reduce((s,r) => s + r.valores[i], 0));
  const despMeses = MESES.map((_,i) => despMesAtual(dadosDespesas, i, ano).reduce((s,d) => s + d.valor, 0));
  const saldoMeses = recMeses.map((r,i) => r - despMeses[i]);

  let acum = saldoAnterior;
  const acumMeses = saldoMeses.map(s => { acum += s; return acum; });

  const totalRec  = recMeses.reduce((a,b) => a+b, 0);
  const totalDesp = despMeses.reduce((a,b) => a+b, 0);
  const totalSaldo = totalRec - totalDesp;
  const caixaFinal = acumMeses[mesSel];

  set('dre-kpi-rec',  moeda(totalRec));
  set('dre-kpi-rec-sub', `Jan a ${MESES[mesSel]}/${ano}`);
  set('dre-kpi-desp', moeda(totalDesp));
  set('dre-kpi-desp-sub', `${despMeses.filter(v=>v>0).length} mese(s) com despesas`);
  set('dre-kpi-saldo', moeda(totalSaldo));
  set('dre-kpi-saldo-sub', totalSaldo >= 0 ? '✓ Positivo' : '⚠ Negativo');
  set('dre-kpi-caixa', moeda(caixaFinal));
  set('dre-kpi-caixa-sub', `Acumulado até ${MESES[mesSel]}`);

  // Tabela
  const tbody = document.getElementById('tbody-dre');
  tbody.innerHTML = MESES.map((m, i) => {
    const temDados = recMeses[i] > 0 || despMeses[i] > 0;
    const isCur = i === mesSel;
    const sClass = saldoMeses[i] >= 0 ? 'trend-up' : 'trend-down';
    const aClass = acumMeses[i]  >= 0 ? 'trend-up' : 'trend-down';
    return `<tr class="${isCur ? 'dre-cur' : ''}">
      <td>${m}/${ano}</td>
      <td style="text-align:right" class="trend-up">${temDados ? moeda(recMeses[i]) : '—'}</td>
      <td style="text-align:right" class="${despMeses[i]>0?'trend-down':''}">${temDados ? moeda(despMeses[i]) : '—'}</td>
      <td style="text-align:right" class="${sClass}">${temDados ? moeda(saldoMeses[i]) : '—'}</td>
      <td style="text-align:right" class="${aClass}">${temDados ? moeda(acumMeses[i]) : '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('tfoot-dre').innerHTML = `<tr>
    <td>Total</td>
    <td style="text-align:right;color:var(--c-receitas)">${moeda(totalRec)}</td>
    <td style="text-align:right;color:var(--c-despesas)">${moeda(totalDesp)}</td>
    <td style="text-align:right" class="${totalSaldo>=0?'trend-up':'trend-down'}">${moeda(totalSaldo)}</td>
    <td style="text-align:right" class="${caixaFinal>=0?'trend-up':'trend-down'}">${moeda(caixaFinal)}</td>
  </tr>`;

  // Gráfico de linha
  const ctx = document.getElementById('chart-dre');
  if (!ctx) return;
  if (dreChart) dreChart.destroy();

  const mesesComDados = MESES.filter((_,i) => recMeses[i] > 0 || despMeses[i] > 0 || i === 0);
  const idxs = MESES.map((_,i) => i).filter(i => recMeses[i] > 0 || despMeses[i] > 0 || i === 0);

  dreChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: idxs.map(i => MESES[i]),
      datasets: [
        {
          label: 'Saldo Acumulado',
          data: idxs.map(i => acumMeses[i]),
          borderColor: 'rgba(102,126,234,0.9)',
          backgroundColor: 'rgba(102,126,234,0.1)',
          borderWidth: 2, tension: 0.4, fill: true, pointRadius: 4,
          pointBackgroundColor: idxs.map(i => acumMeses[i] >= 0 ? 'rgba(102,126,234,0.9)' : 'rgba(255,100,100,0.9)')
        },
        {
          label: 'Receitas',
          data: idxs.map(i => recMeses[i]),
          borderColor: 'rgba(17,153,142,0.8)',
          backgroundColor: 'transparent',
          borderWidth: 1.5, tension: 0.4, pointRadius: 3, borderDash: [4,3]
        },
        {
          label: 'Despesas',
          data: idxs.map(i => despMeses[i]),
          borderColor: 'rgba(247,151,30,0.8)',
          backgroundColor: 'transparent',
          borderWidth: 1.5, tension: 0.4, pointRadius: 3, borderDash: [4,3]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: tColor(), font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${moeda(ctx.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: tColor() }, grid: { color: gColor() } },
        y: { ticks: { color: tColor(), callback: v => 'R$' + (v/1000).toFixed(1).replace('.',',') + 'k' }, grid: { color: ctx => ctx.tick.value === 0 ? '#aaa' : gColor(), lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1 } }
      }
    }
  });
}

// ── Simulação de Obras ────────────────────────────────────────
const OBRAS_LS_KEY = 'condo_obras_v1';
let obrasConfig = { taxaMensal: 0, numUnidades: 0, despesaMedia: 0, reservaInicial: 0, obras: [] };
let obrasChartInst = null;
let obrasInicializado = false;

function obrasLoad() {
  try {
    const s = localStorage.getItem(OBRAS_LS_KEY);
    if (s) { obrasConfig = JSON.parse(s); obrasInicializado = true; }
  } catch(e) {}
}

function obrasSave() {
  try { localStorage.setItem(OBRAS_LS_KEY, JSON.stringify(obrasConfig)); } catch(e) {}
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatMeses(m) {
  if (!isFinite(m) || m <= 0) return '—';
  const anos = Math.floor(m / 12), mes = m % 12;
  const a  = anos > 0 ? `${anos} ano${anos !== 1 ? 's' : ''}` : '';
  const me = mes  > 0 ? `${mes} ${mes !== 1 ? 'meses' : 'mês'}` : '';
  return [a, me].filter(Boolean).join(' e ');
}

function obrasDataFutura(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.','');
}

function obrasCalcTempos(obras, sobraMensal, reserva) {
  // Para cada obra, calcula meses até conclusão (sequencial, considerando reserva)
  let cumVal = 0;
  const res = Math.max(reserva || 0, 0);
  return obras.map(o => {
    cumVal += o.valor;
    const need  = Math.max(cumVal - res, 0);
    const meses = sobraMensal > 0 ? (need > 0 ? Math.ceil(need / sobraMensal) : 0) : (need > 0 ? Infinity : 0);
    return { meses, label: meses === 0 ? 'Já possível ✓' : obrasDataFutura(meses) };
  });
}

function obrasGetCaixaAtual() {
  if (!dadosReceitas.length) return 0;
  const recM  = MESES.map((_,i) => dadosReceitas.reduce((s,r) => s + r.valores[i], 0));
  const despM = MESES.map((_,i) => despMesAtual(dadosDespesas, i, anoSel).reduce((s,d) => s + d.valor, 0));
  let acum = saldoAnterior;
  return recM.reduce((_, r, i) => { acum += r - despM[i]; return acum; }, 0)[mesSel] ??
    recM.map((r,i) => { acum += r - despM[i]; return acum; })[mesSel] ?? 0;
}

function renderObras() {
  // Sugerir valores iniciais a partir dos dados do Sheets se ainda não configurado
  if (!obrasInicializado && dadosReceitas.length > 0) {
    obrasInicializado = true;
    const totalMes = dadosReceitas.reduce((s,r) => s + r.valores[mesSel], 0);
    const nUnid = dadosReceitas.length;
    obrasConfig.numUnidades  = nUnid;
    obrasConfig.taxaMensal   = nUnid > 0 ? Math.round(totalMes / nUnid) : 0;
    const despVals = MESES.map((_,i) => despMesAtual(dadosDespesas, i, anoSel).reduce((s,d)=>s+d.valor,0));
    const comDesp  = despVals.filter(v=>v>0);
    obrasConfig.despesaMedia = comDesp.length > 0 ? Math.round(comDesp.reduce((a,b)=>a+b,0) / comDesp.length) : 0;
    // Puxar saldo em caixa atual da DRE como reserva inicial
    const recM  = MESES.map((_,i) => dadosReceitas.reduce((s,r) => s + r.valores[i], 0));
    const despM = MESES.map((_,i) => despMesAtual(dadosDespesas, i, anoSel).reduce((s,d)=>s+d.valor,0));
    let acum = saldoAnterior;
    const acumMeses = recM.map((r,i) => { acum += r - despM[i]; return acum; });
    obrasConfig.reservaInicial = Math.max(Math.round(acumMeses[mesSel] || 0), 0);
  }

  const { taxaMensal, numUnidades, despesaMedia, reservaInicial, obras } = obrasConfig;
  const receitaMensal = taxaMensal * numUnidades;
  const sobraMensal   = receitaMensal - despesaMedia;

  // Campos de entrada (só atualiza se não estiver em foco)
  [['obras-taxa', taxaMensal], ['obras-unidades', numUnidades], ['obras-despesa', despesaMedia], ['obras-reserva', reservaInicial]].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return;
    el.value = val > 0 ? val : '';
  });

  set('obras-receita-calc', moeda(receitaMensal));
  const sobraEl = document.getElementById('obras-sobra-calc');
  if (sobraEl) {
    sobraEl.textContent = moeda(sobraMensal);
    sobraEl.style.color = sobraMensal >= 0 ? 'var(--c-obras)' : 'var(--c-despesas)';
  }

  // KPIs
  const totalObrasVal = obras.reduce((s,o)=>s+o.valor, 0);
  const needTotal     = Math.max(totalObrasVal - (reservaInicial || 0), 0);
  const tempoTotal    = sobraMensal > 0 && needTotal > 0 ? Math.ceil(needTotal / sobraMensal) : (totalObrasVal > 0 && (reservaInicial||0) >= totalObrasVal ? 0 : 0);
  set('obras-kpi-sobra',      moeda(sobraMensal));
  set('obras-kpi-sobra-sub',  sobraMensal >= 0 ? 'disponível por mês' : '⚠ despesa maior que receita');
  set('obras-kpi-total',      String(obras.length));
  set('obras-kpi-valor',      moeda(totalObrasVal));
  const jaOk = totalObrasVal > 0 && (reservaInicial||0) >= totalObrasVal;
  set('obras-kpi-tempo',      jaOk ? 'Já possível ✓' : tempoTotal > 0 ? formatMeses(tempoTotal) : obras.length === 0 ? '—' : sobraMensal <= 0 ? '∞' : '—');
  set('obras-kpi-tempo-sub',  jaOk ? 'reserva cobre todas as obras' : tempoTotal > 0 ? `${tempoTotal} meses · ${obrasDataFutura(tempoTotal)}` : 'para todas as obras');

  // Tabela de obras
  const tbody = document.getElementById('tbody-obras');
  if (tbody) {
    if (obras.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhuma obra cadastrada. Clique em "+ Adicionar Obra".</td></tr>';
    } else {
      const tempos = obrasCalcTempos(obras, sobraMensal, reservaInicial);
      tbody.innerHTML = obras.map((o, i) => {
        const t = tempos[i];
        const prazoLabel = !isFinite(t.meses) ? '∞' : t.meses === 0 ? '—' : formatMeses(t.meses);
        return `<tr>
          <td><input class="obras-inline-input" data-field="nome" data-idx="${i}" value="${escHtml(o.nome)}" placeholder="Nome da obra"></td>
          <td style="text-align:right"><input class="obras-inline-input" data-field="valor" data-idx="${i}" value="${o.valor > 0 ? o.valor : ''}" type="number" min="0" step="0.01" placeholder="0,00" style="width:110px;text-align:right"></td>
          <td style="text-align:right;color:var(--text-muted);font-size:0.75rem;white-space:nowrap">${prazoLabel}</td>
          <td style="text-align:right;font-size:0.75rem;font-weight:600;color:var(--c-obras);white-space:nowrap">${t.label}</td>
          <td style="text-align:right;padding-right:4px"><button class="btn-icon obras-del-btn" data-idx="${i}" title="Remover" style="width:26px;height:26px;font-size:0.75rem;color:var(--c-inadimplencia);border-color:transparent">✕</button></td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('.obras-inline-input').forEach(inp => {
        inp.addEventListener('blur', () => {
          const idx = parseInt(inp.dataset.idx);
          if (inp.dataset.field === 'nome')  obrasConfig.obras[idx].nome  = inp.value.trim();
          if (inp.dataset.field === 'valor') obrasConfig.obras[idx].valor = parseFloat(inp.value) || 0;
          obrasSave(); renderObras();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });

      tbody.querySelectorAll('.obras-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          obrasConfig.obras.splice(parseInt(btn.dataset.idx), 1);
          obrasSave(); renderObras();
        });
      });
    }
  }

  obrasRenderProgresso(sobraMensal);
  obrasRenderChart(sobraMensal);
}

function obrasRenderProgresso(sobraMensal) {
  const { obras } = obrasConfig;
  const tanksEl   = document.getElementById('obras-tanks');
  const sliderEl  = document.getElementById('obras-slider');
  const labelEl   = document.getElementById('obras-slider-label');
  if (!tanksEl || !sliderEl || !labelEl) return;

  const reserva       = obrasConfig.reservaInicial || 0;
  const totalObrasVal = obras.reduce((s,o)=>s+o.valor, 0);
  const needTotal     = Math.max(totalObrasVal - reserva, 0);
  const tempoMax      = sobraMensal > 0 && needTotal > 0 ? Math.ceil(needTotal / sobraMensal) : 24;
  sliderEl.max        = Math.max(tempoMax + 6, 12);
  const mes           = parseInt(sliderEl.value);
  const acumulado     = reserva + (sobraMensal > 0 ? sobraMensal * mes : 0);
  labelEl.textContent = `Mês ${mes} · ${moeda(Math.max(acumulado, 0))} acumulado`;

  if (obras.length === 0) {
    tanksEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;font-style:italic">Adicione obras para ver o progresso.</span>';
    return;
  }

  const TANK_COLORS = ['#a29bfe','#fd79a8','#fdcb6e','#00cec9','#6c5ce7','#e17055','#55efc4','#74b9ff'];
  const temposCalc = obrasCalcTempos(obras, sobraMensal, reserva);
  let resto = acumulado;
  tanksEl.innerHTML = obras.map((o, i) => {
    const pct    = o.valor > 0 ? Math.min(Math.max(resto / o.valor, 0), 1) : 0;
    const cor    = pct >= 1 ? '#48bb78' : TANK_COLORS[i % TANK_COLORS.length];
    const tc     = temposCalc[i];
    const status = pct >= 1 ? `✓ ${tc.label}` : tc.meses > 0 ? tc.label : '—';
    resto = Math.max(resto - o.valor, 0);
    return `<div class="obra-tank">
      <div class="obra-tank-nome" title="${escHtml(o.nome || `Obra ${i+1}`)}">${escHtml(o.nome || `Obra ${i+1}`)}</div>
      <div class="obra-tank-meta">${moeda(o.valor)}</div>
      <div class="obra-tank-wrap"><div class="obra-tank-fill" style="height:${Math.round(pct*100)}%;background:${cor}"></div></div>
      <div class="obra-tank-pct" style="color:${cor}">${Math.round(pct*100)}%</div>
      <div class="obra-tank-status">${status}</div>
    </div>`;
  }).join('');
}

function obrasRenderChart(sobraMensal) {
  const { obras } = obrasConfig;
  const ctx = document.getElementById('chart-obras');
  if (!ctx) return;
  if (obrasChartInst) { obrasChartInst.destroy(); obrasChartInst = null; }

  const reserva       = obrasConfig.reservaInicial || 0;
  const totalObrasVal = obras.reduce((s,o)=>s+o.valor, 0);
  const needTotal     = Math.max(totalObrasVal - reserva, 0);
  const nMeses = sobraMensal > 0 && needTotal > 0
    ? Math.min(Math.ceil(needTotal / sobraMensal) + 4, 120)
    : 24;
  const labels    = Array.from({length: nMeses+1}, (_,i) => i === 0 ? 'Início' : `M${i}`);
  const saldoData = labels.map((_,i) => reserva + (sobraMensal > 0 ? sobraMensal * i : 0));

  const OBRA_COLORS = ['#a29bfe','#fd79a8','#fdcb6e','#00cec9','#6c5ce7','#e17055','#55efc4','#74b9ff'];
  const metaDatasets = [];
  let acumMeta = 0;
  obras.forEach((o, i) => {
    acumMeta += o.valor;
    const cor = OBRA_COLORS[i % OBRA_COLORS.length];
    metaDatasets.push({
      label: o.nome || `Obra ${i+1}`,
      data: labels.map(() => acumMeta),
      borderColor: cor, backgroundColor: 'transparent',
      borderWidth: 1.5, borderDash: [6,4], pointRadius: 0, tension: 0
    });
  });

  obrasChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Saldo Acumulado',
          data: saldoData,
          borderColor: 'rgba(162,155,254,0.9)',
          backgroundColor: 'rgba(162,155,254,0.1)',
          borderWidth: 2.5, tension: 0.3, fill: true, pointRadius: 0
        },
        ...metaDatasets
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: tColor(), font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${moeda(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: tColor(), maxTicksLimit: 13 }, grid: { color: gColor() } },
        y: { ticks: { color: tColor(), callback: v => 'R$'+(v/1000).toFixed(1).replace('.',',')+' k' }, grid: { color: gColor() } }
      }
    }
  });
}

function obrasInicializarEventos() {
  function onParam() {
    obrasConfig.taxaMensal    = parseFloat(document.getElementById('obras-taxa').value)      || 0;
    obrasConfig.numUnidades   = parseInt(document.getElementById('obras-unidades').value)    || 0;
    obrasConfig.despesaMedia  = parseFloat(document.getElementById('obras-despesa').value)   || 0;
    obrasConfig.reservaInicial = parseFloat(document.getElementById('obras-reserva').value)  || 0;
    obrasSave(); renderObras();
  }
  document.getElementById('obras-taxa')?.addEventListener('input', onParam);
  document.getElementById('obras-unidades')?.addEventListener('input', onParam);
  document.getElementById('obras-despesa')?.addEventListener('input', onParam);
  document.getElementById('obras-reserva')?.addEventListener('input', onParam);

  document.getElementById('btn-add-obra')?.addEventListener('click', () => {
    obrasConfig.obras.push({ nome: '', valor: 0 });
    obrasSave(); renderObras();
    setTimeout(() => {
      const inputs = document.querySelectorAll('#tbody-obras .obras-inline-input[data-field="nome"]');
      if (inputs.length) inputs[inputs.length-1].focus();
    }, 50);
  });

  document.getElementById('btn-limpar-obras')?.addEventListener('click', () => {
    if (confirm('Remover todas as obras cadastradas? Esta ação não pode ser desfeita.')) {
      obrasConfig.obras = [];
      obrasSave(); renderObras();
    }
  });

  document.getElementById('obras-slider')?.addEventListener('input', () => {
    const sobra = (obrasConfig.taxaMensal * obrasConfig.numUnidades) - obrasConfig.despesaMedia;
    obrasRenderProgresso(sobra);
  });

  document.getElementById('btn-pdf-obras')?.addEventListener('click', gerarPDFObras);
}

function gerarPDFObras() {
  if (!window.jspdf) { alert('Biblioteca PDF não carregada. Recarregue a página.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const { taxaMensal, numUnidades, despesaMedia, reservaInicial, obras } = obrasConfig;
  const receitaMensal = taxaMensal * numUnidades;
  const sobraMensal   = receitaMensal - despesaMedia;
  const totalObrasVal = obras.reduce((s,o)=>s+o.valor, 0);
  const needTotal     = Math.max(totalObrasVal - (reservaInicial||0), 0);
  const tempoTotal    = sobraMensal > 0 && needTotal > 0 ? Math.ceil(needTotal / sobraMensal) : 0;
  const tempos        = obrasCalcTempos(obras, sobraMensal, reservaInicial||0);
  const dataGer       = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const W = 210, mg = 16, cw = W - mg * 2;
  const C = {
    primary: [102,126,234], dark:  [26,32,44],   gray:  [113,128,150],
    lgray:   [226,232,240], surf:  [248,250,252], white: [255,255,255],
    green:   [72,187,120],  red:   [252,129,129], obras: [162,155,254]
  };

  function pgHeader(subtitle) {
    const PW = doc.internal.pageSize.getWidth();
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 25, 'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
    doc.text('Controle Condominial', mg, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Simulacao de Obras`, mg, 17.5);
    doc.text(`Gerado: ${dataGer}`, PW - mg, 17.5, { align: 'right' });
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(pdfStr(subtitle), mg, 35);
    doc.setDrawColor(...C.primary); doc.setLineWidth(0.6);
    doc.line(mg, 37, PW - mg, 37);
    return 45;
  }

  function kpiBox(x, y, w, h, label, value, sub, accent) {
    doc.setFillColor(...C.surf);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    doc.setFillColor(...accent);
    doc.rect(x, y, 3, h, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text(pdfStr(label).toUpperCase(), x + 6, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C.dark);
    doc.text(pdfStr(value), x + 6, y + 15);
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gray); doc.text(pdfStr(sub), x + 6, y + 21); }
  }

  // ── Página 1: Resumo ──
  let y = pgHeader('Plano de Obras — Resumo');

  const kw = (cw - 6) / 2, kh = 26;
  kpiBox(mg,          y, kw, kh, 'Receita Mensal',  moeda(receitaMensal), `${numUnidades} unidades × ${moeda(taxaMensal)}`, C.green);
  kpiBox(mg + kw + 6, y, kw, kh, 'Despesa Media Mensal', moeda(despesaMedia), 'media informada', [247,151,30]);
  y += kh + 4;
  kpiBox(mg,          y, kw, kh, 'Sobra Mensal', moeda(sobraMensal), sobraMensal >= 0 ? 'disponivel por mes' : 'negativo', sobraMensal >= 0 ? C.obras : C.red);
  kpiBox(mg + kw + 6, y, kw, kh, 'Reserva Inicial (Caixa)', moeda(reservaInicial||0), 'saldo atual em caixa', C.primary);
  y += kh + 4;
  kpiBox(mg,          y, kw, kh, 'Total das Obras', moeda(totalObrasVal), `${obras.length} obra(s)`, [247,151,30]);
  kpiBox(mg + kw + 6, y, kw, kh, 'Prazo Total', tempoTotal > 0 ? formatMeses(tempoTotal) : (totalObrasVal <= (reservaInicial||0) ? 'Ja possivel' : '—'), tempoTotal > 0 ? `${tempoTotal} meses sequenciais` : '', C.obras);
  y += kh + 10;

  // Gráfico
  const chartCanvas = document.getElementById('chart-obras');
  if (chartCanvas) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text('Evolucao do Saldo Acumulado', mg, y); y += 4;
    const imgData = chartCanvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', mg, y, cw, 55); y += 59;
  }

  // ── Página 2: Lista de obras ──
  doc.addPage();
  y = pgHeader('Lista de Obras Simuladas');

  if (obras.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...C.gray);
    doc.text('Nenhuma obra cadastrada.', mg, y);
  } else {
    doc.autoTable({
      startY: y,
      head: [['#', 'Nome da Obra', 'Valor Estimado', 'Prazo', 'Conclusao Estimada']],
      body: obras.map((o, i) => {
        const t = tempos[i];
        return [
          String(i + 1),
          pdfStr(o.nome || `Obra ${i+1}`),
          moeda(o.valor),
          !isFinite(t.meses) ? '∞' : t.meses === 0 ? '—' : formatMeses(t.meses),
          pdfStr(t.label)
        ];
      }),
      margin: { left: mg, right: mg },
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: C.dark, valign: 'middle' },
      headStyles: { fillColor: C.obras, textColor: [255,255,255], fontStyle: 'bold', valign: 'middle' },
      columnStyles: { 0: { cellWidth: 12, halign: 'center' } },
      alternateRowStyles: { fillColor: C.surf }
    });
  }

  doc.save(`simulacao-obras-${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.pdf`);
}

obrasLoad();

function renderTudo() {
  renderDashboard();
  renderReceitas();
  renderDespesas();
  renderInadimplencia();
  renderComunicados();
  renderTicker();
  renderDRE();
  renderObras();
  renderContatos();
}

// ── Saldo anterior (ano precedente completo) ──────────────────
async function calcularSaldoAnterior(ano) {
  try {
    const anoAnt = ano - 1;
    const opts = [...document.getElementById('sel-ano').options];
    if (!opts.some(o => parseInt(o.value) === anoAnt)) { saldoAnterior = 0; return; }
    const rowsR = await fetchSheet(`Receitas ${anoAnt}`);
    const recAnterior = parseReceitas(rowsR);
    const recTotal = recAnterior.reduce((s, r) => s + r.valores.reduce((a, b) => a + b, 0), 0);
    const despTotal = dadosDespesas
      .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoAnt)
      .reduce((s, d) => s + d.valor, 0);
    saldoAnterior = recTotal - despTotal;
  } catch(e) {
    saldoAnterior = 0;
  }
}

// ── Anos anteriores (para somar dívidas antigas na Inadimplência) ──
let dadosAnosAnteriores = {}; // { 2026: [{unidade, valores, isentos}], ... }

async function carregarAnosAnteriores(ano, forcar) {
  dadosAnosAnteriores = {};
  const anos = [...document.getElementById('sel-ano').options]
    .map(o => parseInt(o.value)).filter(y => y < ano);
  await Promise.all(anos.map(async y => {
    try {
      if (forcar) localStorage.removeItem(cacheKey(`Receitas ${y}`));
      dadosAnosAnteriores[y] = parseReceitas(await fetchSheetCached(`Receitas ${y}`));
    } catch (e) { /* ano sem dados: ignora */ }
  }));
}

// ── Cache localStorage ────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function cacheKey(sheet) { return `condo_cache_v3_${SHEET_ID}_${sheet}`; }

function cacheSet(sheet, rows) {
  try {
    localStorage.setItem(cacheKey(sheet), JSON.stringify({ ts: Date.now(), rows }));
  } catch(e) {}
}

function cacheGet(sheet) {
  try {
    const item = localStorage.getItem(cacheKey(sheet));
    if (!item) return null;
    const { ts, rows } = JSON.parse(item);
    if (Date.now() - ts > CACHE_TTL) return null;
    return rows;
  } catch(e) { return null; }
}

function cacheTimestamp(sheet) {
  try {
    const item = localStorage.getItem(cacheKey(sheet));
    if (!item) return null;
    return JSON.parse(item).ts;
  } catch(e) { return null; }
}

async function fetchSheetCached(sheetName) {
  const cached = cacheGet(sheetName);
  if (cached) return cached;
  const rows = await fetchSheet(sheetName);
  cacheSet(sheetName, rows);
  return rows;
}

function mostrarIndicadorCache(sheets) {
  const tsList = sheets.map(s => cacheTimestamp(s)).filter(Boolean);
  const el = document.getElementById('cache-indicator');
  if (!el) return;
  if (tsList.length === sheets.length) {
    const ts = Math.min(...tsList);
    const d = new Date(ts);
    const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `dados de ${dia} ${hhmm}`;
    el.title = 'Dados em cache. Clique em Atualizar para recarregar.';
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

// ── Carregar dados ────────────────────────────────────────────
function parseContatos(rows) {
  // Expected columns: Nome | Cargo | Categoria | Telefone | Email | Empresa | Observação
  return rows.slice(1).map(r => ({
    nome:      (r[0] || '').trim(),
    cargo:     (r[1] || '').trim(),
    categoria: (r[2] || '').trim(),
    telefone:  (r[3] || '').trim(),
    email:     (r[4] || '').trim(),
    empresa:   (r[5] || '').trim(),
    obs:       (r[6] || '').trim(),
  })).filter(c => c.nome);
}

function renderContatos() {
  const tbody = document.getElementById('contatos-tbody');
  const catSel = document.getElementById('contatos-cat');
  if (!tbody) return;

  const categorias = [...new Set(dadosContatos.map(c => c.categoria).filter(Boolean))].sort();
  const catAtual = catSel.value;
  catSel.innerHTML = '<option value="">Todas as categorias</option>' +
    categorias.map(c => `<option value="${c}" ${c === catAtual ? 'selected' : ''}>${c}</option>`).join('');

  filtrarContatos();
}

function filtrarContatos() {
  const tbody = document.getElementById('contatos-tbody');
  const empty = document.getElementById('contatos-empty');
  const busca = (document.getElementById('contatos-busca').value || '').toLowerCase();
  const cat   = document.getElementById('contatos-cat').value;

  const lista = dadosContatos.filter(c => {
    const matchCat  = !cat || c.categoria === cat;
    const matchText = !busca || [c.nome, c.cargo, c.empresa, c.email].some(f => f.toLowerCase().includes(busca));
    return matchCat && matchText;
  });

  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map((c, i) => `
      <tr style="border-bottom:1px solid var(--border);${i % 2 === 0 ? '' : 'background:rgba(0,0,0,0.02)'}">
        <td style="padding:10px 12px;font-weight:600;color:var(--text)">${c.nome}</td>
        <td style="padding:10px 12px;color:var(--text-muted)">${c.cargo}</td>
        <td style="padding:10px 12px">
          ${c.categoria ? `<span style="padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(229,62,156,0.1);color:#e53e9c">${c.categoria}</span>` : ''}
        </td>
        <td style="padding:10px 12px;color:var(--text-muted)">${c.empresa || '—'}</td>
        <td style="padding:10px 12px;color:var(--text)">
          ${c.telefone ? `<a href="tel:${c.telefone}" style="color:var(--primary);text-decoration:none">${c.telefone}</a>` : '—'}
        </td>
        <td style="padding:10px 12px">
          ${c.email ? `<a href="mailto:${c.email}" style="color:var(--primary);text-decoration:none">${c.email}</a>` : '—'}
        </td>
        <td style="padding:10px 12px;color:var(--text-muted);font-size:0.8rem">${c.obs || ''}</td>
      </tr>`).join('');
  }
}

async function carregar(forcarAtualizacao = false) {
  const sheets = [`Receitas ${anoSel}`, 'Despesas', 'Config', 'Comunicados', 'Contatos'];
  if (forcarAtualizacao) sheets.forEach(s => localStorage.removeItem(cacheKey(s)));

  document.getElementById('loading').classList.remove('hidden');
  try {
    const [rowsR, rowsD, rowsC, rowsComm, rowsCont] = await Promise.all([
      fetchSheetCached(`Receitas ${anoSel}`),
      fetchSheetCached('Despesas'),
      fetchSheetCached('Config').catch(() => []),
      fetchSheetCached('Comunicados').catch(() => []),
      fetchSheetCached('Contatos').catch(() => [])
    ]);
    const isentosMap = parseConfig(rowsC);
    dadosReceitas = parseReceitas(rowsR, isentosMap);
    dadosDespesas = parseDespesas(rowsD);
    dadosComunicados = parseComunicados(rowsComm);
    dadosContatos = parseContatos(rowsCont);
    await calcularSaldoAnterior(anoSel);
    await carregarAnosAnteriores(anoSel, forcarAtualizacao);
    buildMapaUnidades();
    renderTudo();
    mostrarIndicadorCache(sheets);
  } catch(e) {
    alert('Erro ao carregar dados: ' + e.message);
    console.error(e);
  }
  document.getElementById('loading').classList.add('hidden');
}

// ── Navegação ─────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current', 'page');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    window.location.hash = tab;
    if (tab === 'fundo') renderFundo();
    if (tab === 'obras') renderObras();
  });
});

// Restaura hash
const hash = location.hash.replace('#','');
if (hash) { const b = document.querySelector(`[data-tab="${hash}"]`); if (b) b.click(); }

// ── Filtros ───────────────────────────────────────────────────
document.getElementById('sel-mes').addEventListener('change', function() {
  mesSel = parseInt(this.value); renderTudo();
});
document.getElementById('sel-ano').addEventListener('change', async function() {
  anoSel = parseInt(this.value); await carregar();
});
document.getElementById('btn-refresh').addEventListener('click', () => { resetRefreshTimer(); inicializarAnos().then(() => carregar(true)); });

// Auto-refresh a cada 5 minutos com countdown
const REFRESH_INTERVAL = 5 * 60; // segundos
let refreshSecsLeft = REFRESH_INTERVAL;
const timerEl = document.getElementById('auto-refresh-timer');

function formatSecs(s) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `↻ ${m}:${ss}`;
}

function resetRefreshTimer() {
  refreshSecsLeft = REFRESH_INTERVAL;
}

setInterval(() => {
  refreshSecsLeft--;
  if (refreshSecsLeft <= 0) {
    resetRefreshTimer();
    carregar(true);
  }
  timerEl.textContent = formatSecs(refreshSecsLeft);
}, 1000);

timerEl.textContent = formatSecs(refreshSecsLeft);

document.getElementById('fil-rec-mes').addEventListener('change', renderReceitas);
document.getElementById('fil-rec-status').addEventListener('change', renderReceitas);
document.getElementById('fil-desp-cat').addEventListener('change', renderDespesas);
document.getElementById('fil-desp-status').addEventListener('change', renderDespesas);
document.getElementById('btn-csv-rec').addEventListener('click', exportarReceitasCSV);
document.getElementById('btn-csv-desp').addEventListener('click', exportarDespesasCSV);


// ── Mobile sidebar toggle ──────────────────────────────────────
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebar-overlay');
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
document.getElementById('btn-menu').addEventListener('click', () => {
  sidebar.classList.toggle('open'); overlay.classList.toggle('open');
});
overlay.addEventListener('click', closeSidebar);
sidebar.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', closeSidebar));

// ── Menu "⋮" (celular) ────────────────────────────────────────
const btnMore = document.getElementById('btn-more');
const headerActions = document.getElementById('header-actions');
function closeMoreMenu() { headerActions.classList.remove('open'); btnMore.setAttribute('aria-expanded', 'false'); }
btnMore.addEventListener('click', e => {
  e.stopPropagation();
  const open = headerActions.classList.toggle('open');
  btnMore.setAttribute('aria-expanded', open ? 'true' : 'false');
});
headerActions.querySelectorAll('button').forEach(b => b.addEventListener('click', closeMoreMenu));
document.addEventListener('click', e => { if (!headerActions.contains(e.target)) closeMoreMenu(); });

// ── Tamanho da letra (acessibilidade) ─────────────────────────
const FS_NIVEIS = [90, 100, 115, 130, 150];
let fsIdx = 1;
try { const v = parseInt(localStorage.getItem('blocoi-fs'), 10); if (v >= 0 && v < FS_NIVEIS.length) fsIdx = v; } catch(e) {}
function aplicarFonte() {
  document.documentElement.style.setProperty('--fs', FS_NIVEIS[fsIdx] + '%');
  document.getElementById('btn-fs-down').disabled = fsIdx === 0;
  document.getElementById('btn-fs-up').disabled = fsIdx === FS_NIVEIS.length - 1;
  try { localStorage.setItem('blocoi-fs', fsIdx); } catch(e) {}
}
document.getElementById('btn-fs-down').addEventListener('click', () => { if (fsIdx > 0) { fsIdx--; aplicarFonte(); } });
document.getElementById('btn-fs-up').addEventListener('click', () => { if (fsIdx < FS_NIVEIS.length - 1) { fsIdx++; aplicarFonte(); } });
aplicarFonte();

// ── Dark mode ─────────────────────────────────────────────────
document.getElementById('dark-toggle').addEventListener('click', () => {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  document.getElementById('dark-toggle').textContent = dark ? '🌙' : '☀️';
  renderGaugeAdimplencia(); renderTendenciaInad();
  renderBarChart(); renderDoughnut(); renderDRE(); if (fundoChart) { fundoChart.destroy(); fundoChart=null; renderFundo(); }
});

// ── Busca ─────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  document.querySelectorAll('tbody tr:not(.empty-row)').forEach(row => {
    row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
});

// ── PDF ───────────────────────────────────────────────────────
function pdfStr(s) {
  return String(s || '');
}

function gerarPDF() {
  if (!window.jspdf) {
    alert('Biblioteca PDF não carregada. Recarregue a página e tente novamente.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const mesLabel   = MESES_FULL[mesSel];
  const periodo    = pdfStr(`${mesLabel}/${anoSel}`);
  const dataGer    = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const W = 210, mg = 16, cw = W - mg * 2;
  const C = {
    primary: [102,126,234], dark:  [26,32,44],   gray:   [113,128,150],
    lgray:   [226,232,240], surf:  [248,250,252], white:  [255,255,255],
    green:   [72,187,120],  red:   [252,129,129], orange: [247,151,30],
    teal:    [17,153,142],  pink:  [255,117,140]
  };
  const catCores = [C.primary, C.teal, C.orange, C.pink, [79,172,254]];
  let pageNum = 0;

  function pgHeader(title) {
    pageNum++;
    const PW = doc.internal.pageSize.getWidth();
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 25, 'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
    doc.text('Controle Condominial', mg, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Prestação de Contas  -  ${periodo}`, mg, 17.5);
    doc.text(`Gerado: ${dataGer}  |  Pág. ${pageNum}`, PW - mg, 17.5, { align: 'right' });
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(pdfStr(title), mg, 35);
    doc.setDrawColor(...C.primary); doc.setLineWidth(0.6);
    doc.line(mg, 37, PW - mg, 37);
    return 45;
  }

  function kpiBox(x, y, w, h, label, value, sub, accent) {
    doc.setFillColor(...C.surf);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    doc.setFillColor(...accent);
    doc.rect(x, y, 3, h, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text(pdfStr(label).toUpperCase(), x + 6, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C.dark);
    doc.text(pdfStr(value), x + 6, y + 15.5);
    if (sub) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
      doc.text(pdfStr(sub), x + 6, y + 22);
    }
  }

  function bar(x, y, w, h, pct, color) {
    doc.setFillColor(...C.lgray);
    doc.roundedRect(x, y, w, h, h/2, h/2, 'F');
    if (pct > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(x, y, Math.max(w * pct / 100, h), h, h/2, h/2, 'F');
    }
  }

  function sep(y) {
    doc.setDrawColor(...C.lgray); doc.setLineWidth(0.2);
    doc.line(mg, y, doc.internal.pageSize.getWidth() - mg, y);
    return y + 8;
  }

  function blockTitle(label, y) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text(pdfStr(label), mg, y);
    return y + 7;
  }

  // ── Dados ──
  const recMes     = dadosReceitas.reduce((s, r) => s + r.valores[mesSel], 0);
  const pagasUnits = dadosReceitas.filter(r => r.valores[mesSel] > 0 || (r.isentos && r.isentos[mesSel]));
  const totalUnits = dadosReceitas.length;
  const despData   = despMesAtual(dadosDespesas, mesSel, anoSel);
  const totalDesp  = despData.reduce((s, d) => s + d.valor, 0);
  const saldoMes   = recMes - totalDesp;
  const recAcum    = dadosReceitas.reduce((s, r) => s + r.valores.slice(0, mesSel + 1).reduce((a, b) => a + b, 0), 0);
  const despAcum   = dadosDespesas
    .filter(d => d.dataParts && parseInt(d.dataParts[2]) === anoSel && parseInt(d.dataParts[1]) - 1 <= mesSel)
    .reduce((s, d) => s + d.valor, 0);
  const saldoCaixa  = recAcum - despAcum + saldoAnterior;
  const pctAdim     = totalUnits > 0 ? (pagasUnits.length / totalUnits * 100) : 0;
  const mesJaVenceu = mesVencido(mesSel, anoSel);
  // inadimplência do mês selecionado (consistente com adimplência do resumo)
  const inadMesCount = mesJaVenceu ? (totalUnits - pagasUnits.length) : 0;
  const taxaInad     = totalUnits > 0 ? (inadMesCount / totalUnits * 100) : 0;
  // lista acumulada usada na página 4 (todos os meses em aberto até mesSel)
  // Meses em aberto de uma unidade num ano (rows = receitas daquele ano), com valor estimado
  const abertosDoAno = (rows, unidade, ano, ateMes, etiqueta) => {
    const r = rows.find(x => x.unidade === unidade);
    if (!r) return { mb: [], valor: 0 };
    const mb = MESES.slice(0, ateMes + 1).map((m, i) => ({ mes: etiqueta ? `${m}/${ano}` : m, idx: i }))
      .filter(({ idx }) => r.valores[idx] === 0 && !(r.isentos && r.isentos[idx]) && mesVencido(idx, ano));
    const valor = mb.reduce((sum, { idx }) => {
      const taxaMes = r.valores.filter(v => v > 0).slice(-1)[0]
        || rows.filter(x => x.unidade !== unidade).map(x => x.valores[idx]).find(v => v > 0)
        || 0;
      return sum + taxaMes;
    }, 0);
    return { mb, valor };
  };
  const anosAntigos = Object.keys(dadosAnosAnteriores).map(Number).sort((a, b) => a - b);
  const inadList    = dadosReceitas.map(r => {
    // anos anteriores primeiro (com o ano na etiqueta), depois o ano atual
    const partes = [
      ...anosAntigos.map(y => abertosDoAno(dadosAnosAnteriores[y], r.unidade, y, 11, true)),
      abertosDoAno(dadosReceitas, r.unidade, anoSel, mesSel, false)
    ];
    return {
      unidade: r.unidade,
      mesesAbertos: partes.flatMap(p => p.mb),
      valorAberto: partes.reduce((s, p) => s + p.valor, 0)
    };
  }).filter(r => r.mesesAbertos.length > 0);

  // ══ PAGE 1: RESUMO ══
  let y = pgHeader(`Resumo Financeiro - ${periodo}`);

  const kw = (cw - 6) / 2, kh = 28;
  kpiBox(mg,          y, kw, kh, `Saldo em Caixa (Jan-${MESES[mesSel]})`, moeda(saldoCaixa),
    saldoCaixa >= 0 ? 'Positivo' : 'Negativo', saldoCaixa >= 0 ? C.green : C.red);
  kpiBox(mg + kw + 6, y, kw, kh, 'Saldo do Mes', moeda(saldoMes),
    saldoMes >= 0 ? 'Positivo' : 'Negativo', saldoMes >= 0 ? C.green : C.red);
  y += kh + 5;
  kpiBox(mg,          y, kw, kh, `Receitas de ${periodo}`, moeda(recMes),
    `${pagasUnits.length} de ${totalUnits} unidades pagas`, C.teal);
  kpiBox(mg + kw + 6, y, kw, kh, `Despesas de ${periodo}`, moeda(totalDesp),
    `${despData.length} lançamento(s)`, C.orange);
  y += kh + 10;

  y = sep(y);
  y = blockTitle('Adimplência', y);
  const adimColor = pctAdim >= 80 ? C.green : pctAdim >= 60 ? C.orange : C.red;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
  doc.text(pdfStr(`${pagasUnits.length} de ${totalUnits} unidades pagas em ${periodo}`), mg, y);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...adimColor);
  doc.text(`${pctAdim.toFixed(1)}%`, W - mg, y, { align: 'right' });
  y += 5;
  bar(mg, y, cw, 5, pctAdim, adimColor);
  y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  if (mesJaVenceu) {
    const ic = inadMesCount === 0 ? C.green : taxaInad > 20 ? C.red : C.orange;
    doc.setTextColor(...ic);
    doc.text(`Inadimplência: ${taxaInad.toFixed(1)}% (${inadMesCount} unidade(s) em aberto)`, mg, y);
  } else {
    doc.setTextColor(...C.gray);
    doc.text(`Inadimplência: vencimento em 10/${MESES[(mesSel + 1) % 12]}`, mg, y);
  }
  y += 12;

  y = sep(y);
  y = blockTitle('Maiores Despesas por Categoria', y);
  const cats = {};
  despData.forEach(d => { cats[d.categoria] = (cats[d.categoria] || 0) + d.valor; });
  const catsSorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (catsSorted.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.gray);
    doc.text('Sem despesas registradas neste mês.', mg, y);
  } else {
    catsSorted.forEach(([cat, val], i) => {
      const pct = totalDesp > 0 ? (val / totalDesp * 100) : 0;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.dark);
      doc.text(pdfStr(cat), mg, y);
      doc.setFont('helvetica', 'bold');
      doc.text(moeda(val), W - mg, y, { align: 'right' });
      y += 4;
      bar(mg, y, cw, 4, pct, catCores[i % catCores.length]);
      y += 4 + 3;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.gray);
      doc.text(`${pct.toFixed(1)}% do total`, W - mg, y, { align: 'right' });
      y += 7;
    });
  }

  // ══ PAGE 2: RECEITAS ══
  doc.addPage();
  y = pgHeader(`Receitas - ${periodo}`);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
  doc.text(
    pdfStr(`Total: ${moeda(recMes)}   |   Pagas: ${pagasUnits.length}   |   Em aberto: ${totalUnits - pagasUnits.length}`),
    mg, y
  );
  y += 8;
  doc.autoTable({
    startY: y,
    head: [['Unidade', 'Valor', 'Status']],
    body: dadosReceitas.map(r => {
      const v = r.valores[mesSel];
      const isento = r.isentos && r.isentos[mesSel];
      return [pdfStr(nomUnidade(r.unidade)), v > 0 ? moeda(v) : '—', v > 0 ? 'Pago' : isento ? 'Isento' : 'Em aberto'];
    }),
    margin: { left: mg, right: mg },
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: C.dark },
    headStyles: { fillColor: C.teal, textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.surf },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 45, halign: 'right' }, 2: { cellWidth: 'auto', halign: 'center' } },
    didParseCell(data) {
      if (data.column.index === 1) data.cell.styles.halign = 'right';
      if (data.column.index === 2) data.cell.styles.halign = 'center';
      if (data.column.index === 2 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = data.cell.raw === 'Pago' ? [39,103,73] : data.cell.raw === 'Isento' ? [74,85,104] : [197,48,48];
      }
    }
  });

  // ══ PAGE 3: DESPESAS ══
  doc.addPage('a4', 'landscape');
  y = pgHeader(`Despesas - ${periodo}`);
  const pagasTot  = despData.filter(d => d.status === 'Pago').reduce((s, d) => s + d.valor, 0);
  const aPagarTot = despData.filter(d => d.status !== 'Pago').reduce((s, d) => s + d.valor, 0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
  doc.text(pdfStr(`Total: ${moeda(totalDesp)}   |   Pagas: ${moeda(pagasTot)}   |   A pagar: ${moeda(aPagarTot)}`), mg, y);
  y += 8;
  if (despData.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.gray);
    doc.text('Nenhuma despesa registrada neste mês.', mg, y + 6);
  } else {
    doc.autoTable({
      startY: y,
      head: [['Data', 'Categoria', 'Descrição', 'Fornecedor', 'Valor', 'Status']],
      body: despData.map(d => [
        pdfStr(d.data), pdfStr(d.categoria), pdfStr(d.descricao),
        pdfStr(d.fornecedor || '—'), moeda(d.valor), pdfStr(d.status || '—')
      ]),
      margin: { left: mg, right: mg },
      styles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: C.dark, overflow: 'ellipsize' },
      headStyles: { fillColor: C.orange, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: C.surf },
      columnStyles: {
        0: { cellWidth: 22 }, 1: { cellWidth: 28 }, 2: { cellWidth: 'auto' },
        3: { cellWidth: 45, overflow: 'ellipsize' }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 19, halign: 'center' }
      },
      didParseCell(data) {
        if (data.column.index === 4) data.cell.styles.halign = 'right';
        if (data.column.index === 5) data.cell.styles.halign = 'center';
        if (data.column.index === 5 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = (data.cell.raw || '').toLowerCase() === 'pago' ? [39,103,73] : [151,74,10];
        }
      }
    });
  }

  // ══ PAGE 4: INADIMPLÊNCIA ══
  doc.addPage('a4', 'portrait');
  y = pgHeader(`Inadimplência - ${periodo}`);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
  const totalValorAberto = inadList.reduce((s, r) => s + r.valorAberto, 0);
  doc.text(
    inadList.length === 0
      ? 'Nenhuma unidade inadimplente neste período.'
      : `${inadList.length} unidade(s) com pendências   |   Taxa: ${(totalUnits > 0 ? inadList.length / totalUnits * 100 : 0).toFixed(1)}%   |   Total em aberto: ${moeda(totalValorAberto)}`,
    mg, y
  );
  y += 8;
  if (inadList.length === 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.green);
    doc.text('Todas as unidades estão em dia!', mg, y + 6);
  } else {
    doc.autoTable({
      startY: y,
      head: [['Unidade', 'Meses em Aberto', 'Nº de Meses', 'Valor em Aberto']],
      body: inadList.map(r => [
        pdfStr(nomUnidade(r.unidade)),
        r.mesesAbertos.map(m => m.mes).join(', '),
        String(r.mesesAbertos.length),
        r.valorAberto > 0 ? moeda(r.valorAberto) : '—'
      ]),
      foot: [['Total', '', String(inadList.reduce((s, r) => s + r.mesesAbertos.length, 0)), moeda(totalValorAberto)]],
      showFoot: 'lastPage',
      margin: { left: mg, right: mg },
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: C.dark },
      headStyles: { fillColor: C.pink, textColor: [255,255,255], fontStyle: 'bold' },
      footStyles: { fillColor: C.lgray, textColor: C.dark, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.surf },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 30, halign: 'center' }, 3: { cellWidth: 45, halign: 'right' } },
      didParseCell(data) {
        if (data.column.index === 2 && data.section === 'body') {
          const n = parseInt(data.cell.raw || '0');
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = n >= 3 ? [197,48,48] : n >= 2 ? [151,74,10] : C.dark;
        }
        if (data.column.index === 3 && data.section === 'body' && data.cell.raw !== '—') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [197,48,48];
        }
        // columnStyles só se aplica ao body; alinha cabeçalho e rodapé com as colunas
        if (data.column.index === 2) data.cell.styles.halign = 'center';
        if (data.column.index === 3) data.cell.styles.halign = 'right';
      }
    });
  }

  doc.save(pdfStr(`prestacao-contas-${mesLabel}-${anoSel}`) + '.pdf');
}

function gerarPDFDRE() {
  if (!window.jspdf) {
    alert('Biblioteca PDF não carregada. Recarregue a página e tente novamente.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const ano      = anoSel;
  const dataGer  = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const W = 210, mg = 16, cw = W - mg * 2;
  const C = {
    primary: [102,126,234], dark:  [26,32,44],   gray:   [113,128,150],
    lgray:   [226,232,240], surf:  [248,250,252], white:  [255,255,255],
    green:   [72,187,120],  red:   [252,129,129], orange: [247,151,30],
    teal:    [17,153,142],  pink:  [255,117,140]
  };
  let pageNum = 0;

  function pgHeader(title) {
    pageNum++;
    const PW = doc.internal.pageSize.getWidth();
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 25, 'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
    doc.text('Controle Condominial', mg, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`DRE  -  ${ano}`, mg, 17.5);
    doc.text(`Gerado: ${dataGer}  |  Pág. ${pageNum}`, PW - mg, 17.5, { align: 'right' });
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(pdfStr(title), mg, 35);
    doc.setDrawColor(...C.primary); doc.setLineWidth(0.6);
    doc.line(mg, 37, PW - mg, 37);
    return 45;
  }

  function kpiBox(x, y, w, h, label, value, sub, accent) {
    doc.setFillColor(...C.surf);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    doc.setFillColor(...accent);
    doc.rect(x, y, 3, h, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text(pdfStr(label).toUpperCase(), x + 6, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C.dark);
    doc.text(pdfStr(value), x + 6, y + 15.5);
    if (sub) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
      doc.text(pdfStr(sub), x + 6, y + 22);
    }
  }

  // ── Dados ──
  const recMeses   = MESES.map((_,i) => dadosReceitas.reduce((s,r) => s + r.valores[i], 0));
  const despMeses  = MESES.map((_,i) => despMesAtual(dadosDespesas, i, ano).reduce((s,d) => s + d.valor, 0));
  const saldoMeses = recMeses.map((r,i) => r - despMeses[i]);
  let acum = saldoAnterior;
  const acumMeses  = saldoMeses.map(s => { acum += s; return acum; });

  const totalRec   = recMeses.reduce((a,b) => a+b, 0);
  const totalDesp  = despMeses.reduce((a,b) => a+b, 0);
  const totalSaldo = totalRec - totalDesp;
  const caixaFinal = acumMeses[mesSel];

  // ══ PAGE 1: RESUMO ══
  let y = pgHeader(`Demonstrativo de Resultado do Exercício — ${ano}`);

  const kw = (cw - 6) / 2, kh = 28;
  kpiBox(mg,          y, kw, kh, `Total de Receitas (Jan–${MESES[mesSel]})`, moeda(totalRec),
    `${recMeses.filter(v=>v>0).length} mese(s) com receitas`, C.teal);
  kpiBox(mg + kw + 6, y, kw, kh, `Total de Despesas (Jan–${MESES[mesSel]})`, moeda(totalDesp),
    `${despMeses.filter(v=>v>0).length} mese(s) com despesas`, C.orange);
  y += kh + 5;
  kpiBox(mg,          y, kw, kh, 'Resultado do Ano', moeda(totalSaldo),
    totalSaldo >= 0 ? 'Positivo' : 'Negativo', totalSaldo >= 0 ? C.green : C.red);
  kpiBox(mg + kw + 6, y, kw, kh, `Saldo em Caixa (acum. até ${MESES[mesSel]})`, moeda(caixaFinal),
    caixaFinal >= 0 ? 'Positivo' : 'Negativo', caixaFinal >= 0 ? C.green : C.red);
  y += kh + 8;

  // Gráfico
  const chartCanvas = document.getElementById('chart-dre');
  if (chartCanvas) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.dark);
    doc.text('Evolução do Saldo Acumulado', mg, y);
    y += 4;
    const imgData = chartCanvas.toDataURL('image/png', 1.0);
    const chartH = 55;
    doc.addImage(imgData, 'PNG', mg, y, cw, chartH);
    y += chartH + 4;
  }

  // ══ PAGE 2: TABELA MENSAL ══
  doc.addPage();
  y = pgHeader(`Resumo Mensal — ${ano}`);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.dark);
  doc.text('Resumo Mensal', mg, y);
  y += 6;

  const tableBody = MESES.map((m, i) => {
    const temDados = recMeses[i] > 0 || despMeses[i] > 0;
    return [
      pdfStr(`${m}/${ano}`),
      temDados ? moeda(recMeses[i]) : '—',
      temDados ? moeda(despMeses[i]) : '—',
      temDados ? moeda(saldoMeses[i]) : '—',
      temDados ? moeda(acumMeses[i]) : '—',
    ];
  });

  doc.autoTable({
    startY: y,
    head: [['Mês', 'Receitas', 'Despesas', 'Resultado', 'Acumulado']],
    body: tableBody,
    foot: [['Total', moeda(totalRec), moeda(totalDesp), moeda(totalSaldo), moeda(caixaFinal)]],
    showFoot: 'lastPage',
    margin: { left: mg, right: mg },
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: C.dark },
    headStyles: { fillColor: C.primary, textColor: [255,255,255], fontStyle: 'bold' },
    footStyles: { fillColor: C.lgray, textColor: C.dark, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.surf },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 'auto', halign: 'right' },
      2: { cellWidth: 'auto', halign: 'right' },
      3: { cellWidth: 'auto', halign: 'right' },
      4: { cellWidth: 'auto', halign: 'right' },
    },
    didParseCell(data) {
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        const col = data.column.index;
        if (col === 1) data.cell.styles.textColor = [17,153,142];
        if (col === 2 && recMeses[rowIdx] > 0) data.cell.styles.textColor = [197,90,17];
        if (col === 3 && data.cell.raw !== '—') {
          const val = saldoMeses[rowIdx];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = val >= 0 ? [39,103,73] : [197,48,48];
        }
        if (col === 4 && data.cell.raw !== '—') {
          const val = acumMeses[rowIdx];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = val >= 0 ? [39,103,73] : [197,48,48];
        }
        if (rowIdx === mesSel) data.cell.styles.fillColor = [230,235,255];
      }
      // columnStyles só se aplica ao body; alinha cabeçalho e rodapé com as colunas
      if (data.column.index >= 1) data.cell.styles.halign = 'right';
    }
  });

  doc.save(pdfStr(`dre-${ano}`) + '.pdf');
}

document.getElementById('btn-pdf').addEventListener('click', gerarPDF);
// ── Impressão ─────────────────────────────────────────────────
function prepararImpressao() {
  const aba = document.querySelector('.nav-btn.active')?.textContent.trim() || '';
  const mes = document.getElementById('sel-mes').selectedOptions[0]?.textContent || '';
  const ano = document.getElementById('sel-ano').value;
  document.getElementById('print-sub').textContent =
    `${aba} · ${mes}/${ano} · Impresso em ${new Date().toLocaleDateString('pt-BR')}`;
}
window.addEventListener('beforeprint', prepararImpressao);
document.getElementById('btn-print').addEventListener('click', () => window.print());

document.getElementById('btn-pdf-dre').addEventListener('click', gerarPDFDRE);

function gerarPDFRegimento() {
  if (!window.jspdf) { alert('Biblioteca PDF não carregada. Recarregue a página.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const mg = 15, pw = 180;
  let y = 20;

  // Cabeçalho
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, 210, 14, 'F');
  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('Regimento Interno', 105, y + 4, { align: 'center' });
  y += 14;

  doc.setDrawColor(200, 200, 200);
  doc.line(mg, y, mg + pw, y);
  y += 8;

  REGIMENTO.forEach((secao, idx) => {
    // Verifica espaço para cabeçalho da seção
    if (y > 265) { doc.addPage(); y = 20; }

    // Número e título da seção
    const tituloLimpo = secao.titulo.replace(/[^\x20-\x7EÀ-ɏ]/g, '').trim();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(102, 126, 234);
    doc.text(`${idx + 1}. ${tituloLimpo}`, mg, y);
    y += 6;

    // Itens
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);

    secao.itens.forEach((item, iIdx) => {
      const linhas = doc.splitTextToSize(`${idx + 1}.${iIdx + 1}. ${item}`, pw - 14);
      if (y + linhas.length * 5 > 280) { doc.addPage(); y = 20; }
      doc.text(linhas, mg + 4, y);
      y += linhas.length * 5 + 2;
    });

    y += 3;
    if (y < 275) {
      doc.setDrawColor(220, 220, 220);
      doc.line(mg, y, mg + pw, y);
    }
    y += 8;
  });

  // Rodapé
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Página ${i} de ${pages}`, 105, 290, { align: 'center' });
  }

  doc.save('regimento-interno.pdf');
}

obrasInicializarEventos();

// ── Init ──────────────────────────────────────────────────────
inicializarAnos().then(() => carregar());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/blocoi/sw.js');
}
