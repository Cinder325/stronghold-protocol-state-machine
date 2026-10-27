// SPDX-License-Identifier: GPL-3.0-or-later
import {runKjeragPrep47,DEFAULT_POLICY47} from './policies/kjerag.mjs';
import {runSargonPrep58,DEFAULT_SARGON58} from './policies/sargon.mjs';
import * as arturia from './vendor/arturia/runtime.js';
import * as lavinia from './vendor/lavinia/runtime.js';
import * as arturiaPolicy from './vendor/arturia/policy/server/match/botDevelopment.js';
import * as laviniaPolicy from './vendor/lavinia/policy/server/match/botDevelopment.js';
import {cashFinishSteps102} from './support/cash-finish.js';
import {repairBossJob72} from './support/elite-boss-repair.js';
import {routeFor,isUnifiedBot} from './routes.js';
const finish=it=>{let s;do{s=it.next();}while(!s.done);return s.value;};
export function runRoute(m,ps,{observe,handle,note=()=>{}}){
 if(!isUnifiedBot(m,ps))throw Error('Teammate-only policy rejected a non-AI target');
 const route=routeFor(m,ps);ps._botFocusId=route.core;ps._botCoreCommitted=true;delete ps._botFocus;
 ps._routeAIPreferredBandActive=ps.bandId===route.band;
 m.opts.cashGuard102=true;
 if(route.id==='kjerag')return runKjeragPrep47(m,ps,{observe,handle,note,policy:DEFAULT_POLICY47});
 if(route.id==='sargon')return runSargonPrep58(m,ps,{observe,handle,note,policy:DEFAULT_SARGON58});
 const runtime=route.id==='laterano'?arturia:lavinia,supplier=route.id==='laterano'?arturiaPolicy:laviniaPolicy,view=runtime.policyView(m);
 let job=finish(runtime.prepBegin(m,ps));
 if(ps.funds>0){const receipt=finish(cashFinishSteps102(m,ps,{
  rankOffer:(slot,p)=>{const rec=ps.gd.chess(slot.id);if(!rec)return 0;
   const acquisition=(rec.garrisonIds||[]).some(id=>{const g=ps.gd.garrison(id);return g?.eventType==='SERVER_GAIN'&&g.effectKey==='SERVER_ADD_BOND_CHESS_ALL'&&rec.bonds.some(b=>b===route.core||p.bonds.some(v=>v.bondId===b&&v.active));});
   return rec.bonds.includes(route.core)?100:acquisition?50:0;},targetFor:item=>supplier.itemTarget(view,ps,item)?.uid??null,note}));
  if(receipt.actions.some(a=>a.accepted))job=finish(supplier.arrangeSteps(view,ps,{final:true,defer:true}));
 }
 if(job)job.run(Infinity);
 if(route.id==='laterano')job=repairBossJob72(m,ps,job);
 finish(runtime.prepEnd(m,ps,job));
 return {completion:{ready:ps.ready,blocked:!ps.ready}};
}
