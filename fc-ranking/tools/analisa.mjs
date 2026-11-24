import fs from 'node:fs';
const K={A:40,T:120,C:160};
const rows=fs.readFileSync(new URL('../data/partidas.txt',import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map((l,i)=>{const [d,t,a,ga,gb,b,p]=l.split('|');return{d,t,a,ga:+ga,gb:+gb,b,p:+p,i}});
// cronológico: dia asc, dentro do dia inverte a ordem colada
rows.sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:y.i-x.i);
const R={};const get=n=>R[n]??=0;
let bad=0,tot=0;const out=[];
for(const m of rows){
  const k=K[m.t];const ra=get(m.a),rb=get(m.b);
  // diferença implícita pela pontuação
  const S=m.ga>m.gb?1:m.ga<m.gb?0:.5;
  const Ea=S-m.p/k; // esperado implícito de A
  const impl=Ea>0&&Ea<1?400*Math.log10(Ea/(1-Ea)):NaN;
  out.push([m.d,m.t,m.a,m.b,m.p,(ra-rb).toFixed(0),impl.toFixed(0)]);
  R[m.a]+=m.p;R[m.b]-=m.p;
}
console.log('Saldos finais (soma dos pts):');
console.log(Object.entries(R).sort((a,b)=>b[1]-a[1]).map(([n,v])=>n+': '+v).join('\n'));
fs.writeFileSync('/tmp/cmp.txt',out.map(o=>o.join('\t')).join('\n'));
