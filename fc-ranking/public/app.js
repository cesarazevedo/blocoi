const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmtData = (d) => d.split('-').reverse().join('/');
const fmtMes = (m) => `${MESES[+m.slice(5) - 1]} de ${m.slice(0, 4)}`;
const sinal = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'emp');

let D = null, ME = { admin: null };
const filtro = { p1: '', p2: '', res: '', tipo: '', de: '', ate: '' };
let abaAdmin = 'nova';
const nome = (id) => D.nomes[id] ?? '?';

async function api(url, metodo = 'GET', corpo) {
  const r = await fetch(url, { method: metodo, headers: corpo ? { 'content-type': 'application/json' } : metodo !== 'GET' ? { 'content-type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : metodo !== 'GET' ? '{}' : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Erro');
  return j;
}
async function carregar() {
  [D, ME] = await Promise.all([api('/api/dados'), api('/api/me')]);
  desenhar();
}

// ---------------- Telas ----------------
const telas = { rankings, medalhas, recordes, partidas, como, admin };
function desenhar() {
  const rota = (location.hash.replace('#/', '') || 'rankings').split('?')[0];
  const tela = telas[rota] ? rota : 'rankings';
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + tela));
  $('#app').innerHTML = telas[tela]();
  ligar(tela);
}
window.addEventListener('hashchange', () => D && desenhar());

function formaHtml(f) { return `<span class="forma">${f.map((r) => `<i class="${r}" title="${r}"></i>`).join('')}</span>`; }

function rankings() {
  const linhas = (lista, comPos) => lista.map((x) => `<tr>
    ${comPos ? `<td>${x.pos <= 3 ? ['🥇', '🥈', '🥉'][x.pos - 1] : x.pos}</td>` : ''}
    <td class="nome"><button data-j="${x.id}">${esc(x.nome)}</button></td>
    <td class="elo">${x.elo}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td>
    <td>${x.aprov}%</td><td class="${cls(x.sg)}">${x.sg > 0 ? '+' : ''}${x.sg}</td><td>${formaHtml(x.forma)}</td></tr>`).join('');
  const cab = (p) => `<thead><tr>${p ? '<th>#</th>' : ''}<th class="nome">Jogador</th><th>Elo</th><th>J</th><th>V</th><th>E</th><th>D</th><th>Aprov.</th><th>SG</th><th>Forma</th></tr></thead>`;
  return `<h1>🏆 Rankings</h1>
  <p class="sub">Só aparece quem jogou ${D.minJogos} partidas ou mais. Clique no nome para ver os jogos da pessoa.</p>
  <div class="card tabela"><table>${cab(true)}<tbody>${linhas(D.ranking, true) || '<tr><td colspan="10" class="vazio">Ninguém atingiu o mínimo ainda.</td></tr>'}</tbody></table></div>
  ${D.emAvaliacao.length ? `<details class="card"><summary>Em avaliação (menos de ${D.minJogos} jogos): ${D.emAvaliacao.length} jogadores</summary>
    <div class="tabela"><table>${cab(false)}<tbody>${linhas(D.emAvaliacao, false)}</tbody></table></div></details>` : ''}
  <p class="sub">Elo: nota de força. Todo mundo começa com 1000. J = jogos, V = vitórias, E = empates, D = derrotas, SG = saldo de gols. Forma = últimos 5 jogos.</p>`;
}

