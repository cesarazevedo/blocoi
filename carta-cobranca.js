// ── Carta de cobrança (PDF) ───────────────────────────────────
// Analogia: é como pedir ao sistema "me dê o extrato do devedor". Ele junta
// tudo que está em aberto, separa por ano (uma tabela por ano) e entrega em PDF.
//
// Regra (do Regimento): vencimento dia 10 do mês seguinte. Valores SEM multa e SEM juros.
// A planilha só guarda o que foi PAGO (0 = não pagou). Por isso o valor de cada
// mês em aberto é ESTIMADO pela taxa que as demais unidades pagaram naquele mês.

function cobrancaTaxaDoMes(rows, unidade, idx) {
  // Valor mais comum pago pelas outras unidades naquele mês
  const contagem = {};
  rows.forEach(x => {
    const v = x.valores[idx];
    if (x.unidade !== unidade && v > 0) contagem[v] = (contagem[v] || 0) + 1;
  });
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  if (top) return parseFloat(top[0]);
  // Plano B: último valor pago pela própria unidade naquele ano
  const proprio = rows.find(x => x.unidade === unidade);
  return (proprio && proprio.valores.filter(v => v > 0).slice(-1)[0]) || 0;
}

// Gestão anterior = 2024 até março/2026. Depois disso, gestão atual.
function cobrancaOrigem(ano, idx) {
  return (ano < 2026 || (ano === 2026 && idx <= 2)) ? 'Gestão anterior' : 'Gestão atual';
}

// Junta as DUAS fontes (planilha da gestão atual + dados fixos da gestão anterior).
// Regra anti-duplicidade: o mês só é débito se NENHUMA fonte registrou pagamento
// e pelo menos uma fonte marcou "não pagou" (0). Assim o mesmo mês nunca conta 2 vezes.
// Retorna { anos: [{ano, itens:[...]}], anteriores: {valor, descricao} | null }
function cobrancaDebitosDaUnidade(unidade, hoje = new Date()) {
  const ga = (typeof GESTAO_ANTERIOR !== 'undefined') ? GESTAO_ANTERIOR : null;
  const planilhas = {};
  Object.keys(dadosAnosAnteriores).forEach(y => { planilhas[y] = dadosAnosAnteriores[y]; });
  planilhas[anoSel] = dadosReceitas;

  const anosLista = [...new Set([...Object.keys(planilhas), ...(ga ? Object.keys(ga.anos) : [])].map(Number))].sort((a, b) => a - b);
  const anos = [];

  anosLista.forEach(ano => {
    const rows = planilhas[ano] || [];
    const r = rows.find(x => x.unidade === unidade);
    const gaRec = ga && ga.anos[ano] ? ga.anos[ano].receitas[unidade] : undefined;
    const ateMes = ano === anoSel ? mesSel : 11;
    const itens = [];

    for (let idx = 0; idx <= ateMes; idx++) {
      const gaV = gaRec === 'ISENTO' ? 'ISENTO' : (Array.isArray(gaRec) ? gaRec[idx] : undefined);
      const shV = r ? r.valores[idx] : undefined;
      const isento = gaV === 'ISENTO' || !!(r && r.isentos && r.isentos[idx]);
      const pago = (typeof gaV === 'number' && gaV > 0) || (typeof shV === 'number' && shV > 0);
      const naoPagou = gaV === 0 || shV === 0;
      if (isento || pago || !naoPagou || !mesVencido(idx, ano)) continue;

      const vencimento = new Date(ano, idx + 1, 10);
      const dias = Math.max(0, Math.floor((hoje - vencimento) / 86400000));
      // Valor: taxa do mês na planilha atual; se não houver, mensalidade da gestão anterior
      const valor = (r && cobrancaTaxaDoMes(rows, unidade, idx)) || (typeof GA_MENSALIDADE !== 'undefined' ? GA_MENSALIDADE : 0);
      itens.push({ mes: MESES_FULL[idx], idx, origem: cobrancaOrigem(ano, idx), vencimento, dias, valor });
    }
    if (itens.length) anos.push({ ano, itens });
  });

  // Débito anterior a 2024 informado à parte pela gestão anterior (valor fechado)
  const anteriores = (ga && ga.debito103 && ga.debito103.unidade === unidade)
    ? { valor: ga.debito103.valor, descricao: ga.debito103.descricao } : null;
  return { anos, anteriores };
}

function cobrancaSoma(itens, campo) { return itens.reduce((s, i) => s + i[campo], 0); }
function cobrancaData(d) { return d.toLocaleDateString('pt-BR'); }

