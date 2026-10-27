// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {selectRoster58,unitScore58} from "./roster.mjs";
import {healingCoverage57,repairHealing57} from "../../support/healing-coverage.mjs";
import {LAYOUT_PARAMS,createRehearsal,planLayout} from "../../../bot.js";
import {SARGON58,bond,compass,core,healer,own,tea} from "./model.mjs";
import {pathProtection52} from "../../support/wave-search.mjs";
import {relationPlans73} from "../../support/sargon-synergy.mjs";
import {normalPreviewOptions48} from "../../support/wave-preview.mjs";
import {planBoss47} from "../../support/boss-planning.mjs";
import {applyRestoringPlacement69} from "../../support/roster-restoration.mjs";


export function arrangeSargon58(m,ps,{observe,handle,note=()=>{},final=false,guard}={}){
 const p=observe().match.private,gd=ps.gd,lm=Object.create(m);lm.rngBots=()=>0.5;lm._botPath=null;
 let chosen=selectRoster58(gd,p),plan=repairHealing57(ps,chosen,planLayout(lm,ps,chosen));
 const receipt={round:m.round,kind:'experimental-sargon-native-roster-and-layout',candidates:[],chosen:0};
 if(final&&m.wave&&chosen.length){
  const before=JSON.stringify({players:m.order.map(v=>v.privateView()),uid:m.uidSeq,pool:[...m.pool.entries],debt:[...m.itemPool.debt],
   rng:['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'].map(k=>m[k].state())});
  const original=chosen,sets=[chosen],bench=own(p).filter(u=>!chosen.some(v=>v.uid===u.uid))
   .filter(u=>core(gd,u)||['莱恩哈特','寒芒克洛丝','华法琳','魔王','妮芙','迷迭香'].includes(gd.chess(u.id)?.name))
   .sort((a,b)=>unitScore58(gd,b)-unitScore58(gd,a)||a.uid-b.uid);
  for(const incoming of bench){
   if(sets.length>=3)break;
   const outgoing=chosen.filter(u=>!tea(gd,u)||!compass(gd,u))
    .filter(u=>!healer(gd,u)||healer(gd,incoming)||chosen.filter(v=>healer(gd,v)).length>1)
    .sort((a,b)=>unitScore58(gd,a)-unitScore58(gd,b)||a.uid-b.uid)[0];
   if(outgoing)sets.push(chosen.map(u=>u===outgoing?incoming:u));
  }
  let best=null;
  const riskKey=c=>Math.min(c.leaks,gd.lpCapPerRound);
  const compare=(a,b)=>riskKey(a)-riskKey(b)||(p.lp-riskKey(a)<=3?a.leaks-b.leaks||a.deaths-b.deaths:0)
   ||b.growth-a.growth||a.leaks-b.leaks||a.deaths-b.deaths||b.healing.weight-a.healing.weight||a.index-b.index;
  for(const [rosterIndex,roster]of sets.entries()){
   const seed=planLayout(lm,ps,roster),healed=repairHealing57(ps,roster,seed);
   const plans=rosterIndex===0?[seed,healed,...pathProtection52(m,ps,roster,healed,{maxCandidates:1}).map(x=>x.plan),
    ...relationPlans73(ps,roster,healed,{maxCandidates:2}),planLayout(lm,ps,roster,{...LAYOUT_PARAMS,hold:8,healHold:1})]:[seed,healed];
   const battles=[];lm.botRehearsal=plans.length;
   lm._normalOpts=(copy,opts)=>normalPreviewOptions48(m,copy,opts).opts;
   lm.newBattle=(opts,flags)=>{const b=m.newBattle(opts,flags);battles.push(b);return b;};
   const job=createRehearsal(lm,ps,roster,plans);if(!job)continue;
   for(const [i,b]of battles.entries()){
    let ticks=0;while(!b.finished&&ticks++<job.cap)b.step();
    const r=b.result().perPlayer?.[ps.playerId],g=r?.layerGains||{};
    const c={index:receipt.candidates.length,rosterIndex,uids:roster.map(u=>u.uid),finished:b.finished,errors:b.errorCount,
     leaks:r?.leaked?.filter(l=>l.counted!==false).length||0,deaths:r?.deaths||0,
     growth:(g.sargonShip||0)/((bond(p,SARGON58)?.layers||0)+45)+(g.preciShip||0)*1.3/((bond(p,'preciShip')?.layers||0)+60)
      +(g.swiftShip||0)*1.2/((bond(p,'swiftShip')?.layers||0)+30),gains:g,healing:healingCoverage57(ps,roster,job.plans[i])};
    receipt.candidates.push(c);
    if(c.finished&&!c.errors&&(!best||compare(c,best)<0)){best=c;chosen=roster;plan=job.plans[i];receipt.chosen=c.index;}
   }
  }
  receipt.rosterChanged=chosen!==original;
  const after=JSON.stringify({players:m.order.map(v=>v.privateView()),uid:m.uidSeq,pool:[...m.pool.entries],debt:[...m.itemPool.debt],
   rng:['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'].map(k=>m[k].state())});
  if(before!==after)throw Error('Sargon roster preview changed live state, stock or RNG');
 }
 if(final&&m.round>=gd.bossRound){const boss=planBoss47(m,ps,p,chosen,{basePlan:plan,note,maxCandidates:6});if(boss){plan=boss.plan;receipt.boss=boss.receipt;}}
 const placement=applyRestoringPlacement69(ps,chosen,plan,{observe,handle,guard});
 receipt.placement=placement;receipt.healing=healingCoverage57(ps,chosen,plan);note('sargon-layout58',receipt);return receipt;
}
