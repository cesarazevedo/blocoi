// ── Relatório da Simulação de Obras (imagem + texto) ──────────
// Pega o que está cadastrado na aba "Simulação de Obras" e monta um resumo
// pronto para o grupo dos moradores. Imagem e texto usam os MESMOS números
// (função obrasRelDados), então nunca divergem.
// Usa funções auxiliares de analises.js (anRR, anTexto, anDataHora).

function obrasRelDados() {
  const { taxaMensal, numUnidades, despesaMedia, reservaInicial, obras } = obrasConfig;
  const receita = taxaMensal * numUnidades;
  const sobra = receita - despesaMedia;
  const reserva = reservaInicial || 0;
  const tempos = obrasCalcTempos(obras, sobra, reserva);
  const linhas = obras.map((o, i) => {
    const t = tempos[i];
    const semPrevisao = !isFinite(t.meses);
    return {
      nome: (o.nome || '').trim() || `Obra ${i + 1}`,
      valor: o.valor,
      prazo: semPrevisao ? 'sem previsão' : t.meses === 0 ? 'já possível' : formatMeses(t.meses),
      conclusao: semPrevisao ? '—' : t.meses === 0 ? 'com a reserva atual' : t.label
    };
  });
  const total = obras.reduce((s, o) => s + o.valor, 0);
  const ultimo = tempos[tempos.length - 1];
  let tempoTotal = '—', conclusaoTotal = '';
  if (ultimo) {
    if (!isFinite(ultimo.meses)) { tempoTotal = 'sem previsão'; conclusaoTotal = 'a sobra mensal não cobre as obras'; }
    else if (ultimo.meses === 0) { tempoTotal = 'já possível'; conclusaoTotal = 'a reserva cobre todas as obras'; }
    else { tempoTotal = formatMeses(ultimo.meses); conclusaoTotal = ultimo.label; }
  }
  return { taxaMensal, numUnidades, receita, despesaMedia, sobra, reserva, linhas, total, tempoTotal, conclusaoTotal };
}

// ── Texto (WhatsApp usa *negrito* e _itálico_) ────────────────
function obrasRelTexto() {
  const d = obrasRelDados();
  if (d.linhas.length === 0) return 'Cadastre ao menos uma obra na simulação para gerar o relatório.';
  const t = [
    '🏗️ *Simulação de Obras*',
    'Planejamento · Controle Condominial',
    '',
    '💰 *Premissas*',
    `• Receita mensal: ${moeda(d.receita)} (${d.numUnidades} unidades × ${moeda(d.taxaMensal)})`,
    `• Despesa média mensal: ${moeda(d.despesaMedia)}`,
    `• Sobra mensal: ${moeda(d.sobra)}`,
    `• Reserva inicial (caixa): ${moeda(d.reserva)}`,
    '',
    '🔨 *Obras*'
  ];
  d.linhas.forEach((l, i) => {
    t.push(`${i + 1}. *${l.nome}* — ${moeda(l.valor)}`);
    t.push(`   Prazo: ${l.prazo} · Conclusão: ${l.conclusao}`);
  });
  t.push('', `📌 *Total das obras:* ${moeda(d.total)}`);
  t.push(`⏱️ *Tempo para concluir todas:* ${d.tempoTotal}${d.conclusaoTotal ? ` (${d.conclusaoTotal})` : ''}`);
  t.push('', `_Gerado em ${anDataHora()}_`);
  return t.join('\n');
}