function medalhas() {
  const q = D.quadro.map((x) => `<tr><td class="nome">${esc(nome(x.id))}</td><td class="medalha">🥇 ${x.ouro}</td><td class="medalha">🥈 ${x.prata}</td><td class="medalha">🥉 ${x.bronze}</td></tr>`).join('');
  const meses = [...D.meses].reverse().map((m) => `<li><span><b>${fmtMes(m.mes)}</b></span><span>${m.podio.map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(nome(p.id))} <small>(${sinal(p.delta)})</small>`).join(' · ')}</span></li>`).join('');
  return `<h1>🏅 Quadro de Medalhas</h1>
  <p class="sub">A cada mês que termina, os 3 que mais ganharam pontos de Elo levam ouro, prata e bronze (mínimo de 5 jogos no mês).</p>
  <div class="card tabela"><table><thead><tr><th class="nome">Jogador</th><th>Ouro</th><th>Prata</th><th>Bronze</th></tr></thead><tbody>${q || '<tr><td colspan="4" class="vazio">Sem meses encerrados.</td></tr>'}</tbody></table></div>
  <div class="card"><h3 style="margin-top:0">Pódio de cada mês</h3><ul class="lista">${meses}</ul></div>`;
}

function recordes() {
  const R = D.recordes;
  const jg = (x) => `${esc(nome(x.p1))} <b>${x.g1} x ${x.g2}</b> ${esc(nome(x.p2))} <small>${fmtData(x.data)}</small>`;
  const card = (t, itens) => `<div class="card"><h3 style="margin-top:0">${t}</h3><ul class="lista">${itens.map((i) => `<li>${i}</li>`).join('') || '<li>—</li>'}</ul></div>`;
  const seq = (arr) => arr.map((x) => `<span>${esc(nome(x.id))} <small>até ${fmtData(x.ate)}${x.atual ? ` · agora: ${x.atual}` : ''}</small></span><b>${x.n}</b>`);
  return `<h1>📊 Recordes e Sequências</h1><p class="sub">Tudo calculado automaticamente a partir das partidas.</p><div class="grade">
  ${card('💥 Maiores goleadas', R.goleadas.map((x) => `<span>${jg(x)}</span><b>${Math.abs(x.g1 - x.g2)} gols</b>`))}
  ${card('🥅 Jogos com mais gols', R.maisGols.map((x) => `<span>${jg(x)}</span><b>${x.g1 + x.g2}</b>`))}
  ${card('🔥 Maior sequência de vitórias', seq(R.seqVitorias))}
  ${card('🛡️ Maior sequência sem perder', seq(R.seqInvicto))}
  ${card('🧊 Maior sequência de derrotas', seq(R.seqDerrotas))}
  ${card('📈 Maior ganho em uma partida', R.maiorGanho.map((x) => `<span>${esc(nome(x.id))} <small>vs ${esc(nome(x.adv))} (${x.placar}) · ${fmtData(x.data)}</small></span><b class="pos">+${x.pts}</b>`))}
  ${card('⭐ Maior Elo da história', R.picos.map((x) => `<span>${esc(nome(x.id))}</span><b>${x.pico}</b>`))}
  ${card('🎮 Mais partidas', R.maisJogos.map((x) => `<span>${esc(nome(x.id))}</span><b>${x.j}</b>`))}
  ${card('🎯 Melhor aproveitamento', R.melhorAproveitamento.map((x) => `<span>${esc(nome(x.id))} <small>${x.j} jogos</small></span><b>${x.aprov}%</b>`))}
  ${card('⚔️ Confrontos mais disputados', R.rivalidades.map((x) => `<span>${esc(nome(x.a))} × ${esc(nome(x.b))}</span><b>${x.n}</b>`))}
  </div>`;
}

function aplicaFiltro() {
  const f = filtro; const id1 = f.p1 ? +f.p1 : null, id2 = f.p2 ? +f.p2 : null;
  return D.partidas.filter((m) => {
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.de && m.data < f.de) return false;
    if (f.ate && m.data > f.ate) return false;
    if (id1 && id2) { if (!((m.p1 === id1 && m.p2 === id2) || (m.p1 === id2 && m.p2 === id1))) return false; }
    else if (id1 && m.p1 !== id1 && m.p2 !== id1) return false;
    if (f.res && id1) {
      const meus = m.p1 === id1 ? m.g1 : m.g2, deles = m.p1 === id1 ? m.g2 : m.g1;
      const r = meus > deles ? 'V' : meus < deles ? 'D' : 'E';
      if (r !== f.res) return false;
    }
    return true;
  });
}
const opcJog = (sel, vazio) => `<option value="">${vazio}</option>` + [...Object.entries(D.nomes)].sort((a, b) => a[1].localeCompare(b[1], 'pt')).map(([id, n]) => `<option value="${id}" ${String(sel) === id ? 'selected' : ''}>${esc(n)}</option>`).join('');

function partidas() {
  const lista = aplicaFiltro(); const id1 = +filtro.p1 || null, id2 = +filtro.p2 || null;
  let h2h = '';
  if (id1 && id2) {
    let v = 0, e = 0, d = 0, gp = 0, gc = 0;
    for (const m of lista) { const a = m.p1 === id1 ? m.g1 : m.g2, b = m.p1 === id1 ? m.g2 : m.g1; gp += a; gc += b; a > b ? v++ : a < b ? d++ : e++; }
    h2h = `<div class="card resumo"><div><b>${esc(nome(id1))}</b> × <b>${esc(nome(id2))}</b></div>
      <div><span class="n pos">${v}</span> vitórias</div><div><span class="n emp">${e}</span> empates</div><div><span class="n neg">${d}</span> derrotas</div>
      <div>Gols: <b>${gp} x ${gc}</b></div></div>`;
  }
  let corpo = '', mesAtual = '';
  const contaMes = {}; lista.forEach((m) => (contaMes[m.data.slice(0, 7)] = (contaMes[m.data.slice(0, 7)] || 0) + 1));
  for (const m of lista) {
    const mes = m.data.slice(0, 7);
    if (mes !== mesAtual) { mesAtual = mes; corpo += `<div class="mes"><span>📅 ${fmtMes(mes)}</span><span class="chip">${contaMes[mes]} partidas</span></div>`; }
    const v1 = m.g1 > m.g2, v2 = m.g2 > m.g1;
    corpo += `<div class="jogo"><div class="data">${fmtData(m.data)}<span class="tipo chip">${esc(D.tipos[m.tipo])}</span></div>
      <div class="lado"><b class="${v1 ? 'venc' : ''}">${esc(nome(m.p1))}</b><span class="${cls(m.d1)}">${sinal(m.d1)} <small>Elo ${m.r1}</small></span></div>
      <div class="placar">${m.g1} - ${m.g2}</div>
      <div class="lado dir"><b class="${v2 ? 'venc' : ''}">${esc(nome(m.p2))}</b><span class="${cls(m.d2)}">${sinal(m.d2)} <small>Elo ${m.r2}</small></span></div>
      ${m.antigo != null ? `<div class="acoes"><small>sistema antigo: ${esc(nome(m.p1))} ${sinal(m.antigo)}</small></div>` : ''}
      ${ME.admin ? `<div class="acoes"><button class="btn sec peq" data-edit="${m.id}">Editar</button> <button class="btn perigo peq" data-del="${m.id}">Apagar</button></div>` : ''}</div>`;
  }
  const tiposOpc = Object.entries(D.tipos).map(([k, v]) => `<option value="${k}" ${filtro.tipo === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  return `<h1>📋 Partidas</h1><p class="sub">Histórico completo e confrontos diretos (${lista.length} partidas)</p>
  <div class="card"><div class="filtros">
    <div><label>Jogador 1</label><select id="f-p1">${opcJog(filtro.p1, 'Todos os jogadores')}</select></div>
    <div><label>Jogador 2 (confronto direto)</label><select id="f-p2">${opcJog(filtro.p2, 'Nenhum')}</select></div>
    <div><label>Resultado (do jogador 1)</label><select id="f-res"><option value="">Todos</option><option value="V" ${filtro.res === 'V' ? 'selected' : ''}>Vitórias</option><option value="E" ${filtro.res === 'E' ? 'selected' : ''}>Empates</option><option value="D" ${filtro.res === 'D' ? 'selected' : ''}>Derrotas</option></select></div>
    <div><label>Tipo</label><select id="f-tipo"><option value="">Todos os tipos</option>${tiposOpc}</select></div>
    <div><label>Data inicial</label><input type="date" id="f-de" value="${filtro.de}"></div>
    <div><label>Data final</label><input type="date" id="f-ate" value="${filtro.ate}"></div>
  </div><p style="margin:10px 0 0"><button class="btn sec peq" id="f-limpar">Limpar filtros</button> <a class="btn sec peq" href="/api/export.csv" style="text-decoration:none">⬇ Exportar planilha (CSV)</a></p></div>
  ${h2h}<div class="card">${corpo || '<p class="vazio">Nenhuma partida encontrada.</p>'}</div>`;
}

