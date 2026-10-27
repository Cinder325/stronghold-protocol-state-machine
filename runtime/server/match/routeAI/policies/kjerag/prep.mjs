// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {DEFAULT_POLICY47,IDS47,base,coreOf,hasCore,heal,own} from "./model.mjs";
import {phase47,routeEligibility47,selectRoster47,unitValue47} from "./roster.mjs";
import {chooseTacticalRoster47} from "../../support/tactical-roster.mjs";
import {buyValue47,coinRedemption47,discountFunding52,protectedSale47,purchasePurpose53,upgradeClearance47,upgradeFunding47} from "./procurement.mjs";
import {acquisition47,economy47,investorProtected47} from "./economy.mjs";
import {ensurePurchaseRoom103} from "../../support/purchase-capacity.mjs";
import {equipStep47} from "./equipment.mjs";
import {arrangeKjerag47} from "./formation.mjs";
import {selectBounty47} from "../../support/bounty-selection.mjs";
import {openingOpportunity47} from "../../support/kjerag-opening.mjs";
import {reserveVisibleProject47} from "../../support/shop-reservation.mjs";
import {rescueOverflow54} from "./overflow.mjs";
import {cashFinish102} from "../../support/cash-finish.js";

export const prepHistory47=new WeakMap();


export function runKjeragPrep47(m,ps,{observe,handle,policy=DEFAULT_POLICY47,note=()=>{},rankLocal=null}={}){
  const gd=ps.gd||m.gd,round=m.round,bossRound=m.gd.bossRound,decisions=[],errors=[];
  const eligibility=routeEligibility47(gd,observe().match.public);note('fsm-route-eligibility',eligibility);
  const first=observe().match.private,last=prepHistory47.get(ps),repair=first.lp<=policy.survivalHp;
  prepHistory47.set(ps,{round,lp:first.lp});
  const activePolicy=repair?{...policy,narrowBridge:false}:policy;
  note('fsm-survival-assessment',{repair:!!repair,lp:first.lp,previousPrepLp:last?.lp??null,
    policy:'If newly losing HP below the heuristic budget, delay optional level>=5 and refill the actual roster; preserve core route.'});
  let refreshes=0,upgradeSales=0,cycles=0,layout,stopReason='action-bound',previousKey=null;
  const cycleUids=new Set(),engineDeployAttempted=new Set();
  const upgradeAssessments=new Map();
  const permitUpgrade=p=>{
    const key=JSON.stringify([p.lp,own(p).map(u=>[u.uid,u.id,u.items]),p.bonds.map(b=>[b.bondId,b.layers]),ps.round.spent]);
    if(upgradeAssessments.has(key))return upgradeAssessments.get(key);
    const check=chooseTacticalRoster47(m,ps,p,selectRoster47(gd,p),{maxCandidates:3});
    const rows=check.receipt.candidates.flatMap(c=>c.results).filter(r=>r.finished&&r.errors===0&&Number.isFinite(r.cappedLoss));
    const minimum=rows.length?Math.min(...rows.map(r=>r.cappedLoss)):null;
    const permitted=upgradeClearance47(p.lp,minimum);
    note('fsm-upgrade-clearance47',{lp:p.lp,minimumCappedLoss:minimum,permitted,
      contract:'Allow a currently clearable wave, or at least12 LP after independent capped loss; future waves/teammate rescue unknown'});
    upgradeAssessments.set(key,permitted);return permitted;
  };
  const act=(intent,task,extra={})=>{
    const p=observe().match.private,result=handle(intent,`fsm47:${task}`,{task,purpose:extra.purpose??task});
    const after=observe().match.private,beforeLayers=Object.fromEntries((p.bonds||[]).map(b=>[b.bondId,b.layers]));
    const layerDelta=Object.fromEntries((after.bonds||[]).map(b=>[b.bondId,b.layers-(beforeLayers[b.bondId]||0)]).filter(([,n])=>n!==0));
    const row={step:decisions.length+1,phase:phase47(gd,p,round,bossRound),task,intent,funds:p.funds,level:p.shop.level,
      receipt:{fundsDelta:after.funds-p.funds,layerDelta,newChess:own(after).filter(u=>!own(p).some(v=>v.uid===u.uid)).map(u=>({uid:u.uid,id:u.id})),
        investorBefore:economy47(gd,p),investorAfter:economy47(gd,after)},
      core:coreOf(p),...extra,accepted:result?.ok===true,result};decisions.push(row);note('fsm-decision',row);
    if(result?.ok!==true)errors.push(row);return result?.ok===true;
  };
  const room=()=>ensurePurchaseRoom103({
    observe:()=>observe().match.private,equip:p=>equipStep47(gd,p,{round}),
    restore:()=>arrangeKjerag47(m,ps,{observe,handle,policy,note}),
    surplus:p=>{const selected=selectRoster47(gd,p);return own(p).filter(u=>u.row==null&&!protectedSale47(gd,p,u,selected)).sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid)[0];},
    act,active:()=>m.phase==='PREP'&&ps.alive&&!ps.ready,
  }).ok;
  for(let step=0;step<policy.maxSteps;step++){
    const p=observe().match.private;
    const key=JSON.stringify([p.funds,p.shop,p.board,p.hand,p.temp,p.personalChoice]);
    if(key===previousKey){stopReason='unchanged-visible-state';break;}previousKey=key;
    if(p.personalChoice){
      const result=selectBounty47(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i),{note});
      if(!act({t:'g.choice',idx:result.index??0,choiceId:p.personalChoice.id},'personal-choice',{preview:result.receipt}))break;continue;
    }
    const priorityEquipment=equipStep47(gd,p,{round});
    if(priorityEquipment){if(!act(priorityEquipment,'equipment-before-reward-and-shopping'))break;continue;}
    if(p.shop.rewardOffer){
      if(!room()){stopReason='reward-capacity-abstain';break;}
      const fresh=observe().match.private;if(!fresh.shop.rewardOffer)continue;
      let offers=fresh.shop.rewardOffer.slots.map((s,idx)=>({idx,s,...buyValue47(gd,fresh,s,{round,bossRound,policy,reward:true})}))
        .filter(x=>x.s&&!x.s.sold&&x.s.price<=fresh.funds).sort((a,b)=>b.group-a.group||b.score-a.score||a.idx-b.idx);
      if(rankLocal)offers=rankLocal(fresh,offers,{round,bossRound,reward:true,policy});
      if(!offers.length||!act({t:'g.reward',idx:offers[0].idx},'reward-before-economy',
        {offer:offers[0].s,purpose:purchasePurpose53(gd,fresh,offers[0].s,offers[0])}))break;
      continue;
    }
    // Resolve only actual newly obtained bodies. Never sell a merged elite, an
    // equipped unit, a chosen combat body, a unique K base or the investment trio.
    const chosenNow=selectRoster47(gd,p);
    const cycle=own(p).filter(u=>cycleUids.has(u.uid)&&u.row==null&&!gd.isGolden(u.id)&&!u.items?.length
      &&!chosenNow.some(v=>v.uid===u.uid)&&!investorProtected47(gd,p,u)
      &&!protectedSale47(gd,p,u,chosenNow)
      &&(!hasCore(gd,u)||own(p).some(v=>v.uid!==u.uid&&base(gd,v)===base(gd,u))))[0];
    if(cycle){cycleUids.delete(cycle.uid);if(!act({t:'g.sell',uid:cycle.uid},'acquisition-cycle-release'))break;continue;}
    const pendingEngine=chosenNow.find(u=>[IDS47.halo,IDS47.dusk].includes(base(gd,u))
      &&!p.board.some(v=>v.uid===u.uid)&&!engineDeployAttempted.has(u.uid));
    if(pendingEngine){
      engineDeployAttempted.add(pendingEngine.uid);
      arrangeKjerag47(m,ps,{observe,handle,policy,note});
      note('fsm-growth-engine-deployment',{uid:pendingEngine.uid,id:pendingEngine.id,
        deployed:observe().match.private.board.some(u=>u.uid===pendingEngine.uid),
        scope:'Actual native board membership before evaluating spending/acquisition loops; no prep-start effect fabricated'});
      continue;
    }
    const itemIntent=equipStep47(gd,p,{round});
    if(itemIntent){if(!act(itemIntent,'equipment-project'))break;continue;}
    const desired=policy.upgradeRounds.reduce((lv,r,i)=>r>0&&round>=r?Math.max(lv,i):lv,1);
    const target=desired;
    const purchasingPolicy={...activePolicy,acquisitionCycles:policy.acquisitionCycles&&cycles<policy.maxCycles};
    const redeem=coinRedemption47(gd,p,[...p.shop.slots.filter(s=>s&&!s.sold&&buyValue47(gd,p,s,{round,bossRound,policy:purchasingPolicy}).group>=3).map(s=>s.price),
      ...(p.shop.level<target?[p.shop.upgradePrice]:[])]);
    if(redeem){if(!act(redeem,'redeem-bank-for-visible-project'))break;continue;}
    const discount=discountFunding52(gd,p,{round,bossRound,policy:purchasingPolicy});
    if(discount){if(!act({t:'g.sell',uid:discount.uid},'fund-visible-one-coin-kjerag',{project:discount.project}))break;continue;}
    let offers=p.shop.slots.map((s,slot)=>({s,slot,...buyValue47(gd,p,s,{round,bossRound,policy:purchasingPolicy})}))
      .filter(x=>x.s&&!x.s.sold&&x.group>0&&x.s.price<=p.funds).sort((a,b)=>b.group-a.group||b.score-a.score||a.slot-b.slot);
    if(rankLocal)offers=rankLocal(p,offers,{round,bossRound,reward:false,policy:activePolicy});
    const critical=offers.find(o=>o.incomeOpening||o.recruit||o.group>=4&&(o.merge||o.s.price<=1||policy.visibleProjectBeforeUpgrade&&o.fresh)
      ||o.fresh&&o.s.kind==='chess'&&heal(gd,{id:o.s.id})&&!own(p).some(u=>heal(gd,u))
      ||policy.visibleProjectBeforeUpgrade&&o.group>=3&&o.fresh
        &&[IDS47.arc,IDS47.halo,IDS47.bell,IDS47.sa,IDS47.gnosis,IDS47.degen,IDS47.mumu,IDS47.ptil].includes(gd.baseIdOf(o.s.id))
      ||o.fresh&&o.group>=3&&gd.chess(o.s.id)?.bonds?.includes('investShip')
        &&(economy47(gd,p).investorCount===2||o.incomeOpening)&&!repair&&round<bossRound);
    const funding=upgradeFunding47(gd,p,{maxSales:Math.max(0,policy.maxUpgradeSales-upgradeSales)});
    const benchFunding=funding.sales.filter(u=>!p.board.some(v=>v.uid===u.uid));
    const benchReachable=p.funds+benchFunding.reduce((sum,u)=>sum+gd.sellPrice(u.id),0)>=p.shop.upgradePrice;
    const upgradeAllowed=p.shop.level>=target||!!critical||!(p.funds>=p.shop.upgradePrice||benchReachable)||permitUpgrade(p);
    if(p.shop.level<target&&p.funds>=p.shop.upgradePrice&&!critical&&upgradeAllowed){
      if(!act({t:'g.levelUp'},'phase-upgrade',{target,reserve:p.shop.upgradePrice}))break;continue;
    }
    if(policy.reachableUpgradeBudget&&p.shop.level<target&&!critical&&upgradeAllowed&&p.funds<p.shop.upgradePrice&&benchReachable&&benchFunding.length){
      if(!act({t:'g.sell',uid:benchFunding[0].uid},'fund-reachable-upgrade',{target,needed:p.shop.upgradePrice-p.funds,
        protection:'Only nonselected native bench assets; no current deployed fighter liquidated to pay for an upgrade'}))break;
      upgradeSales++;continue;
    }
    const reserve=upgradeAllowed&&p.shop.level<target&&(!policy.reachableUpgradeBudget||p.funds>=p.shop.upgradePrice)?p.shop.upgradePrice:0;
    const offer=offers.find(o=>o===critical||p.funds-o.s.price>=reserve||round===1
      ||o.farm&&o.gain.nativeNet<=0&&own(p).some(u=>base(gd,u)===gd.baseIdOf(o.s.id)));
    if(offer){
      if(!room()){stopReason='purchase-capacity-abstain';break;}
      const beforeBuy=observe().match.private,oldUids=new Set(own(beforeBuy).map(u=>u.uid));
      if(!act({t:'g.buy',slot:offer.slot},offer.farm?'acquisition-cycle-purchase':'goal-purchase',
        {offered:offer.s,priority:offer.group,score:offer.score,reserve,purpose:purchasePurpose53(gd,beforeBuy,offer.s,offer),
          quotedGain:offer.gain,quotedGainScope:'ordinary onGain only; auto-merge/gifts use actual receipt'}))break;
      if(offer.farm){cycles++;for(const u of own(observe().match.private))if(!oldUids.has(u.uid))cycleUids.add(u.uid);}
      continue;
    }
    // Only unchosen, unprotected bench singles may fund this turn. Never liquidate the active roster.
    const chosen=selectRoster47(gd,p),surplus=own(p).filter(u=>u.row==null&&!protectedSale47(gd,p,u,chosen))
      .sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid);
    if(surplus.length&&(p.hand.filter(Boolean).length>=p.hand.length-2||p.funds<p.shop.upgradePrice&&p.shop.level<target)){
      if(!act({t:'g.sell',uid:surplus[0].uid},'release-surplus'))break;continue;
    }
    const opening=openingOpportunity47(gd,p,{round,offers:p.shop.slots.map((s,slot)=>({slot,s,...buyValue47(gd,p,s,{round,bossRound,policy:activePolicy})}))});
    if(opening){
      if(!act(opening.intent,opening.task,{reason:opening.reason,freezeScope:opening.freezeScope}))break;
      if(opening.stopAfter){stopReason=opening.task;break;}continue;
    }
    const heldProject=reserveVisibleProject47(gd,p,p.shop.slots.map((s,slot)=>({s,slot,
      ...buyValue47(gd,p,s,{round,bossRound,policy:purchasingPolicy})})),{round,bossRound});
    if(heldProject){
      if(!act(heldProject.intent,heldProject.task,{reason:heldProject.reason,projectSlot:heldProject.projectSlot}))break;
      if(heldProject.stopAfter){stopReason=heldProject.task;break;}continue;
    }
    if(refreshes<policy.maxRefreshes&&p.shop.refreshPrice<=p.funds&&p.funds-p.shop.refreshPrice>=reserve){
      if(!act({t:'g.refresh'},'search-current-goal',{reserve}))break;refreshes++;continue;
    }
    stopReason='goal-budget-exhausted';break;
  }
  const overflowHandle=(intent,source,extra)=>{
    act(intent,extra?.task||source,{purpose:extra?.purpose});return decisions.at(-1).result;
  };
  const overflowBefore=rescueOverflow54(m,ps,{observe,handle:overflowHandle,note});
  layout=arrangeKjerag47(m,ps,{observe,handle,policy,note,finalLayout:true});
  let overflowAfter=rescueOverflow54(m,ps,{observe,handle:overflowHandle,note,allowDeploy:false});
  if(m.opts?.cashGuard102===true)for(let pass=0;pass<2;pass++){
    const receipt=cashFinish102(m,ps,{
      rankOffer:(slot,p)=>{const v=buyValue47(gd,p,slot,{round,bossRound,policy});return v.group>=2?v.group*100+v.score:acquisition47(gd,p,slot).weighted>0?50:0;},
      useOwned:p=>equipStep47(gd,p,{round}),
      targetFor:(item,p)=>{const excluded=u=>u?.kind==='chess'&&base(gd,u)===IDS47.ptil&&!hasCore(gd,u);
        const shadow={...p,board:p.board.filter(u=>!excluded(u)),hand:[...p.hand.map(u=>u?.kind==='item'||excluded(u)?null:u),item],temp:p.temp.filter(u=>u?.kind!=='item'&&!excluded(u))};
        const a=equipStep47(gd,shadow,{round});return a?.itemUid===item.uid?a.targetUid:null;},
      capacitySale:(p,excluded)=>{const selected=selectRoster47(gd,p);return own(p).filter(u=>u.row==null&&!excluded.has(u.uid)&&!protectedSale47(gd,p,u,selected)).sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid)[0]?.uid??null;},
      saleFor:(slot,p)=>{const selected=selectRoster47(gd,p),legal=own(p).filter(u=>u.row==null&&!protectedSale47(gd,p,u,selected)).sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid);
        return p.funds+legal.reduce((n,u)=>n+gd.sellPrice(u.id),0)>=slot.price?legal[0]?.uid??null:null;},note,
    });
    if(!receipt.actions.length)break;
    layout=arrangeKjerag47(m,ps,{observe,handle,policy,note,finalLayout:true});
    overflowAfter=rescueOverflow54(m,ps,{observe,handle:overflowHandle,note,allowDeploy:false});
  }
  // Do not silently discard items or unresolved queued rewards. Readiness is a logged FSM boundary.
  const p=observe().match.private;
  if(p.personalChoice)act({t:'g.choice',idx:0,choiceId:p.personalChoice.id},'final-personal-choice');
  const ready=overflowAfter.safe&&act({t:'g.ready',ready:true},'ready-checklist',{stopReason,unresolvedOffer:!!p.shop.rewardOffer,
    unresolvedTemp:p.temp.filter(Boolean).length,geometry:layout.geometry,purpose:'到期关键资源已安置后准备就绪'});
  if(!overflowAfter.safe)note('fsm-ready-abstention54',{reason:overflowAfter.reason,unresolved:overflowAfter.unresolved});
  return {economic:{selections:decisions,stopReason,refreshes,cycles,policy,eligibility},completion:{ready,layout,errors,blocked:!overflowAfter.safe,
    blockedReason:overflowAfter.safe?null:'prep-overflow-no-safe-capacity',
    overflow:{before:overflowBefore,after:overflowAfter}}};
}
