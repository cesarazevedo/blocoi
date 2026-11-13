// ── Perguntas frequentes ──────────────────────────────────────
// Alimentada pela aba "FAQ" da planilha. Colunas:
//   Pergunta | Resposta | Categoria | Ativo
// (Ativo: TRUE ou vazio = aparece; FALSE = escondida. Categoria vazia vira "Geral".)
// Só aparece o que estiver na planilha (nada fixo no código).
// Tudo aqui é geral para o condomínio; nada identifica unidade ou morador.

let dadosFaq = [];   // [{pergunta, resposta, categoria}]

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
  const todas = dadosFaq;
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

  const itens = dadosFaq.filter(f =>
    (!cat || f.categoria === cat) &&
    (!q || faqNorm(`${f.pergunta} ${f.resposta} ${f.categoria}`).includes(q)));

  document.getElementById('faq-contagem').textContent =
    `${itens.length} ${itens.length === 1 ? 'pergunta' : 'perguntas'}`;
  vazio.style.display = itens.length ? 'none' : 'block';
  vazio.textContent = dadosFaq.length ? 'Nenhuma pergunta encontrada. Tente outra palavra.' : 'Ainda não há perguntas cadastradas.';
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