function como() {
  return `<div class="como card"><h1>📖 Como funciona</h1>
  <h2>O que é o Elo?</h2><p>É uma "nota de força" de cada jogador, como num jogo de xadrez. Todo mundo começa com <b>1000</b>. Depois de cada partida, o vencedor ganha pontos e o perdedor perde a mesma quantidade.</p>
  <h2>Quanto vale cada vitória?</h2><p>Depende de <b>quem você enfrentou</b>. Pense numa corrida: ganhar do campeão vale muito, ganhar de um iniciante vale pouco. E perder para alguém mais fraco dói mais.</p>
  <ul><li>Venceu alguém mais forte: ganha mais pontos.</li><li>Venceu alguém mais fraco: ganha poucos pontos.</li><li>Empate: quem é mais fraco ganha um pouquinho, e o mais forte perde um pouquinho.</li></ul>
  <p>O placar não muda o valor: ganhar de 1 x 0 ou de 9 x 0 vale igual.</p>
  <h2>Peso de cada tipo de jogo</h2><ul><li><b>Amistoso</b>: peso 40 (jogo normal).</li><li><b>Times Pré-def.</b>: peso 120 (3 vezes mais).</li><li><b>Competição</b>: peso 160 (4 vezes mais).</li></ul>
  <h2>Quem aparece no ranking?</h2><p>Só quem jogou pelo menos <b>${D.minJogos} partidas</b>. Os outros ficam "em avaliação", mas os jogos deles contam no histórico.</p>
  <h2>Medalhas</h2><p>Quando o mês acaba, os 3 jogadores que mais ganharam pontos naquele mês (com pelo menos 5 jogos) recebem ouro, prata e bronze.</p>
  <h2>E os pontos do sistema antigo?</h2><p>As partidas importadas guardam os pontos do sistema antigo, mostrados em letra pequena abaixo de cada jogo. O novo sistema recalcula tudo do zero com a regra acima, então os números podem ser diferentes.</p></div>`;
}

