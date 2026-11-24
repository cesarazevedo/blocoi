import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpretar } from '../src/parser.mjs';
import { calcular } from '../src/elo.mjs';

const J = [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }];

test('Elo: jogadores iguais, vitória em amistoso vale 20 e é soma zero', () => {
  const r = calcular([{ id: 1, data: '2026-01-01', tipo: 'A', p1: 1, p2: 2, g1: 1, g2: 0 }], J);
  assert.equal(r.partidas[0].d1, 20);
  assert.equal(r.partidas[0].d2, -20);
});
test('Elo: empate entre iguais não muda nada; tipos têm pesos 40/120/160', () => {
  const emp = calcular([{ id: 1, data: '2026-01-01', tipo: 'A', p1: 1, p2: 2, g1: 2, g2: 2 }], J);
  assert.equal(emp.partidas[0].d1, 0);
  for (const [t, v] of [['T', 60], ['C', 80]]) {
    const r = calcular([{ id: 1, data: '2026-01-01', tipo: t, p1: 1, p2: 2, g1: 1, g2: 0 }], J);
    assert.equal(r.partidas[0].d1, v);
  }
});
test('Elo: vencer o mais forte rende mais do que vencer o mais fraco', () => {
  const ms = [
    { id: 1, data: '2026-01-01', tipo: 'A', p1: 1, p2: 2, g1: 1, g2: 0 },
    { id: 2, data: '2026-01-02', tipo: 'A', p1: 1, p2: 2, g1: 1, g2: 0 },
    { id: 3, data: '2026-01-03', tipo: 'A', p1: 2, p2: 1, g1: 1, g2: 0 },
  ];
  const r = calcular(ms, J);
  assert.ok(r.partidas[2].d1 > r.partidas[0].d1);
});
test('Ranking só mostra quem tem o mínimo de jogos', () => {
  const ms = Array.from({ length: 3 }, (_, i) => ({ id: i, data: '2026-01-01', tipo: 'A', p1: 1, p2: 2, g1: 1, g2: 0 }));
  assert.equal(calcular(ms, J, { minJogos: 10 }).ranking.length, 0);
  assert.equal(calcular(ms, J, { minJogos: 3 }).ranking.length, 2);
});
test('Parser: texto copiado do sistema antigo', () => {
  const txt = `📅 Novembro de 2026 (2 partidas)\n📅 23/11/2026\nAmistoso\nGuilherme\n+14 pts\n2 - 1\nKariel\n-14 pts\n📅 2026-11-04\nCompetição\nRafael\n+6 pts\n6 - 0\nYuri\n-6 pts`;
  const r = interpretar(txt);
  assert.equal(r.partidas.length, 2);
  assert.deepEqual(r.partidas[0], { data: '2026-11-23', tipo: 'A', p1: 'Guilherme', g1: 2, g2: 1, p2: 'Kariel', pts_antigo: 14 });
  assert.equal(r.partidas[1].data, '2026-11-04');
  assert.equal(r.partidas[1].tipo, 'C');
  assert.equal(r.ordem, 'recente-primeiro');
});
test('Parser: texto simples e CSV', () => {
  const r = interpretar('Rafael 3 x 1 Yuri Geo\n10/05/2026;Amistoso;Ana;2;2;Bia', { dataPadrao: '2026-05-01' });
  assert.equal(r.partidas.length, 2);
  assert.equal(r.partidas[0].p2, 'Yuri Geo');
  assert.equal(r.partidas[0].data, '2026-05-01');
  assert.equal(r.partidas[1].data, '2026-05-10');
});
test('Dados iniciais: todas as linhas são lidas', () => {
  const r = interpretar(fs.readFileSync(new URL('../data/partidas.txt', import.meta.url), 'utf8'));
  assert.equal(r.erros.length, 0);
  assert.ok(r.partidas.length > 600);
});