function gerarCartaCobranca(unidade) {
  if (!window.jspdf) { alert('Biblioteca PDF não carregada. Recarregue a página e tente novamente.'); return; }
  const { anos, anteriores } = cobrancaDebitosDaUnidade(unidade);
  if (anos.length === 0 && !anteriores) { alert(`A unidade ${unidade} não possui débitos em aberto.`); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, mg = 18;
  const C = { primary: [102,126,234], dark: [26,32,44], gray: [113,128,150], lgray: [226,232,240],
              surf: [248,250,252], red: [197,48,48], white: [255,255,255] };
  const hoje = new Date();
  const todos = anos.flatMap(a => a.itens);
  const vAnt = anteriores ? anteriores.valor : 0;
  const tTotal = cobrancaSoma(todos, 'valor') + vAnt;

  // ── Cabeçalho ──
  doc.setFillColor(...C.primary); doc.rect(0, 0, PW, 28, 'F');
  doc.setTextColor(...C.white); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Controle Condominial', mg, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Administração do Condomínio', mg, 19);
  doc.text(`Emitido em ${cobrancaData(hoje)}`, PW - mg, 19, { align: 'right' });

  doc.setTextColor(...C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('COMUNICADO DE COBRANÇA', mg, 40);
  doc.setDrawColor(...C.primary); doc.setLineWidth(0.6); doc.line(mg, 43, PW - mg, 43);

  doc.setFontSize(11); doc.text(`Unidade: ${unidade}`, mg, 52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const texto =
    `Prezado(a) morador(a) da unidade ${unidade},\n\n` +
    `Em consulta ao controle financeiro do condomínio, identificamos ${todos.length} taxa(s) condominial(is) ` +
    `em aberto${anteriores ? ' e um débito anterior a 2024' : ''}, distribuída(s) em ${anos.length + (anteriores ? 1 : 0)} período(s) ` +
    `(gestão anterior e gestão atual), somando ${moeda(tTotal)} ` +
    `(sem multa e sem juros), posição em ${cobrancaData(hoje)}. Pedimos a gentileza de regularizar a situação.\n\n` +
    `Caso o pagamento já tenha sido feito, por favor desconsidere este comunicado e nos envie o comprovante ` +
    `para que o registro seja atualizado.`;
  const linhas = doc.splitTextToSize(texto, PW - mg * 2);
  doc.text(linhas, mg, 60);
  let y = 60 + linhas.length * 4.6 + 6;

  // ── Resumo geral por ano ──
  const secao = (titulo) => {
    if (y > PH - 50) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C.dark);
    doc.text(titulo, mg, y); y += 3;
  };
  const estiloTabela = {
    margin: { left: mg, right: mg },
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: C.dark },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold' },
    footStyles: { fillColor: C.lgray, textColor: C.dark, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.surf },
    showFoot: 'lastPage'
  };

  secao('Resumo por ano');
  doc.autoTable({
    ...estiloTabela, startY: y,
    head: [['Ano', 'Parcelas em aberto', 'Valor']],
    body: anos.map(a => [String(a.ano), String(a.itens.length), moeda(cobrancaSoma(a.itens, 'valor'))])
      .concat(anteriores ? [['Até 2023', '—', moeda(vAnt)]] : []),
    foot: [['Total', String(todos.length) + (anteriores ? ' + débito anterior' : ''), moeda(tTotal)]],
    didParseCell(d) {
      if (d.column.index === 1) d.cell.styles.halign = 'center';
      if (d.column.index === 2) d.cell.styles.halign = 'right';
    }
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Uma tabela por ano (detalhada) ──
  anos.forEach(a => {
    secao(`Débitos de ${a.ano}`);
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Mês de referência', 'Gestão', 'Vencimento', 'Dias em atraso', 'Valor']],
      body: a.itens.map(i => [i.mes, (i.origem === 'Gestão anterior' ? 'Anterior' : 'Atual'), cobrancaData(i.vencimento), String(i.dias), moeda(i.valor)]),
      foot: [[`Subtotal ${a.ano}`, '', '', '', moeda(cobrancaSoma(a.itens, 'valor'))]],
      didParseCell(d) {
        if (d.column.index === 3) d.cell.styles.halign = 'center';
        if (d.column.index === 4) { d.cell.styles.halign = 'right'; if (d.section !== 'head') d.cell.styles.fontStyle = 'bold'; }
      }
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  if (anteriores) {
    secao('Débito anterior a 2024 (gestão anterior)');
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Descrição', 'Valor']],
      body: [[`Débito registrado pela gestão anterior: ${anteriores.descricao}`, moeda(anteriores.valor)]],
      didParseCell(d) { if (d.column.index === 1) d.cell.styles.halign = 'right'; }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Total geral em destaque ──
  if (y > PH - 55) { doc.addPage(); y = 20; }
  doc.setFillColor(...C.surf); doc.setDrawColor(...C.red); doc.setLineWidth(0.5);
  doc.roundedRect(mg, y, PW - mg * 2, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C.dark);
  doc.text('TOTAL GERAL EM ABERTO', mg + 5, y + 10);
  doc.setFontSize(14); doc.setTextColor(...C.red);
  doc.text(moeda(tTotal), PW - mg - 5, y + 10.5, { align: 'right' });
  y += 24;

  // ── Observações ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.dark);
  doc.text('Como os valores foram calculados', mg, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  const obs = doc.splitTextToSize(
    '• Vencimento: dia 10 do mês seguinte ao de referência (Regimento Interno).\n' +
    '• Os valores são o principal da taxa, sem multa e sem juros.\n' +
    '• O valor original de cada parcela é a taxa paga pelas demais unidades naquele mês; ' +
    'valores aproximados, sujeitos à conferência com o comprovante.\n' +
    '• Débitos da gestão anterior (2024 até mar/2026, parcela de R$ 100) e da gestão atual foram somados; um mesmo mês nunca é contado duas vezes.\n' +
    (anteriores ? '• O débito anterior a 2024 é um valor fechado informado pela gestão anterior.\n' : '') +
    '• Meses isentos ou já pagos não aparecem neste comunicado.', PW - mg * 2);
  doc.setFontSize(8.5);
  if (y + obs.length * 4 > PH - 15) { doc.addPage(); y = 20; }
  doc.text(obs, mg, y);

  // ── Rodapé com paginação ──
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.gray);
    doc.text(`Unidade ${unidade}  |  Pág. ${p} de ${total}`, PW / 2, PH - 8, { align: 'center' });
  }

  // O nome do arquivo é a própria unidade (ex.: 101.pdf), sem caracteres perigosos
  doc.save(`${String(unidade).replace(/[^\w\-]+/g, '_')}.pdf`);
}

// Clique no botão "Gerar carta" da tabela de inadimplência
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-carta]');
  if (btn) gerarCartaCobranca(btn.dataset.carta);
});
