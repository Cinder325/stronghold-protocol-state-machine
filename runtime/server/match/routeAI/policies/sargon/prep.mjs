// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {DEFAULT_SARGON58,IDS58,SARGON58,base,bond,healer,loose,own} from "./model.mjs";
import {createRosterGuard69} from "../../support/roster-restoration.mjs";
import {arrangeSargon58} from "./formation.mjs";
import {equipStep58} from "./equipment.mjs";
import {capacitySale67,protectedSale58,selectRoster58,unitScore58} from "./roster.mjs";
import {bankOffer59,buyValue58,fundingSale59,upgradeBudget61} from "./procurement.mjs";
import {selectBounty47} from "../../support/bounty-selection.mjs";
import {botPickCard} from "../../../bot.js";
import {cashFinish102,passiveCarrier102} from "../../support/cash-finish.js";
import {blockedRecruitmentTool} from "../../support/sargon-cash.js";


export function runSargonPrep58(m,ps,{observe,handle,policy=DEFAULT_SARGON58,note=()=>{}}={}){
 const gd=ps.gd,round=m.round,decisions=[],errors=[],acquired=new Set(),banked=new Set();let refreshes=0,stopReason='action-bound',previous=null;
 const keyBases=new Set([IDS58.minimal,IDS58.titi,IDS58.rosmontis,IDS58.passenger,IDS58.pepe]);
 const guard=createRosterGuard69({observe,keyOf:(u,p)=>keyBases.has(base(gd,u))
  ||gd.chess(u.id)?.name==='魔王'&&own(p).some(v=>base(gd,v)===IDS58.titi)});
 const saleExclusions=()=>new Set([...acquired,...guard.protectedUids()]);
 const act=(intent,task)=>{
  if(intent.t==='g.sell'&&!guard.canSell(intent.uid)){
   note('sargon-sale-protection69',{round,uid:intent.uid,task,reason:'intended-roster-or-temporarily-withdrawn-key'});return false;
  }
  const before=observe().match.private,result=handle(intent,'sargon58:'+task,{task,purpose:task});
  guard.observeMove(intent,before,result);
  decisions.push({intent,task,result});if(result?.ok!==true)errors.push({intent,task,result});return result?.ok===true;};
 const layout=final=>arrangeSargon58(m,ps,{observe,handle:(i,s,e)=>{act(i,e?.task||s);return decisions.at(-1)?.result;},note,final,guard});
 const riskCache=new Map();
 const risk=()=>{
  const view=observe().match.private,key=JSON.stringify([own(view).map(u=>[u.uid,u.id,u.items]),view.funds,view.bonds]);
  if(!riskCache.has(key)){
   const rows=layout(true).candidates.filter(c=>c.finished&&!c.errors);
   riskCache.set(key,rows.length?Math.min(...rows.map(c=>Math.min(c.leaks,m.gd.lpCapPerRound))):null);
  }
  return riskCache.get(key);
 };
 const capacity=()=>{
  // Native recompute automatically fills freed slots from temp. A successful
  // sale/equip/deployment is not proof that the regular hand now has room.
  for(let attempt=0;attempt<20;attempt++){
   let p=observe().match.private;if(p.hand.some(u=>u==null))return true;
   const equip=equipStep58(gd,p,{round,excluded:saleExclusions(),canRelease:uid=>guard.canSell(uid),allowRecruit:false,allowRewards:false});
   if(equip){if(!act(equip,'capacity-use-owned-equipment'))return false;continue;}
   layout(false);p=observe().match.private;if(p.hand.some(u=>u==null))return true;
   // Missing selected bodies stay in saleExclusions through the guard. They
   // must not prevent releasing an unrelated bench spare for a hand buffer.
   const surplus=capacitySale67(gd,p,{round,excluded:saleExclusions()});
   if(!surplus||!act({t:'g.sell',uid:surplus.uid},'capacity-non-key'))return false;
  }
  return observe().match.private.hand.some(u=>u==null);
 };
 const claimReward=()=>{
  if(!capacity())return false;
  const fresh=observe().match.private,offer=fresh.shop.rewardOffer;if(!offer)return true;
  const offers=offer.slots.map((s,idx)=>({s,idx,...buyValue58(gd,fresh,s,{round,reward:true})}))
   .filter(o=>o.s&&!o.s.sold&&o.s.price<=fresh.funds).sort((a,b)=>b.group-a.group||b.score-a.score||a.idx-b.idx);
  return !!offers.length&&act({t:'g.reward',idx:offers[0].idx},'native-free-choice');
 };
 for(let step=0;step<policy.maxSteps;step++){
  const p=observe().match.private,key=JSON.stringify([p.funds,p.shop,p.board,p.hand,p.temp,p.personalChoice]);
  if(key===previous){stopReason='unchanged-state';break;}previous=key;
  if(p.personalChoice){layout(false);const choice=selectBounty47(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i),{note});
   const idx=choice.index??botPickCard(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i));
   if(!act({t:'g.choice',idx,choiceId:p.personalChoice.id},'choose-native-offer'))break;continue;}
  if(p.shop.rewardOffer){
   if(!claimReward()){stopReason='reward-capacity-or-choice';break;}continue;
  }
  const equip=equipStep58(gd,p,{round,excluded:saleExclusions(),canRelease:uid=>guard.canSell(uid)});if(equip){if(!act(equip,'resolve-equipment'))break;continue;}
  const target=policy.upgradeRounds.reduce((lv,r,i)=>r>0&&round>=r?Math.max(lv,i):lv,1);
  const offers=p.shop.slots.map((s,slot)=>({s,slot,...buyValue58(gd,p,s,{round})})).filter(o=>o.s&&!o.s.sold&&o.group>0&&o.s.price<=p.funds)
   .sort((a,b)=>b.group-a.group||b.score-a.score||a.slot-b.slot);
  const critical=offers.find(o=>o.merge||o.isCore&&o.fresh&&((bond(p,SARGON58)?.count||0)<3||o.s.price<=2)
   ||o.s.kind==='item'&&o.group>=4||o.s.kind==='chess'&&healer(gd,o.s)&&!own(p).some(u=>healer(gd,u)));
  const costs=[...(p.shop.level<target?[p.shop.upgradePrice]:[]),...p.shop.slots.filter(s=>s&&!s.sold&&buyValue58(gd,p,s,{round}).group>=3).map(s=>s.price)];
  const coin=loose(p).find(i=>['盟约之币','骑士储蓄罐'].includes(gd.item(i.id)?.name));
  const carrier=own(p).find(u=>(u.items?.length||0)<2);
  if(coin&&carrier&&costs.some(cost=>cost>p.funds)){
   if(!act({t:'g.equip',itemUid:coin.uid,targetUid:carrier.uid},'redeem-saved-coin-for-visible-project'))break;continue;
  }
  const checkUpgrade=p.shop.level<target&&p.funds>=p.shop.upgradePrice&&!critical;
  const loss=checkUpgrade&&(p.lp<=policy.survivalHp||p.shop.level>=4)?risk():null;
  const allowUpgrade=upgradeBudget61(gd,p,{target,critical:!!critical,loss,survivalHp:policy.survivalHp});
  if(checkUpgrade&&allowUpgrade){if(!act({t:'g.levelUp'},'risk-checked-upgrade'))break;continue;}
  // Pepe loses cash at prep end. An unaffordable upgrade is not a reason
  // to reserve this round's money and skip current reinforcement.
  const reserve=0;
  const offer=offers[0];
  if(offer){if(!capacity()){stopReason='purchase-capacity';break;}const before=new Set(own(observe().match.private).map(u=>u.uid));
   if(!act({t:'g.buy',slot:offer.slot},'buy-visible-project'))break;
   for(const u of own(observe().match.private))if(!before.has(u.uid))acquired.add(u.uid);continue;}
  // Only unselected unprotected bench assets are released. Never sell a purchase
  // merely because the current board has not yet been rearranged.
  const chosen=selectRoster58(gd,p),surplus=own(p).filter(u=>u.row==null&&!saleExclusions().has(u.uid)&&!protectedSale58(gd,p,u,chosen))
   .sort((a,b)=>unitScore58(gd,a)-unitScore58(gd,b));
  if(surplus.length&&p.hand.filter(Boolean).length>=p.hand.length-2){if(!act({t:'g.sell',uid:surplus[0].uid},'release-non-key-bench'))break;continue;}
  const desired=p.shop.slots.map(s=>({s,...buyValue58(gd,p,s,{round})}))
   .filter(o=>o.s&&!o.s.sold&&o.group>=3&&o.s.price>p.funds).sort((a,b)=>b.group-a.group||b.score-a.score)[0];
  if(desired){const sale=fundingSale59(gd,p,{price:desired.s.price,replacement:desired.s.kind==='chess'?desired.s:null,excluded:saleExclusions()});
   if(sale){if(!act({t:'g.sell',uid:sale.uid},'fund-visible-key-from-obsolete-piece'))break;continue;}}
  if(p.shop.level<target&&p.funds<p.shop.upgradePrice){
   const sale=fundingSale59(gd,p,{price:p.shop.upgradePrice,excluded:saleExclusions()});
   if(sale){const projected=risk();if(projected===0||Number.isFinite(projected)&&p.lp-projected>=12){
    if(!act({t:'g.sell',uid:sale.uid},'fund-upgrade-from-unused-bench'))break;continue;}}
  }
  const bank=()=>{
   const choice=bankOffer59(gd,observe().match.private,{excluded:banked});if(!choice)return false;
   const before=new Set(own(observe().match.private).map(u=>u.uid));
   if(!act({t:'g.buy',slot:choice.slot},'bank-expiring-funds-as-resalable-card'))return false;
   banked.add(choice.s.id);for(const u of own(observe().match.private))if(!before.has(u.uid))acquired.add(u.uid);return true;
  };
  if(desired){
   if(bank())continue;
   // The native freeze covers the whole shop; manual refresh cancels it.
   // Do not discard spendable cash just to hold an unaffordable card.
   if(p.funds===0||refreshes>=policy.maxRefreshes||p.shop.refreshPrice>p.funds){
    if(!p.shop.frozen)act({t:'g.freeze'},'hold-unaffordable-key');stopReason='hold-unaffordable-key';break;
   }
   note('sargon-key-refresh61',{round,funds:p.funds,key:desired.s.id,price:desired.s.price,
    reason:'No safe sale or affordable bank card; spend expiring cash rather than stop to preserve this offer'});
  }
  // No mandatory 2/4 -> 3/5 wait: a visible upgrade/purchase may retain the
  // queued special credit incidentally; otherwise use it on the current tier.
  if(p.funds<=2&&p.shop.refreshPrice>0&&!(p.bandId==='band_pepe'&&ps.counters['band:pepe:special']>0)&&bank())continue;
  if(refreshes<policy.maxRefreshes&&p.shop.refreshPrice<=p.funds&&p.funds-p.shop.refreshPrice>=reserve){
   if(!act({t:'g.refresh'},'search-current-shop'))break;refreshes++;continue;}
  if(bank())continue;
  stopReason='visible-budget-exhausted';break;
 }
 let finalLayout=layout(true);
 // Modified 2026-10-25: the main shopping loop may stop on capacity or its
 // search bound. Final placement may restore space. Recheck confirmed expiring
 // funds here instead of treating either bound as a reason to press Ready.
 const cashReceipts=[];
 const finishCash=()=>{if(m.opts?.cashGuard102===true)for(let pass=0;pass<2&&ps.funds>0;pass++){
  const before=new Set(ps.allChess().map(u=>u.uid));
  const targetFor=(item,p)=>{
   const shadow={...p,hand:[...p.hand.map(u=>u?.kind==='item'?null:u),item],temp:p.temp.filter(u=>u?.kind!=='item')};
   const move=equipStep58(gd,shadow,{allowRecruit:false});return move?.itemUid===item.uid?move.targetUid:null;
  };
  const receipt=cashFinish102(m,ps,{
   maxActions:96,minimumChessRoom:1,
   rankOffer:(slot,p)=>{const v=buyValue58(gd,p,slot,{round});return v.group>=2?v.group*100+v.score:0;},
   useOwned:p=>equipStep58(gd,p,{allowRecruit:false,allowRewards:false}),targetFor,
   capacityAction:p=>{
    const spare=capacitySale67(gd,p,{round,excluded:saleExclusions()});
    return blockedRecruitmentTool(gd,p,{
     canSpendOn:slot=>{
      if(slot.kind==='chess')return buyValue58(gd,p,slot,{round}).group>=2
       &&own(p).filter(u=>!gd.isGolden(u.id)&&base(gd,u)===gd.baseIdOf(slot.id)).length<2
       &&!(gd.chess(slot.id)?.garrisonIds||[]).some(id=>{const g=gd.garrison(id);return g?.eventType==='SERVER_GAIN'&&!['SERVER_ADD_BOND_CHESS_ALL','SERVER_GAIN_FREE_REFRESH_COUNT'].includes(g.effectKey);});
      const rec=gd.item(slot.id),target=targetFor({kind:'item',uid:-1,id:slot.id},p),host=own(p).find(u=>u.uid===target);
      return rec?.itemType==='EQUIP'&&rec.kind==='passive'&&!rec.canGiveBond
       &&['STAT','SP','SURVIVAL'].includes(rec.category)&&!ps.completesItemMerge(slot.id)
       &&passiveCarrier102(gd,rec,host);
     },
     canUseOn:u=>spare?.uid===u.uid&&guard.canSell(u.uid)&&(u.items?.length||0)<gd.equipPerChess,
    });
   },
   capacitySale:(p,purchased)=>{
    const excluded=new Set([...saleExclusions(),...purchased]);
    const candidate=capacitySale67(gd,p,{round,excluded});return candidate&&guard.canSell(candidate.uid)?candidate.uid:null;
   },
   saleFor:(slot,p)=>{const candidate=fundingSale59(gd,p,{price:slot.price,excluded:saleExclusions()});
    return candidate&&candidate.row==null&&guard.canSell(candidate.uid)?candidate.uid:null;},note,
  });
  for(const u of ps.allChess())if(!before.has(u.uid))acquired.add(u.uid);
  cashReceipts.push(receipt);
  if(!receipt.actions.some(a=>a.accepted))break;
  finalLayout=layout(true);
 }};
 // Rescue due temp into real hand space, with the same protected-sale invariant.
 const rescueDue=()=>{for(let n=0;n<40;n++){
  const p=observe().match.private,due=p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));if(!due.length)break;
  const equip=equipStep58(gd,p,{round,excluded:saleExclusions(),canRelease:uid=>guard.canSell(uid),allowRecruit:false,allowRewards:false});if(equip&&due.some(u=>u.uid===equip.itemUid)){if(!act(equip,'consume-due-item'))break;continue;}
  const free=p.hand.findIndex(u=>u==null);if(free>=0){if(!act({t:'g.move',uid:due[0].uid,to:{area:'hand',idx:free}},'rescue-due-card'))break;continue;}
  const disposable=capacitySale67(gd,p,{round,excluded:saleExclusions()});
  if(disposable){if(!act({t:'g.sell',uid:disposable.uid},'rescue-release-non-key'))break;continue;}break;
 }};
 const finishRestoration=()=>{for(let pass=0;pass<4;pass++){
  rescueDue();const state=guard.status();
  if(state.pending.length||state.missingSelected.length){
   if(!capacity())break;
   finalLayout=layout(true);
  }
  finishCash();const remaining=guard.status();
  if(!remaining.pending.length&&!remaining.missingSelected.length)break;
 }};
 finishRestoration();
 // Shopping/action bounds and later cash repairs can leave or create offers.
 // Complete them against fresh state, then restore/rescue again; do not force
 // Ready past missing selected bodies, due overflow or an unresolved choice.
 for(let n=0;n<20;n++){
  const p=observe().match.private;
  if(p.personalChoice){const choice=selectBounty47(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i),{note});
   const idx=choice.index??botPickCard(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i));
   if(!act({t:'g.choice',idx,choiceId:p.personalChoice.id},'finish-pending-choice'))break;
  }else if(p.shop.rewardOffer){if(!claimReward()){stopReason='final-reward-capacity-or-choice';break;}}
  else break;
  finalLayout=layout(true);finishRestoration();
 }
 const p=observe().match.private,unresolved=p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));
 const restoration=guard.status(),blocked=unresolved.length>0||!!p.personalChoice||!!p.shop.rewardOffer
  ||restoration.pending.length>0||restoration.missingSelected.length>0,ready=!blocked&&act({t:'g.ready',ready:true},'ready');
 note('sargon-prep58',{round,stopReason,refreshes,ready,blocked,decisions:decisions.length,errors,
  expiringFunds:gd.leftoverKeptBands.includes(p.bandId)?0:p.funds,cashReceipts,
  budgetNote:p.funds?'No permitted affordable purchase/refresh/upgrade or action/capacity bound; not intentional cash saving':'Current-round budget spent'});
 return {economic:{selections:decisions,stopReason,refreshes,policy,cashReceipts},completion:{ready,blocked,errors,layout:finalLayout,restoration}};
}
