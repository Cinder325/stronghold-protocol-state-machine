// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {CORE47,DEFAULT_POLICY47,IDS47,base,block,coreOf,hasCore,heal,is,loose,own,rangedDamage} from "./model.mjs";
import {simpleTool54,simpleToolTargets54} from "./equipment.mjs";
import {acquisition47,conversionProjects47,economy47,investorProtected47} from "./economy.mjs";
import {projectionKind56,projectionQuote56} from "../../support/promotion-projection.mjs";
import {pieceBonds} from "../../../bondsMeta.js";
import {rosterBonds47,selectRoster47,unitValue47} from "./roster.mjs";

export function buyValue47(gd,p,slot,{round=1,bossRound=14,policy=DEFAULT_POLICY47,reward=false}={}){
  if(!slot||slot.sold)return {group:0,score:-1};
  const units=own(p),b=slot.kind==='chess'?gd.chess(slot.id):gd.item(slot.id);
  if(!b||b.isDiy)return {group:0,score:-1};
  if(slot.kind==='item'){
    if(round<=3&&p.shop.level<=2&&p.funds===1&&slot.price===1&&simpleTool54(gd,slot.id)
      &&simpleToolTargets54(gd,p,gd.item(slot.id)).length)
      return {group:1,score:35,earlyTool:true};
    const freeCarrier=units.some(u=>(u.items?.length||0)<2);
    // A permanent income project is not an emergency defender. Free rewards and
    // already-owned dolls can still resolve; this guard protects current cash.
    if(['精打细算玩偶','见钱眼开玩偶'].includes(b.name)&&slot.price>0&&p.lp<=policy.survivalHp)
      return {group:0,score:0,reason:'danger-reserve-combat-budget'};
    if(b.name==='精打细算玩偶'&&freeCarrier&&bossRound-round>=Math.ceil(slot.price/(b.params?.count||1))+1)
      return {group:3,score:110,incomeOpening:true};
    if(b.name==='见钱眼开玩偶'&&freeCarrier&&round<bossRound&&slot.price<(b.params?.count||0))
      return {group:3,score:90,incomeOpening:true};
    // Direct grants use the native expandable temp queue. The item occupies its
    // own normal slot until consumed; room() handles only the real purchase gate.
    if(['简易通讯机','寻呼模块'].includes(b.name)&&units.some(u=>hasCore(gd,u)&&(u.items?.length||0)<2))
      return {group:3,score:105,recruit:true};
    const items=[...loose(p),...units.flatMap(u=>u.items||[])],itemBase=String(slot.id).replace(/_[ab]$/,'');
    const copies=items.filter(i=>i.id.replace(/_[ab]$/,'')===itemBase).length;
    const projects=conversionProjects47(gd,p),reserve=projects.length?0:(!units.some(u=>is(gd,u,IDS47.arc))?1:0);
    const iceNeed=projects.filter(u=>!(u.items||[]).some(i=>gd.item(i.id)?.giveBondId===CORE47)).length+reserve;
    const morphNeed=projects.filter(u=>!(u.items||[]).some(i=>gd.item(i.id)?.canGiveBond)).length+reserve;
    const looseIce=loose(p).filter(i=>gd.item(i.id)?.giveBondId===CORE47).length;
    const looseMorph=loose(p).filter(i=>gd.item(i.id)?.canGiveBond).length;
    if(/谢拉格不融冰/.test(b.name))return {group:looseIce<iceNeed?3:0,score:looseIce<iceNeed?95:0,fresh:false};
    if(b.canGiveBond)return {group:looseMorph<morphNeed?3:0,score:looseMorph<morphNeed?100:0,fresh:false};
    if(/拟态物质/.test(b.name))return {group:units.some(u=>!gd.isGolden(u.id)&&units.filter(v=>v.id===u.id).length>=2)?2:0,score:35};
    if(projectionKind56(gd,slot))return projectionQuote56(gd,p,slot,{round,lastGuaranteedPrepRound:bossRound,survivalHp:policy.survivalHp});
    if(b.giveBondId==='arcaneShip')return {group:copies<1?2:0,score:copies<1?28:0};
    return {group:0,score:0};
  }
  const id=gd.baseIdOf(slot.id),same=units.filter(u=>base(gd,u)===id),normal=same.filter(u=>!gd.isGolden(u.id));
  const visible=(p.shop.slots||[]).filter(s=>s?.kind==='chess'&&!s.sold&&s.id===slot.id);
  const need=Math.max(0,3-normal.length),prices=visible.map(s=>s.price).sort((a,b)=>a-b);
  // Sciurus's displayed first-Kjerag discount is consumed once, so later copies
  // in this same visible project must use their base price.
  if(b.bonds?.includes(CORE47)&&need>1&&prices.length>1)
    prices.splice(1,prices.length-1,...visible.map(s=>Math.max(s.price,s.basePrice??b.price??s.price)).sort((a,b)=>a-b).slice(1));
  const closeable=(p.shop.level>=3||b.bonds?.includes(CORE47)||[IDS47.arc,IDS47.halo,IDS47.ptil].includes(gd.baseIdOf(slot.id))||p.lp<=10)
    &&normal.length>0&&need>0&&prices.length>=need&&prices.slice(0,need).reduce((a,n)=>a+n,0)<=p.funds;
  const merge=(normal.length>=2||closeable)&&!b.isGolden,core=b.bonds?.includes(CORE47),fresh=same.length===0;
  let group=0,score=(b.tier||1)*3-(slot.price||0)*1.1;
  if(merge){group=4;score+=85+(p.shop.level>=5?50:0);}
  else if(core&&fresh){group=4;score+=85;}
  else if([IDS47.arc,IDS47.halo,IDS47.bell,IDS47.sa,IDS47.gnosis,IDS47.degen].includes(id)&&fresh){group=3;score+=60;}
  else if(heal(gd,{id:slot.id})&&!units.some(u=>heal(gd,u))){group=3;score+=65;}
  else if(block(gd,{id:slot.id})&&!units.some(u=>block(gd,u))){group=3;score+=55;}
  else if(rangedDamage(gd,{id:slot.id})&&!units.some(u=>rangedDamage(gd,u))){group=3;score+=60;}
  else if(fresh&&b.bonds?.includes('skillfulShip')&&units.some(u=>is(gd,u,IDS47.arc))
    &&new Set(units.filter(u=>pieceBonds(gd,u).includes('skillfulShip')).map(u=>base(gd,u))).size<2){group=3;score+=70;}
  else if(normal.length===1&&(!policy.narrowBridge||(coreOf(p)?.count||0)>=3)
    &&(core||[IDS47.arc,IDS47.halo].includes(id))){
    group=2;score+=35;
  }else if(units.length<(policy.narrowBridge?Math.min(5,round+2):Math.min(8,round+2))&&fresh){group=1;score+=18;}
  if(!merge&&normal.length===1&&same.length===1&&[IDS47.pram,IDS47.gnosis].includes(id)){
    group=Math.max(group,slot.price<=1?4:2);score+=35;
  }
  if(id===IDS47.bell)score+=80;
  if(id===IDS47.halo)score+=50;
  if(id===IDS47.arc)score+=40;
  if(id===IDS47.gnosis)score+=30;
  if(id===IDS47.degen)score+=30;
  if(id===IDS47.ptil&&fresh){group=Math.max(group,3);score+=units.some(u=>is(gd,u,IDS47.arc))?100:65;}
  if(id===IDS47.medic&&!units.some(u=>heal(gd,u)))score+=40;
  if(core&&slot.price<=1)score+=30;
  if(round>=bossRound&&[IDS47.bell,IDS47.degen].includes(id))score+=30;
  // A golden copy already owns the base; third normal bodies are not mandatory forever.
  if(same.some(u=>gd.isGolden(u.id))&&!merge){group=0;score=0;}
  const econ=economy47(gd,p),gain=acquisition47(gd,p,slot);
  if(reward&&id===IDS47.halo&&fresh&&coreOf(p)?.active&&econ.skillActive
    &&units.some(u=>is(gd,u,IDS47.arc))
    &&units.some(u=>[IDS47.bell,IDS47.degen].includes(base(gd,u))||is(gd,u,IDS47.gnosis)&&gd.isGolden(u.id))){
    group=5;score+=180;
  }
  const incomePaybackRounds=Math.max(2,Math.ceil(Math.max(0,slot.price-gd.sellPrice(slot.id))/(b.isGolden?2:1)));
  const incomeOpening=id===IDS47.swire&&bossRound-round>=incomePaybackRounds&&p.shop.level<=3&&p.lp>policy.survivalHp
    &&p.funds-slot.price>=3;
  const fundedSideRoute=coreOf(p)?.active&&(units.some(u=>is(gd,u,IDS47.sa))||econ.investorCount===2
    ||p.funds>=p.shop.upgradePrice+slot.price);
  if(policy.investorProject&&fresh&&b.bonds?.includes('investShip')&&econ.investorCount<3
    &&round<(econ.investorCount===2?bossRound:bossRound-2)
    &&(incomeOpening||fundedSideRoute)){
    const project=econ.investorCount===2?105:id===IDS47.swire?72:55;
    if(group<3){group=3;score+=project;}
  }
  if(id===IDS47.mumu&&fresh&&econ.needsMorph){group=Math.max(group,3);score+=80;}
  if(id===IDS47.dusk&&fresh&&econ.haloOnBoard&&econ.arcaneActive){group=Math.max(group,2);score+=35;}
  // Acquisition farming is valid even with an existing elite. Do not confuse an
  // expected random Flametail gift with guaranteed Kjerag layers or sale cash.
  const farm=policy.acquisitionCycles&&!merge&&(normal.length!==1||same.some(u=>gd.isGolden(u.id)))&&(
    (gain.weighted>0&&(id!==IDS47.gnosis||econ.investorActive)&&gain.nativeNet<=2&&(gain.nativeNet<=0||gain.weighted>=12)&&(!fresh||gain.nativeNet<=0))
    ||id===IDS47.flame&&econ.investorActive
    ||econ.investorActive&&gain.freeRefreshes>=2&&gain.nativeNet<=1
    ||gain.nativeNet<=0&&(gain.haloSpend||gain.duskGain));
  if(farm){group=Math.max(group,2);score+=35+gain.weighted*2-Math.max(0,gain.nativeNet)*8;}
  return {group,score,merge,fresh,core,farm,gain,incomeOpening};
}