// ── Imagem ────────────────────────────────────────────────────
function obrasRelRender() {
  const cv = document.getElementById('obras-rel-canvas');
  if (!cv) return;
  const txtEl = document.getElementById('obras-rel-texto');
  if (txtEl) txtEl.value = obrasRelTexto();

  const d = obrasRelDados();
  const W = 1080, P = 60, LH = 96;
  const cardObrasH = 120 + Math.max(d.linhas.length, 1) * LH;
  const H = 820 + cardObrasH + 140;
  cv.width = W; cv.height = H;            // redimensionar também limpa o desenho
  const ctx = cv.getContext('2d');
  const verde = '#11998e', verm = '#e53e5c', cinza = '#4a5568', roxo = '#667eea';

  ctx.fillStyle = '#f0f4f8'; ctx.fillRect(0, 0, W, H);

  // cabeçalho
  const g = ctx.createLinearGradient(0, 0, W, 260);
  g.addColorStop(0, '#667eea'); g.addColorStop(1, '#764ba2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
  anTexto(ctx, 'CONTROLE CONDOMINIAL', P, 90, { size: 28, peso: 700, cor: 'rgba(255,255,255,.8)' });
  anTexto(ctx, 'Simulação de Obras', P, 170, { size: 66, peso: 700, cor: '#fff', maxW: W - 2 * P });
  anTexto(ctx, 'Planejamento para os moradores', P, 222, { size: 28, cor: 'rgba(255,255,255,.85)' });

  // premissas (4 quadros)
  const tw = (W - 2 * P - 24) / 2;
  [
    ['RECEITA MENSAL', d.receita, `${d.numUnidades} unidades × ${moeda(d.taxaMensal)}`, verde],
    ['DESPESA MÉDIA MENSAL', d.despesaMedia, 'média dos gastos', '#f7971e'],
    ['SOBRA MENSAL', d.sobra, 'disponível para obras', d.sobra >= 0 ? roxo : verm],
    ['RESERVA INICIAL', d.reserva, 'saldo em caixa', verde]
  ].forEach(([rot, val, sub, cor], i) => {
    const x = P + (i % 2) * (tw + 24), y = 300 + Math.floor(i / 2) * 170;
    ctx.fillStyle = '#fff'; anRR(ctx, x, y, tw, 146, 24); ctx.fill();
    ctx.fillStyle = cor; anRR(ctx, x, y, 10, 146, 5); ctx.fill();
    anTexto(ctx, rot, x + 34, y + 44, { size: 22, peso: 700, cor: cinza, maxW: tw - 60 });
    anTexto(ctx, moeda(val), x + 34, y + 95, { size: 44, peso: 700, cor, maxW: tw - 60 });
    anTexto(ctx, sub, x + 34, y + 129, { size: 20, cor: cinza, maxW: tw - 60 });
  });

  // total + tempo
  ctx.fillStyle = '#fff'; anRR(ctx, P, 650, W - 2 * P, 150, 24); ctx.fill();
  const meio = W / 2;
  anTexto(ctx, 'TOTAL DAS OBRAS', P + 40, 702, { size: 24, peso: 700, cor: cinza });
  anTexto(ctx, moeda(d.total), P + 40, 770, { size: 52, peso: 700, cor: '#1a202c', maxW: meio - P - 60 });
  anTexto(ctx, 'TEMPO PARA CONCLUIR TODAS', meio + 20, 702, { size: 24, peso: 700, cor: cinza, maxW: meio - P - 60 });
  anTexto(ctx, d.tempoTotal, meio + 20, 760, { size: 40, peso: 700, cor: roxo, maxW: meio - P - 60 });
  if (d.conclusaoTotal) anTexto(ctx, d.conclusaoTotal, meio + 20, 788, { size: 22, cor: cinza, maxW: meio - P - 60 });

  // lista de obras
  const yc = 830;
  ctx.fillStyle = '#fff'; anRR(ctx, P, yc, W - 2 * P, cardObrasH, 24); ctx.fill();
  anTexto(ctx, 'OBRAS PLANEJADAS', P + 40, yc + 60, { size: 26, peso: 700, cor: cinza });
  if (d.linhas.length === 0) {
    anTexto(ctx, 'Nenhuma obra cadastrada', P + 40, yc + 150, { size: 32, cor: cinza });
  } else {
    d.linhas.forEach((l, i) => {
      const y = yc + 120 + i * LH;
      if (i > 0) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(P + 40, y - 34, W - 2 * P - 80, 2); }
      ctx.fillStyle = AN_CORES[i % AN_CORES.length]; anRR(ctx, P + 40, y - 14, 36, 36, 18); ctx.fill();
      anTexto(ctx, String(i + 1), P + 58, y + 12, { size: 22, peso: 700, cor: '#fff', alinh: 'center' });
      anTexto(ctx, l.nome, P + 96, y + 8, { size: 32, peso: 700, cor: '#1a202c', maxW: 520 });
      anTexto(ctx, `${l.prazo} · ${l.conclusao}`, P + 96, y + 40, { size: 22, cor: cinza, maxW: 520 });
      anTexto(ctx, moeda(l.valor), W - P - 40, y + 14, { size: 34, peso: 700, cor: '#1a202c', alinh: 'right', maxW: 340 });
    });
  }

  anTexto(ctx, `Simulação com base nos valores atuais · gerado em ${anDataHora()}`,
    W / 2, H - 56, { size: 22, cor: cinza, alinh: 'center', maxW: W - 2 * P });
}

function obrasRelBlob() {
  return new Promise(res => document.getElementById('obras-rel-canvas').toBlob(res, 'image/png'));
}

async function obrasRelBaixar() {
  obrasRelRender();
  const blob = await obrasRelBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'simulacao-obras.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function obrasRelCompartilhar() {
  obrasRelRender();
  const blob = await obrasRelBlob();
  const file = new File([blob], 'simulacao-obras.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Simulação de Obras' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  obrasRelBaixar(); // sem compartilhamento nativo (ex.: computador): baixa a imagem
}

async function obrasRelCopiar() {
  const btn = document.getElementById('btn-obras-rel-copiar');
  obrasRelRender(); // atualiza a hora de geração
  const txt = obrasRelTexto();
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
    const el = document.getElementById('obras-rel-texto');
    el.select();
    try { ok = document.execCommand('copy'); } catch (e2) { /* sem cópia automática */ }
    window.getSelection().removeAllRanges();
  }
  const antes = btn.textContent;
  btn.textContent = ok ? '✅ Copiado!' : '⚠️ Selecione e copie manualmente';
  setTimeout(() => { btn.textContent = antes; }, 2200);
}

async function obrasRelCompartilharTexto() {
  const txt = obrasRelTexto();
  if (navigator.share) {
    try { await navigator.share({ text: txt }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  obrasRelCopiar();
}

document.getElementById('btn-obras-rel-compartilhar')?.addEventListener('click', obrasRelCompartilhar);
document.getElementById('btn-obras-rel-baixar')?.addEventListener('click', obrasRelBaixar);
document.getElementById('btn-obras-rel-copiar')?.addEventListener('click', obrasRelCopiar);
document.getElementById('btn-obras-rel-texto')?.addEventListener('click', obrasRelCompartilharTexto);

// Primeira montagem (o app já pode ter desenhado a aba antes deste arquivo carregar)
if (typeof obrasConfig !== 'undefined') obrasRelRender();
