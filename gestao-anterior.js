// ── Gestão anterior ───────────────────────────────────────────
// Prestação de contas da gestão anterior (2024 até março/2026).
// Dados transcritos da planilha "CONDOMÍNIO.xlsx" entregue por ela em 10/11/2026.
// São dados FIXOS (uma "foto" do passado): não vêm da planilha da gestão atual
// e nunca são somados aos números da gestão atual (que começou em março/2026).
//
// Convenções nas receitas (um valor por mês, Jan..Dez):
//   100   = pagou R$ 100
//   0     = não pagou
//   null  = sem registro na planilha
//   'ISENTO' (no lugar do array inteiro) = unidade isenta
// Nas despesas, null = sem lançamento naquele mês.

const GA_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const GA_MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const gaTodos = (v, n = 12) => Array(n).fill(v);
const gaG = (v, d) => ({ v, d });   // despesa "geral": valor + descrição

const GESTAO_ANTERIOR = {
  fonte: 'Planilha "CONDOMÍNIO.xlsx" entregue pela gestão anterior',
  periodo: '2024 até março/2026',
  // Resumo final da planilha
  saldoInicial: 8525.07,        // "Financeiro geral recebido do condomínio"
  saldoInformado: 12899.14,     // saldo que a gestão anterior informou (antes da correção de R$ 8,25)
  correcao: 8.25,               // despesa de jan/2024 que ficou fora da soma da gestão anterior
  debito103: { unidade: '103', valor: 4305.00, descricao: 'condomínio + CAERN', ate: '2023' },

  anos: {
    2024: {
      rotulo: '2024',
      nMeses: 12,
      receitas: {
        '101': gaTodos(100),
        '102': gaTodos(100),
        '103': [...gaTodos(100, 9), 0, 0, 0],
        '104': gaTodos(100),
        '201': gaTodos(100),
        '202': gaTodos(0),
        '203': gaTodos(100),
        '204': gaTodos(100),
        '301': gaTodos(100),
        '302': gaTodos(100),
        '303': 'ISENTO',
        '304': gaTodos(100)
      },
      receitaTotalInformada: 11700.00,
      despesas: {
        limpeza: [200,200,200,200,200,400,400,400,400,400,400,400],
        cosern:  [106.94,106.82,320.43,114.88,121.20,118.29,113.03,111.21,120.07,115.96,113.94,52.81],
        geral: [
          gaG(8.25, 'Impressões'), null, null, null,
          gaG(250, 'Sr. Domingos'),
          gaG(350, 'Sr. Severino'),
          gaG(391, 'Sr. Severino + material'),
          gaG(350, 'Sr. Severino'),
          gaG(550, 'Interfone externo + instalação + material (acionamento do portão externo)'),
          gaG(30, 'Lâmpadas'),
          gaG(32, 'Chaves'),
          gaG(432, 'Taxa do banco')
        ]
      },
      // Totais exatamente como a gestão anterior informou na planilha
      despesaTotal: { limpeza: 3800.00, cosern: 1515.58, geral: 2393.25, total: 7708.83 },
      nota: 'Correção: a despesa de R$ 8,25 (impressões, janeiro/2024) havia ficado fora da soma da gestão anterior (que informou Geral R$ 2.385,00 e total R$ 7.700,58). Ela foi incluída nos totais desta página.'
    },

    2025: {
      rotulo: '2025',
      nMeses: 12,
      receitas: {
        '101': gaTodos(100),
        '102': gaTodos(100),
        '103': gaTodos(0),
        '104': [...gaTodos(100, 5), ...gaTodos(0, 7)],
        '201': [...gaTodos(100, 3), ...gaTodos(0, 9)],
        '202': gaTodos(0),
        '203': gaTodos(100),
        '204': gaTodos(100),
        '301': gaTodos(100),
        '302': gaTodos(100),
        '303': 'ISENTO',
        '304': gaTodos(100)
      },
      receitaTotalInformada: 9200.00,
      despesas: {
        limpeza: [400,400,400,400,400,400,300,472,472,472,236,0],
        cosern:  [263.31,173.25,171.44,188.57,181.85,178.48,238.73,241.84,185.68,253.42,114.15,147.48],
        geral: [
          null, null, null, null,
          gaG(450, 'Desinsetização'),
          gaG(1100, 'Bomba e serviço'),
          null,
          gaG(450, 'Pedreiro'),
          gaG(300, 'Sr. Domingos'),
          null,
          gaG(300, 'Portão + chaves'),
          gaG(432, 'Taxa do banco')
        ]
      },
      despesaTotal: { limpeza: 4352.00, cosern: 2338.20, geral: 3032.00, total: 9722.20 }
    },

    2026: {
      rotulo: '2026 (até março)',
      nMeses: 3,
      receitas: {
        '101': [100, 100, 100],
        '102': [100, null, null],
        '103': [0, null, null],
        '104': [0, null, null],
        '201': [100, null, null],
        '202': [0, null, null],
        '203': [0, null, null],
        '204': [100, 100, null],
        '301': [100, 100, 100],
        '302': [100, null, null],
        '303': ['ISENTO', 'ISENTO', null],
        '304': [100, null, null]
      },
      receitaTotalInformada: 1200.00,
      despesas: {
        limpeza: [null, null, null],
        cosern:  [133.46, null, null],
        geral: [
          gaG(56.20, 'Torneira'),
          gaG(5.49, 'Entrega da torneira'),
          gaG(108, 'Taxa do banco')
        ]
      },
      despesaTotal: { limpeza: 0, cosern: 133.46, geral: 169.69, total: 303.15 },
      nota: 'Em março/2026 a administração passou para a gestão atual. Alguns condôminos pagaram a gestão anterior e outros já pagaram a gestão atual: cada gestão registra apenas o que recebeu.'
    }
  }
};