export function protectedSale47(gd,p,u,chosen){
  if(investorProtected47(gd,p,u))return 'investor-project-member';
  if(chosen.some(v=>v.uid===u.uid))return 'chosen-roster';
  if(u.items?.length)return 'equipped-project';
  const same=own(p).filter(v=>base(gd,v)===base(gd,u));
  if(same.length===2&&same.every(v=>!gd.isGolden(v.id))&&fundedVisibleThird54(gd,p,u.id))
    return 'visible-funded-merge-pair';
  if(same.length===2&&same.every(v=>!gd.isGolden(v.id))&&(hasCore(gd,u)||p.shop.level<5
    ||[IDS47.bell,IDS47.degen,IDS47.arc,IDS47.halo,IDS47.sa].includes(base(gd,u))))return 'merge-pair';
  if(hasCore(gd,u)&&same.length===1&&(rosterBonds47(gd,p,chosen)[CORE47]?.count||0)<6)return 'sole-route-member';
  if([IDS47.arc,IDS47.halo,IDS47.sa,IDS47.bell].includes(base(gd,u))&&same.length===1)return 'growth-or-carry';
  if(heal(gd,u)&&!chosen.some(v=>heal(gd,v)))return 'only-healer';
  return null;
}


export function upgradeFunding47(gd,p,{maxSales=2}={}){
  const units=own(p),legal=units.filter(u=>!investorProtected47(gd,p,u)&&!hasCore(gd,u)&&!u.items?.length
    &&![IDS47.arc,IDS47.halo,IDS47.sa,IDS47.bell].includes(base(gd,u))
    &&!(heal(gd,u)&&units.filter(v=>heal(gd,v)).length<=1)
    &&!(block(gd,u)&&units.filter(v=>block(gd,v)).length<=1)
    &&units.filter(v=>base(gd,v)===base(gd,u)).length!==2)
    .sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid);
  const chosen=[],remaining=units.slice();let gain=0;
  for(const u of legal){
    if(chosen.length>=maxSales||remaining.length<=4)break;
    if(heal(gd,u)&&remaining.filter(v=>heal(gd,v)).length<=1)continue;
    if(block(gd,u)&&remaining.filter(v=>block(gd,v)).length<=1)continue;
    chosen.push(u);remaining.splice(remaining.indexOf(u),1);gain+=gd.sellPrice(u.id);
    if(p.funds+gain>=p.shop.upgradePrice)break;
  }
  return {reachable:p.funds+gain>=p.shop.upgradePrice,sales:chosen,gain};
}