// ---------------- Admin ----------------
function admin() {
  if (ME.precisaCriarAdmin) return `<h1>⚙️ Primeiro acesso</h1><p class="sub">Crie o primeiro administrador.</p>
    <form class="card" id="f-setup"><div class="linha-form"><div><label>Usuário</label><input name="usuario" required></div><div><label>Senha (mín. 8)</label><input name="senha" type="password" minlength="8" required></div><button class="btn">Criar</button></div><div id="msg"></div></form>`;
  if (!ME.admin) return `<h1>⚙️ Administração</h1><p class="sub">Só administradores lançam e editam partidas.</p>
    <form class="card" id="f-login"><div class="linha-form"><div><label>Usuário</label><input name="usuario" required autocomplete="username"></div><div><label>Senha</label><input name="senha" type="password" required autocomplete="current-password"></div><button class="btn">Entrar</button></div><div id="msg"></div></form>`;
  const abas = [['nova', 'Nova partida'], ['importar', 'Importar'], ['jogadores', 'Jogadores'], ['config', 'Configurações'], ['admins', 'Administradores']];
  return `<h1>⚙️ Administração</h1><p class="sub">Olá, ${esc(ME.admin.usuario)}. <button class="btn sec peq" id="sair">Sair</button></p>
  <div class="abas">${abas.map(([k, t]) => `<button data-aba="${k}" class="${abaAdmin === k ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div id="aba">${abaHtml()}</div>`;
}
const hoje = () => new Date().toISOString().slice(0, 10);
const datalist = () => `<datalist id="nomes">${Object.values(D.nomes).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
function formPartida(p = {}) {
  return `${datalist()}<div class="linha-form">
    <div><label>Data</label><input type="date" name="data" value="${p.data || hoje()}" required></div>
    <div><label>Tipo</label><select name="tipo">${Object.entries(D.tipos).map(([k, v]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <div><label>Jogador 1</label><input name="p1" list="nomes" value="${esc(p.p1 != null ? nome(p.p1) : '')}" required></div>
    <div><label>Gols</label><input name="g1" type="number" min="0" value="${p.g1 ?? ''}" required></div>
    <div><label>Gols</label><input name="g2" type="number" min="0" value="${p.g2 ?? ''}" required></div>
    <div><label>Jogador 2</label><input name="p2" list="nomes" value="${esc(p.p2 != null ? nome(p.p2) : '')}" required></div></div>`;
}
function abaHtml() {
  if (abaAdmin === 'nova') return `<form class="card" id="f-nova"><p class="sub">Nome novo cria o jogador automaticamente.</p>${formPartida()}<p><button class="btn">Salvar partida</button></p><div id="msg"></div></form>`;
  if (abaAdmin === 'importar') return `<div class="card"><p class="sub">Cole a lista do sistema antigo (copiar e colar a página inteira funciona), linhas de CSV (<code>data;tipo;jogador1;gols1;gols2;jogador2</code>) ou texto simples como <code>Rafael 3 x 1 Yuri</code>.</p>
    <div class="linha-form"><div><label>Data padrão (p/ texto simples)</label><input type="date" id="i-data" value="${hoje()}"></div>
    <div><label>Tipo padrão</label><select id="i-tipo">${Object.entries(D.tipos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div></div>
    <label style="margin-top:10px">Texto</label><textarea id="i-texto" placeholder="Cole aqui…"></textarea>
    <p><button class="btn" id="i-ler">Ler texto e ver prévia</button></p>
    <hr><label>Ou envie um print da lista</label>${ME.leituraPrint ? '<input type="file" id="i-img" accept="image/*">' : '<p class="sub">Leitura de print desligada: defina a variável ANTHROPIC_API_KEY no servidor para ativar.</p>'}
    <div id="previa"></div></div>`;
  if (abaAdmin === 'jogadores') return `<div class="card"><p class="sub">Corrija nomes escritos errado. Para juntar dois jogadores, renomeie um para o nome exato do outro nas partidas.</p><ul class="lista">${D.jogadores.map((j) => `<li><span>${esc(j.nome)} <small>${j.j} jogos</small></span><button class="btn sec peq" data-ren="${j.id}">Renomear</button></li>`).join('')}</ul></div>`;
  if (abaAdmin === 'config') return `<form class="card" id="f-cfg"><div class="linha-form"><div><label>Mínimo de partidas para aparecer no ranking</label><input type="number" name="minJogos" min="1" value="${D.minJogos}"></div><button class="btn">Salvar</button></div><div id="msg"></div></form>`;
  if (abaAdmin === 'admins') return `<div class="card"><ul class="lista" id="lista-admins"></ul><form id="f-novoadm"><div class="linha-form"><div><label>Novo usuário</label><input name="usuario" required></div><div><label>Senha (mín. 8)</label><input name="senha" type="password" minlength="8" required></div><button class="btn">Adicionar admin</button></div><div id="msg"></div></form></div>`;
  return '';
}
const aviso = (el, txt, tipo = 'ok') => { el.innerHTML = `<div class="msg ${tipo}">${esc(txt)}</div>`; };
const formObj = (f) => Object.fromEntries(new FormData(f));

function previaHtml(r) {
  window._previa = r;
  return `<h3>Prévia: ${r.partidas.length} partidas</h3>
  ${r.novosJogadores.length ? `<div class="msg">Jogadores novos que serão criados: <b>${r.novosJogadores.map(esc).join(', ')}</b>. Confira se não é erro de digitação.</div>` : ''}
  ${r.erros.length ? `<div class="msg erro"><b>${r.erros.length} linhas com problema:</b><br>${r.erros.slice(0, 15).map(esc).join('<br>')}</div>` : ''}
  <div class="tabela" style="max-height:260px;overflow:auto"><table><tbody>${r.partidas.slice(0, 40).map((m) => `<tr><td>${fmtData(m.data)}</td><td>${esc(D.tipos[m.tipo])}</td><td>${esc(m.p1)}</td><td><b>${m.g1} - ${m.g2}</b></td><td>${esc(m.p2)}</td></tr>`).join('')}</tbody></table></div>
  ${r.partidas.length > 40 ? `<p class="sub">…e mais ${r.partidas.length - 40}.</p>` : ''}
  <p>Ordem do texto: <select id="i-ordem"><option value="cronologica" ${r.ordem === 'cronologica' ? 'selected' : ''}>do mais antigo para o mais novo</option><option value="recente-primeiro" ${r.ordem === 'recente-primeiro' ? 'selected' : ''}>do mais novo para o mais antigo</option></select></p>
  <button class="btn" id="i-ok" ${r.partidas.length ? '' : 'disabled'}>Importar ${r.partidas.length} partidas</button>`;
}

function ligar(tela) {
  const rec = () => { const p = $('#app'); p.innerHTML = telas[tela](); ligar(tela); };
  if (tela === 'rankings') document.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => { Object.assign(filtro, { p1: b.dataset.j, p2: '', res: '' }); location.hash = '#/partidas'; }));
  if (tela === 'partidas') {
    const map = { 'f-p1': 'p1', 'f-p2': 'p2', 'f-res': 'res', 'f-tipo': 'tipo', 'f-de': 'de', 'f-ate': 'ate' };
    for (const [id, k] of Object.entries(map)) $('#' + id).addEventListener('change', (e) => { filtro[k] = e.target.value; rec(); });
    $('#f-limpar').addEventListener('click', () => { Object.assign(filtro, { p1: '', p2: '', res: '', tipo: '', de: '', ate: '' }); rec(); });
    document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Apagar esta partida? Os pontos serão recalculados.')) return;
      try { await api('/api/admin/partidas/' + b.dataset.del, 'DELETE'); await carregar(); } catch (e) { alert(e.message); }
    }));
    document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editar(+b.dataset.edit)));
  }
  if (tela !== 'admin') return;
  const msg = () => $('#msg');
  $('#f-setup')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/setup', 'POST', formObj(e.target)); await carregar(); } catch (x) { aviso(msg(), x.message, 'erro'); } });
  $('#f-login')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/login', 'POST', formObj(e.target)); await carregar(); } catch (x) { aviso(msg(), x.message, 'erro'); } });
  $('#sair')?.addEventListener('click', async () => { await api('/api/logout', 'POST'); await carregar(); });
  document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { abaAdmin = b.dataset.aba; rec(); }));
  $('#f-nova')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const o = formObj(e.target);
    try { await api('/api/admin/partidas', 'POST', o); const dt = o.data, tp = o.tipo; await carregar(); aviso($('#msg'), 'Partida salva!'); const f = $('#f-nova'); f.data.value = dt; f.tipo.value = tp; f.p1.focus(); } catch (x) { aviso(msg(), x.message, 'erro'); }
  });
  $('#f-cfg')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/config', 'PUT', { minJogos: formObj(e.target).minJogos }); await carregar(); aviso($('#msg'), 'Salvo!'); } catch (x) { aviso(msg(), x.message, 'erro'); } });
  document.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', async () => {
    const n = prompt('Novo nome:', nome(b.dataset.ren)); if (!n) return;
    try { await api('/api/admin/jogadores/' + b.dataset.ren, 'PUT', { nome: n }); await carregar(); } catch (x) { alert(x.message); }
  }));
  if ($('#lista-admins')) listarAdmins();
  $('#f-novoadm')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/admins', 'POST', formObj(e.target)); e.target.reset(); await listarAdmins(); aviso(msg(), 'Administrador criado.'); } catch (x) { aviso(msg(), x.message, 'erro'); } });
  const previa = async (corpo) => {
    try { const r = await api('/api/admin/importar', 'POST', corpo); $('#previa').innerHTML = previaHtml(r);
      $('#i-ok')?.addEventListener('click', async () => {
        const base = { partidas: window._previa.partidas, ordem: $('#i-ordem').value, confirmar: true, ignorarErros: true };
        try { const x = await api('/api/admin/importar', 'POST', base); await carregar(); abaAdmin = 'importar'; rec(); $('#previa').innerHTML = `<div class="msg ok">${x.importadas} partidas importadas.</div>`; } catch (e2) { alert(e2.message); }
      });
    } catch (x) { $('#previa').innerHTML = `<div class="msg erro">${esc(x.message)}</div>`; }
  };
  $('#i-ler')?.addEventListener('click', () => previa({ texto: $('#i-texto').value, dataPadrao: $('#i-data').value, tipoPadrao: $('#i-tipo').value }));
  $('#i-img')?.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => previa({ imagem: String(rd.result).split(',')[1], tipoMidia: f.type });
    rd.readAsDataURL(f);
  });
}
async function listarAdmins() {
  const l = await api('/api/admin/admins');
  $('#lista-admins').innerHTML = l.map((a) => `<li><span>${esc(a.usuario)}</span>${a.id === ME.admin.id ? '<small>você</small>' : `<button class="btn perigo peq" data-rm="${a.id}">Remover</button>`}</li>`).join('');
  document.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Remover este administrador?')) { await api('/api/admin/admins/' + b.dataset.rm, 'DELETE'); listarAdmins(); } }));
}
function editar(id) {
  const m = D.partidas.find((x) => x.id === id); const dlg = $('#dlg');
  dlg.innerHTML = `<form id="f-edit"><h3 style="margin-top:0">Editar partida</h3>${formPartida(m)}<p><button class="btn">Salvar</button> <button type="button" class="btn sec" id="cancelar">Cancelar</button></p><div id="msg"></div></form>`;
  dlg.showModal();
  $('#cancelar').addEventListener('click', () => dlg.close());
  $('#f-edit').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/partidas/' + id, 'PUT', formObj(e.target)); dlg.close(); await carregar(); } catch (x) { aviso($('#msg'), x.message, 'erro'); } });
}

carregar().catch((e) => { $('#app').innerHTML = `<p class="vazio">Erro ao carregar: ${esc(e.message)}</p>`; });