let gaAnoSel = 2024;

// ── Cálculos ──────────────────────────────────────────────────
function gaSomaReceitas(ano) {
  let s = 0;
  Object.values(ano.receitas).forEach(v => {
    if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'number') s += x; });
  });
  return s;
}

function gaTotalRecursos() {
  const a = GESTAO_ANTERIOR.anos;
  return GESTAO_ANTERIOR.saldoInicial +
    Object.values(a).reduce((s, y) => s + y.receitaTotalInformada, 0);
}

function gaTotalDespesas() {
  return Object.values(GESTAO_ANTERIOR.anos).reduce((s, y) => s + y.despesaTotal.total, 0);
}

// ── Desenho ───────────────────────────────────────────────────
function gaCelulaReceita(v) {
  if (v === 'ISENTO') return '<td class="ga-c ga-isento">Isento</td>';
  if (v === null || v === undefined) return '<td class="ga-c ga-vazio" title="Sem registro">·</td>';
  if (v > 0) return `<td class="ga-c ga-pago">${Math.round(v)}</td>`;
  return '<td class="ga-c ga-nao" title="Não pagou">0</td>';
}

function gaRenderResumo() {
  const g = GESTAO_ANTERIOR;
  const totRec = gaTotalRecursos();
  const totDesp = gaTotalDespesas();
  const linhaAno = (k) => {
    const y = g.anos[k];
    return `<tr><td>+ Receitas de ${y.rotulo}</td><td class="ga-num">${moeda(y.receitaTotalInformada)}</td></tr>`;
  };
  document.getElementById('ga-kpis').innerHTML = `
    <div class="kpi-card" style="--accent:var(--c-anterior)">
      <div class="kpi-label">Saldo da gestão anterior</div>
      <div class="kpi-value">${moeda(totRec - totDesp)}</div>
      <div class="kpi-sub">saldo ao final do período (já com a correção de ${moeda(g.correcao)})</div>
    </div>
    <div class="kpi-card" style="--accent:var(--c-receitas)">
      <div class="kpi-label">Receitas no período</div>
      <div class="kpi-value">${moeda(totRec - g.saldoInicial)}</div>
      <div class="kpi-sub">${g.periodo}</div>
    </div>
    <div class="kpi-card" style="--accent:var(--c-despesas)">
      <div class="kpi-label">Despesas no período</div>
      <div class="kpi-value">${moeda(totDesp)}</div>
      <div class="kpi-sub">${g.periodo}</div>
    </div>
    <div class="kpi-card" style="--accent:var(--c-inadimplencia)">
      <div class="kpi-label">Débito do apto ${g.debito103.unidade}</div>
      <div class="kpi-value">${moeda(g.debito103.valor)}</div>
      <div class="kpi-sub">${g.debito103.descricao} · registrado até ${g.debito103.ate}</div>
    </div>`;

  document.getElementById('ga-balanco').innerHTML = `
    <tr><td>Financeiro geral recebido do condomínio (saldo inicial)</td><td class="ga-num">${moeda(g.saldoInicial)}</td></tr>
    ${linhaAno(2024)}${linhaAno(2025)}${linhaAno(2026)}
    <tr class="ga-sub"><td>= Total de recursos</td><td class="ga-num">${moeda(totRec)}</td></tr>
    <tr><td>− Despesas ${g.periodo}</td><td class="ga-num">${moeda(totDesp)}</td></tr>
    <tr class="ga-total"><td>= Saldo da gestão anterior</td><td class="ga-num">${moeda(totRec - totDesp)}</td></tr>`;
  document.getElementById('ga-correcao').textContent =
    `Correção: a gestão anterior informou saldo de ${moeda(g.saldoInformado)}. Ao somar ${moeda(g.correcao)} de impressões de janeiro/2024, que haviam ficado fora da soma, o saldo é ${moeda(totRec - totDesp)}.`;
}

