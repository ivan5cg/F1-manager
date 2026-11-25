// Resume las sesiones mojadas (agua > 0,2 mm) de una o varias carpetas de gp.ts: node scripts/auditoria/lluvia.js <carpeta> [...]
const fs=require('fs'),path=require('path');
const med=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:NaN};
const mean=a=>{a=a.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN};
for(const dir of process.argv.slice(2)){
 const rows=[];
 for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){let o;try{o=JSON.parse(fs.readFileSync(path.join(dir,f)))}catch(e){continue}
  for(const k of ['Q','SQ','RACE','SPRINT']){const S=o.sessions[k];if(!S||S.maxWater<0.2)continue;
   if(k==='RACE'||k==='SPRINT'){
    const fin=S.res.filter(r=>r.status==='fin');
    const sw=[],back=[];let wetLaps=0,all=0;
    for(const r of S.res){let prev=null;for(const st of r.stints){if(prev&&'SMH'.includes(prev)&&'IW'.includes(st.c))sw.push(st.from);if(prev&&'IW'.includes(prev)&&'SMH'.includes(st.c))back.push(st.from);prev=st.c;}
     for(const l of r.lapsRec){all++;if('IW'.includes(l.c))wetLaps++;}}
    const sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
    // tiempos en mojado frente a la pole seca objetivo
    const iLaps=S.res.slice(0,10).flatMap(r=>r.lapsRec.filter(l=>l.g&&!l.pit&&l.c==='I').map(l=>l.t/o.poleObj));
    const wLaps=S.res.slice(0,10).flatMap(r=>r.lapsRec.filter(l=>l.g&&!l.pit&&l.c==='W').map(l=>l.t/o.poleObj));
    const scl=S.res.slice(0,5).flatMap(r=>{const L=r.lapsRec;const gm=med(L.filter(l=>l.g&&!l.pit&&l.n>1).map(l=>l.t));return L.filter(l=>!l.pit&&(l.fl==='s'||l.fl==='v')).map(l=>[l.fl,l.t/gm])});
    rows.push(`${k.padEnd(6)} ${o.id.padEnd(11)} s${o.seed} agua máx ${S.maxWater.toFixed(2)} media ${S.meanWater.toFixed(2)} · ${S.lapsTotal}v ${S.shortened?'ACORTADA ':''}· SC ${S.flags.filter(x=>x.flag==='sc').length} VSC ${S.flags.filter(x=>x.flag==='vsc').length} roja ${S.flags.filter(x=>x.flag==='red').length} · abandonos ${S.res.filter(r=>r.status==='out').length} (${S.res.filter(r=>r.status==='out').map(r=>(r.reason||'').slice(0,12)).join(',')}) · toques ${S.stats.contacts} salidas ${S.stats.offs} · %vueltas I/W ${(100*wetLaps/all).toFixed(0)} · a mojado en v${med(sw)} (σ ${sd(sw).toFixed(1)}, n${sw.length}) · a seco v${med(back)} (σ ${sd(back).toFixed(1)}, n${back.length}) · I/pole ${med(iLaps).toFixed(3)} W/pole ${med(wLaps).toFixed(3)} · SCvuelta ${med(scl.filter(x=>x[0]==='s').map(x=>x[1])).toFixed(2)} VSCvuelta ${med(scl.filter(x=>x[0]==='v').map(x=>x[1])).toFixed(2)} · gana ${S.res[0].ab} P${S.res[0].grid} · paradas ${mean(fin.map(r=>r.stops)).toFixed(1)}`);
   } else {
    const r0=S.res[0];rows.push(`${k.padEnd(6)} ${o.id.padEnd(11)} s${o.seed} agua máx ${S.maxWater.toFixed(2)} · pole ${r0.ab} ${r0.byPart.map(x=>x&&x.toFixed(2)).join('/')} (${(r0.tyreByPart||[]).join('')}) · pole/obj ${(Math.min(...r0.byPart.filter(x=>x))/o.poleObj).toFixed(3)} · roja ${S.stats.red} · salidas ${S.stats.offs} · top10: ${S.res.slice(0,10).map(r=>r.ab).join(' ')}`);
   }}}
 console.log('\n#### '+dir+'\n'+rows.join('\n'));
}
