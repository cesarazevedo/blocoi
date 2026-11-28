// ── Manutenções preventivas ───────────────────────────────────
// Não usa aba nova: lê a aba "Despesas" que já existe e procura palavras-chave.
// A última despesa que combina com o serviço vira a "última vez feito".
// Próxima data = última + intervalo (em meses).
//   🟢 em dia (mais de 30 dias)  🟡 vence em até 30 dias  🔴 atrasado  ⚪ sem registro
//
// Para incluir um serviço, adicione uma linha em MANUT_REGRAS:
//   nome, icone, meses (de quanto em quanto tempo repete), termos (basta UMA aparecer, sem acento)
//   e, se quiser, exige (TODAS precisam aparecer; serve para não confundir com outros serviços)

const MANUT_REGRAS = [
  { nome: 'Recarga de extintores', icone: '🧯', meses: 12, termos: ['recarga'], exige: ['extintor'] },
  { nome: 'Desinsetização',        icone: '🐜', meses: 6,  termos: ['desinsetiz', 'dedetiz'] }
];
const MANUT_AVISO_DIAS = 30;

// ── Pendências (aba "Pendencias" da planilha) ─────────────────
// Colunas: Data | Serviço | Situação | Motivo | Próximo passo | Previsão
// Situação: Suspenso, Em andamento ou Resolvido. Resolvidos ficam como histórico.
let dadosPendencias = [];

function parsePendencias(rows) {
  return (rows || []).slice(1).filter(r => (r[1] || '').trim()).map(r => {
    const sit = manutNorm(r[2]).trim();
    const status = sit.startsWith('resolv') ? 'resolvido' : sit.startsWith('em and') ? 'andamento' : 'suspenso';
    const p = String(r[0] || '').trim().split('/');
    const dt = p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
    return { data: (r[0] || '').trim(), dt: dt && !isNaN(dt) ? dt : null, servico: r[1].trim(), situacao: (r[2] || '').trim(),
             motivo: (r[3] || '').trim(), passo: (r[4] || '').trim(), previsao: (r[5] || '').trim(), status };
  });
}

function renderPendencias() {
  const box = document.getElementById('pend-lista');
  if (!box) return 0;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ordem = { suspenso: 0, andamento: 1, resolvido: 2 };
  const itens = [...dadosPendencias].sort((a, b) => ordem[a.status] - ordem[b.status] || (a.dt || 0) - (b.dt || 0));
  const abertas = itens.filter(i => i.status !== 'resolvido');
  const resolvidas = itens.filter(i => i.status === 'resolvido');
  const selo = { suspenso: '🔴 Suspenso', andamento: '🟡 Em andamento', resolvido: '✅ Resolvido' };
  const card = i => {
    const dias = i.dt ? Math.max(0, Math.round((hoje - i.dt) / 86400000)) : null;
    const reg = i.data ? `Registrado em ${escHtml(i.data)}${dias !== null && i.status !== 'resolvido' ? ` (há ${dias} dia${dias === 1 ? '' : 's'})` : ''}` : '';
    const extra = [i.passo && `Próximo passo: ${escHtml(i.passo)}`, i.previsao && `Previsão: ${escHtml(i.previsao)}`].filter(Boolean).join(' &nbsp;|&nbsp; ');
    return `<div class="card manut-card pend-${i.status}">
      <div class="manut-topo"><span class="manut-nome">${escHtml(i.servico)}</span><span class="manut-status">${selo[i.status]}</span></div>
      ${i.motivo ? `<div class="manut-datas">Motivo: ${escHtml(i.motivo)}</div>` : ''}
      ${extra ? `<div class="manut-datas">${extra}</div>` : ''}
      ${reg ? `<div class="manut-origem">${reg}</div>` : ''}</div>`;
  };
  box.innerHTML = (abertas.length ? abertas.map(card).join('') : '<p class="manut-origem">Nenhuma pendência no momento. 👍</p>') +
    (resolvidas.length ? `<details class="pend-resolvidas"><summary>Já resolvidas (${resolvidas.length})</summary>${resolvidas.map(card).join('')}</details>` : '');
  return abertas.length;
}

const manutNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function manutData(d) {
  const p = d.dataParts;
  if (!p || p.length < 3) return null;
  const dt = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
  return isNaN(dt) ? null : dt;
}

function manutSomaMeses(dt, n) {
  const r = new Date(dt.getFullYear(), dt.getMonth() + n, 1);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dt.getDate(), ultimo));
  return r;
}

const manutFmt = dt => dt.toLocaleDateString('pt-BR');

function calcularManutencoes() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return MANUT_REGRAS.map(regra => {
    let ult = null, desp = null;
    (dadosDespesas || []).forEach(d => {
      const txt = manutNorm(`${d.categoria} ${d.descricao} ${d.fornecedor}`);
      if (!regra.termos.some(t => txt.includes(t))) return;
      if (regra.exige && !regra.exige.every(t => txt.includes(t))) return;
      const dt = manutData(d);
      if (dt && dt <= hoje && (!ult || dt > ult)) { ult = dt; desp = d; }
    });
    if (!ult) return { regra, status: 'sem', ordem: 1 };
    const prox = manutSomaMeses(ult, regra.meses);
    const dias = Math.round((prox - hoje) / 86400000);
    const status = dias < 0 ? 'atrasado' : dias <= MANUT_AVISO_DIAS ? 'breve' : 'ok';
    return { regra, ult, prox, dias, desp, status, ordem: { atrasado: 0, breve: 0.5, sem: 1, ok: 2 }[status] };
  }).sort((a, b) => a.ordem - b.ordem || (a.dias ?? 0) - (b.dias ?? 0));
}

function renderManutencoes() {
  const box = document.getElementById('manut-lista');
  if (!box) return;
  const itens = calcularManutencoes();
  const rotulo = {
    ok:       i => ['🟢', 'Em dia'],
    breve:    i => ['🟡', i.dias === 0 ? 'Vence hoje' : `Vence em ${i.dias} dia${i.dias === 1 ? '' : 's'}`],
    atrasado: i => ['🔴', `Atrasado há ${-i.dias} dia${i.dias === -1 ? '' : 's'}`],
    sem:      i => ['⚪', 'Sem registro nas despesas']
  };
  box.innerHTML = itens.map(i => {
    const [bolinha, texto] = rotulo[i.status](i);
    const datas = i.ult
      ? `Última: ${manutFmt(i.ult)} &nbsp;|&nbsp; Próxima: ${manutFmt(i.prox)}`
      : `Nenhuma despesa encontrada com: ${escHtml(i.regra.termos.join(', '))}`;
    const origem = i.desp
      ? `<div class="manut-origem">Baseado em: ${escHtml(i.desp.data)} — ${escHtml(i.desp.descricao)}${i.desp.fornecedor ? ' (' + escHtml(i.desp.fornecedor) + ')' : ''}</div>`
      : '';
    return `<div class="card manut-card manut-${i.status}">
      <div class="manut-topo"><span class="manut-nome">${i.regra.icone} ${escHtml(i.regra.nome)}</span>
        <span class="manut-status">${bolinha} ${texto}</span></div>
      <div class="manut-datas">${datas} &nbsp;|&nbsp; Repete a cada ${i.regra.meses} meses</div>${origem}</div>`;
  }).join('');
  const aten = itens.filter(i => i.status === 'atrasado' || i.status === 'breve').length + renderPendencias();
  set('badge-manut', aten || '');
  const b = document.getElementById('badge-manut');
  if (b) b.style.display = aten ? '' : 'none';
}
