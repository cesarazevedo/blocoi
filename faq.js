// ── Perguntas frequentes ──────────────────────────────────────
// Alimentada pela aba "FAQ" da planilha. Colunas:
//   Pergunta | Resposta | Categoria | Ativo
// (Ativo: TRUE ou vazio = aparece; FALSE = escondida. Categoria vazia vira "Geral".)
// As perguntas "Sobre o site" abaixo são fixas e valem sempre.
// Tudo aqui é geral para o condomínio; nada identifica unidade ou morador.

let dadosFaq = [];   // [{pergunta, resposta, categoria}]

const FAQ_DO_SITE = [
  { categoria: 'Sobre o site', pergunta: 'Quando vence a cota do condomínio?',
    resposta: 'A cota de cada mês vence no dia 10 do mês seguinte. Por exemplo, a cota de março vence dia 10 de abril. O site só conta atraso depois dessa data.' },
  { categoria: 'Sobre o site', pergunta: 'O que significa "pagamentos em dia"?',
    resposta: 'É a porcentagem de pagamentos esperados que já foram feitos naquele mês. Unidades isentas não entram na conta. Enquanto o prazo do mês não vence, o site mostra "prazo em andamento" em vez de uma porcentagem.' },
  { categoria: 'Sobre o site', pergunta: 'De onde vêm os números do site?',
    resposta: 'Direto da planilha de controle do condomínio. O site atualiza sozinho a cada poucos minutos. Se quiser ver o dado mais novo agora, use o botão ↻ no topo da página.' },
  { categoria: 'Sobre o site', pergunta: 'Como vejo para onde o dinheiro foi?',
    resposta: 'Na aba Despesas você vê cada gasto. Na aba Resumo das Finanças vê os maiores gastos do mês, e na aba Análises vê a evolução por categoria e os gastos fora do normal.' },
  { categoria: 'Sobre o site', pergunta: 'Como mando o resumo do mês no grupo dos moradores?',
    resposta: 'Vá na aba Análises, no card "Resumo do mês para compartilhar". Escolha o mês no topo da página e use Compartilhar (imagem) ou Copiar texto. No celular, o botão abre o WhatsApp direto.' },
  { categoria: 'Sobre o site', pergunta: 'Posso baixar a prestação de contas em PDF?',
    resposta: 'Pode. Use o botão 📄 no topo da página. Ele gera o PDF do mês escolhido. Em celular, o botão pode estar dentro do menu ⋮.' },
  { categoria: 'Sobre o site', pergunta: 'Dá para usar o site como aplicativo no celular?',
    resposta: 'Dá. No navegador do celular, abra o menu e escolha "Adicionar à tela inicial" (ou "Instalar app"). Ele passa a abrir como um aplicativo, com ícone próprio.' }
];

function parseFaq(rows) {
  // O Google devolve a PRIMEIRA aba quando a aba pedida não existe. Por isso só
  // aceitamos se o cabeçalho for mesmo "Pergunta | Resposta" (senão: sem FAQ da planilha).
  const cab = (rows && rows[0]) || [];
  if (faqNorm(cab[0]).trim() !== 'pergunta' || faqNorm(cab[1]).trim() !== 'resposta') return [];
  return rows.slice(1).map(r => {
    const ativo = (r[3] || '').trim().toUpperCase();
    return {
      pergunta: (r[0] || '').trim(),
      resposta: (r[1] || '').trim(),
      categoria: (r[2] || '').trim() || 'Geral',
      ativo: ativo === '' || ativo === 'TRUE'
    };
  }).filter(f => f.pergunta && f.resposta && f.ativo);
}

// busca sem diferenciar maiúsculas nem acentos ("agua" acha "água")
const faqNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// texto seguro: escapa HTML, mantém quebras de linha e transforma links em clicáveis
function faqTexto(s) {
  return escHtml(s).replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderFaq() {
  const sel = document.getElementById('faq-cat');
  if (!sel) return;
  const todas = [...dadosFaq, ...FAQ_DO_SITE];
  const cats = [...new Set(todas.map(f => f.categoria))];
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  sel.value = cats.includes(atual) ? atual : '';
  filtrarFaq();
}

function filtrarFaq() {
  const lista = document.getElementById('faq-lista');
  const vazio = document.getElementById('faq-vazio');
  if (!lista) return;
  const q = faqNorm(document.getElementById('faq-busca').value).trim();
  const cat = document.getElementById('faq-cat').value;

  const itens = [...dadosFaq, ...FAQ_DO_SITE].filter(f =>
    (!cat || f.categoria === cat) &&
    (!q || faqNorm(`${f.pergunta} ${f.resposta} ${f.categoria}`).includes(q)));

  document.getElementById('faq-contagem').textContent =
    `${itens.length} ${itens.length === 1 ? 'pergunta' : 'perguntas'}`;
  vazio.style.display = itens.length ? 'none' : 'block';
  // com busca ativa, as respostas já vêm abertas
  lista.innerHTML = itens.map(f => `
    <details class="faq-item"${q ? ' open' : ''}>
      <summary><span class="faq-q">${escHtml(f.pergunta)}</span><span class="faq-cat">${escHtml(f.categoria)}</span></summary>
      <div class="faq-a">${faqTexto(f.resposta)}</div>
    </details>`).join('');
}

document.getElementById('faq-ir-contatos')?.addEventListener('click', () => {
  document.querySelector('[data-tab="contatos"]')?.click();
});