function gaRenderAno() {
  const y = GESTAO_ANTERIOR.anos[gaAnoSel];
  const meses = GA_MESES.slice(0, y.nMeses);

  document.querySelectorAll('#ga-anos button').forEach(b => {
    const on = parseInt(b.dataset.ano) === gaAnoSel;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  // Receitas por unidade
  const unidades = Object.keys(y.receitas);
  document.getElementById('ga-rec-titulo').textContent = `Receitas por unidade · ${y.rotulo}`;
  document.getElementById('ga-rec-head').innerHTML =
    `<tr><th>Unid.</th>${meses.map(m => `<th class="ga-c">${m}</th>`).join('')}<th class="ga-num">Total</th></tr>`;
  document.getElementById('ga-rec-body').innerHTML = unidades.map(u => {
    const v = y.receitas[u];
    const celulas = v === 'ISENTO'
      ? meses.map(() => gaCelulaReceita('ISENTO')).join('')
      : v.map(gaCelulaReceita).join('');
    const total = Array.isArray(v) ? v.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0) : 0;
    return `<tr><td><strong>${nomUnidade(u)}</strong></td>${celulas}<td class="ga-num">${total > 0 ? moeda(total) : '—'}</td></tr>`;
  }).join('') +
    `<tr class="ga-total"><td colspan="${meses.length + 1}">Total</td><td class="ga-num">${moeda(y.receitaTotalInformada)}</td></tr>`;

  // Despesas por mês
  const d = y.despesas;
  const m = (x) => (x === null || x === undefined) ? '—' : moeda(x);
  document.getElementById('ga-desp-titulo').textContent = `Despesas por mês · ${y.rotulo}`;
  document.getElementById('ga-desp-body').innerHTML = meses.map((nome, i) => {
    const g = d.geral[i];
    const total = (d.limpeza[i] || 0) + (d.cosern[i] || 0) + (g ? g.v : 0);
    return `<tr>
      <td><strong>${GA_MESES_FULL[i]}</strong></td>
      <td class="ga-num">${m(d.limpeza[i])}</td>
      <td class="ga-num">${m(d.cosern[i])}</td>
      <td class="ga-num">${g ? moeda(g.v) : '—'}</td>
      <td class="ga-desc">${g ? g.d : ''}</td>
      <td class="ga-num"><strong>${total > 0 ? moeda(total) : '—'}</strong></td>
    </tr>`;
  }).join('');
  const t = y.despesaTotal;
  document.getElementById('ga-desp-foot').innerHTML = `<tr class="ga-total">
      <td>Total</td>
      <td class="ga-num">${moeda(t.limpeza)}</td>
      <td class="ga-num">${moeda(t.cosern)}</td>
      <td class="ga-num">${moeda(t.geral)}</td>
      <td></td>
      <td class="ga-num">${moeda(t.total)}</td>
    </tr>`;

  const nota = document.getElementById('ga-nota');
  nota.textContent = y.nota || '';
  nota.style.display = y.nota ? 'block' : 'none';
}

function renderGestaoAnterior() {
  gaRenderResumo();
  gaRenderAno();
}

function iniciarGestaoAnterior() {
  document.getElementById('ga-anos').addEventListener('click', e => {
    const b = e.target.closest('button[data-ano]');
    if (!b) return;
    gaAnoSel = parseInt(b.dataset.ano);
    gaRenderAno();
  });
  const voltar = document.getElementById('ga-voltar');
  if (voltar) voltar.addEventListener('click', () => {
    const b = document.querySelector('.nav-btn[data-tab="dashboard"]');
    if (b) b.click();
  });
  // O seletor Mês/Ano do topo só vale para a gestão atual: esconde nesta aba
  const marcarAba = () => document.body.classList.toggle('ga-ativa',
    !!document.querySelector('.nav-btn.active[data-tab="gestao-anterior"]'));
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', marcarAba));
  marcarAba();
  renderGestaoAnterior();
}

if (typeof document !== 'undefined' && document.getElementById('ga-anos')) iniciarGestaoAnterior();