// A pair is a commitment only while a third native quote is visible and funded.
// This guard also covers room() between two purchases in a visible three-copy project.
export function fundedVisibleThird54(gd,p,id){
  if(gd.isGolden(id))return false;
  return [...(p.shop.slots||[]),...(p.shop.rewardOffer?.slots||[])].some(s=>s?.kind==='chess'
    &&!s.sold&&s.id===id&&Number.isFinite(s.price)&&s.price<=p.funds);
}


export function coinRedemption47(gd,p,costs){
  const coins=loose(p).filter(i=>gd.item(i.id)?.name==='盟约之币'&&gd.item(i.id)?.kind==='consume_on_equip');
  const value=coins.reduce((n,i)=>n+Math.max(0,gd.item(i.id)?.params?.min||0),0);
  if(!costs.some(cost=>cost>p.funds&&cost<=p.funds+value))return null;
  const carrier=own(p).find(u=>(u.items?.length||0)<2);
  return carrier&&coins.length?{t:'g.equip',itemUid:coins[0].uid,targetUid:carrier.uid}:null;
}


export function upgradeClearance47(lp,minimumCappedLoss){
  return Number.isFinite(minimumCappedLoss)&&(minimumCappedLoss===0||lp-minimumCappedLoss>=12);
}


// [ASSUMED] Fund an actually quoted once-per-round Sciurus discount with one
// dispensable body. Preserve each investor, healing, blocking and ranged damage.
// The quote comes from the native private view; no imagined discount or future shop.
export function discountFunding52(gd,p,{round=1,bossRound=14,policy=DEFAULT_POLICY47}={}){
  if(p.bandId!=='band_sciurus'||p.funds>=1)return null;
  const units=own(p),chosen=selectRoster47(gd,p);
  const project=p.shop.slots.map((s,slot)=>({s,slot,v:buyValue47(gd,p,s,{round,bossRound,policy})}))
    .filter(o=>o.s?.kind==='chess'&&!o.s.sold&&o.s.price===1&&o.v.core&&o.v.group>=3)
    .sort((a,b)=>b.v.group-a.v.group||b.v.score-a.v.score||a.slot-b.slot)[0];
  if(!project)return null;
  const candidates=units.filter(u=>!hasCore(gd,u)&&!u.items?.length&&!investorProtected47(gd,p,u)
    &&![IDS47.arc,IDS47.halo,IDS47.ptil].includes(base(gd,u))
    &&units.filter(v=>base(gd,v)===base(gd,u)).length!==2
    &&(!heal(gd,u)||units.some(v=>v.uid!==u.uid&&heal(gd,v)))
    &&(!block(gd,u)||units.some(v=>v.uid!==u.uid&&block(gd,v))||block(gd,project.s))
    &&(!rangedDamage(gd,u)||units.some(v=>v.uid!==u.uid&&rangedDamage(gd,v))||rangedDamage(gd,project.s)))
    .sort((a,b)=>Number(chosen.some(u=>u.uid===a.uid))-Number(chosen.some(u=>u.uid===b.uid))
      ||unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid);
  return candidates.length?{uid:candidates[0].uid,project:{slot:project.slot,id:project.s.id,price:1}}:null;
}


