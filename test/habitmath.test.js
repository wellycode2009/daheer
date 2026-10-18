const HM = require('../src/js/habitmath.js');
const today = HM.di('2026-10-07');
function mk(){ return { v:3, settings:{weekStart:1,rule:'one',xpGoal:40,goalMin:120}, meta:{}, habits:[
 {id:'a',name:'Read',kind:'normal',sched:{type:'daily'},created:'2026-08-01',archived:false},
 {id:'b',name:'Water',kind:'amount',target:8,sched:{type:'daily'},created:'2026-08-01',archived:false},
 {id:'c',name:'Sugar',kind:'avoid',sched:{type:'daily'},created:'2026-08-01',archived:false,badCost:20},
 {id:'d',name:'Gym',kind:'normal',sched:{type:'weekly',n:3},created:'2026-08-01',archived:false}],
 logs:{}, rest:{}, mood:{}, writeDays:{}, sessions:[], notes:[], events:[], adventure:{}, achievements:{}, tools:{} }; }
const S = mk();
for (let i=60;i>=0;i--){ const k=HM.key(today-i); S.logs[k]={a:1, b:{v:(i%9)}, c:(i%5?1:0)}; if(i%2) S.logs[k].d=1; S.mood[k]={v:1+i%5}; }
const cfg={weekStart:1,rule:'one'};
const tests = {
 compute: ()=>HM.compute(S,today,cfg),
};
let comp;
for (const [n,f] of Object.entries(tests)) { try{ comp=f(); console.log('ok',n);}catch(e){console.error('FAIL',n,e.message); process.exitCode=1;} }
const run=(n,f)=>{try{const r=f(); const j=JSON.stringify(r); if(/NaN|Infinity/.test(j)) throw new Error('NaN/Infinity in '+n); console.log('ok',n);return r}catch(e){console.error('FAIL',n,e.message); process.exitCode=1}};
run('moodStats',()=>HM.moodStats(S,comp,today));
run('schoolReport',()=>HM.schoolReport(S,comp,today));
run('badHabitLoad',()=>HM.badHabitLoad(S,today));
run('adventurePick',()=>HM.adventurePick(S,comp,today,'seed1'));
run('achievementList',()=>HM.achievementList(comp,{}));
run('monthSheet',()=>HM.monthSheet(S,comp,2026,9,today,cfg));
// empty state & edge cases
const E=mk(); E.habits=[]; const ce=run('compute-empty',()=>HM.compute(E,today,cfg));
run('schoolReport-empty',()=>HM.schoolReport(E,ce,today));
const T=mk(); T.habits[1].target=0; const ct=run('compute-target0',()=>HM.compute(T,today,cfg));
run('monthSheet-target0',()=>HM.monthSheet(T,ct,2026,9,today,cfg));
console.log('level checks', [0,99,100,299,300].map(x=>HM.levelFromXp(x)).join(','));

const lv=[0,99,100,299,300].map(x=>HM.levelFromXp(x)).join(','); if(lv!=='1,1,2,2,3'){console.error('level formula',lv);process.exitCode=1;}