// Explanations accompany native purchase receipts. Acquisition benefits happen on
// gain; useful bodies and protected pairs are retained before any sale is considered.
export function purchasePurpose53(gd,p,slot,quote){
  if(slot.kind==='item'){
    const rec=gd.item(slot.id);
    if(['精打细算玩偶','见钱眼开玩偶'].includes(rec?.name))return '经济道具：后续回合回本';
    if(['简易通讯机','寻呼模块'].includes(rec?.name))return '定向招募：优先用纯谢银灰';
    if(quote.earlyTool)return '开局余款：已实现的低价装备强化当前主力';
    if(rec?.canGiveBond||rec?.giveBondId)return '转职项目：补齐叠层盟约';
    return '强化已持有的合成或主力项目';
  }
  const rec=gd.chess(slot.id),id=gd.baseIdOf(slot.id),units=own(p);
  const normals=units.filter(u=>base(gd,u)===id&&!gd.isGolden(u.id));
  if(quote.merge)return normals.length>=2?'完成三合一：当前第三张':'合成项目：当前商店已可凑齐';
  if(quote.core&&quote.fresh)return rec.bonds?.includes('investShip')?'新增谢拉格核心，兼顾投资人':'新增谢拉格核心';
  if(quote.farm)return '获得/花费触发收益：有用本体与配对优先保留';
  if(normals.length===1&&[IDS47.pram,IDS47.gnosis].includes(id))return '保留第二张：冻结战斗与后续合成';
  if(normals.length===1&&(quote.core||[IDS47.arc,IDS47.halo].includes(id)))return '保留第二张：核心构筑合成';
  if(quote.fresh&&rec.bonds?.includes('investShip'))return '投资人项目：保留三种不同干员';
  if(heal(gd,{id:slot.id})&&!units.some(u=>heal(gd,u)))return '补齐缺失医疗';
  if(block(gd,{id:slot.id})&&!units.some(u=>block(gd,u)))return '补齐缺失阻挡';
  if([IDS47.arc,IDS47.halo,IDS47.mumu,IDS47.ptil].includes(id))return '补齐转职、叠层或复制链组件';
  return '补齐可用战斗人数或伤害';
}
