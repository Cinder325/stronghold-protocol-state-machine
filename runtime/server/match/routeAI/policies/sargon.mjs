// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Experimental local Sargon FSM. [ASSUMED] priorities, never game rules.
// Only current visible assets are scored; every mutation is a native intent.
import {computeBonds,pieceBonds} from "../../bondsMeta.js";
import {planLayout,createRehearsal,LAYOUT_PARAMS} from "../../bot.js";
import {botPickCard} from "../../bot.js";
import {applyRestoringPlacement69,createRosterGuard69} from "../support/roster-restoration100.mjs";
import {selectBounty47} from "../support/kjerag-bounty47.mjs";
import {normalPreviewOptions48} from "../support/kjerag-preview48.mjs";
import {planBoss47} from "../support/kjerag-boss57.mjs";
import {healingCoverage57,repairHealing57} from "../support/kjerag-formation57.mjs";
import {relationPlans73,supportValue73} from "../support/sargon-synergy73.mjs";
import {pathProtection52} from "../support/kjerag-search52.mjs";
import {sargonTraits58,sargonChargeHost58} from "../support/sargon-mechanics58.mjs";
import {cashFinish102,passiveCarrier102} from '../support/cashFinish102.js';
import {blockedRecruitmentTool} from '../support/sargon-cash.js';

export const SARGON58='sargonShip';
export const DEFAULT_SARGON58=Object.freeze({name:'v0.12',maxSteps:200,maxRefreshes:20,
 upgradeRounds:[0,0,2,4,6,8,10],survivalHp:10,previewCandidates:5});
export const IDS58=Object.freeze({estelle:'chess_char_1_12_a',sedge:'chess_char_2_06_a',bubble:'chess_char_2_08_a',
 minimal:'chess_char_3_13_a',titi:'chess_char_5_02_a',gavial:'chess_char_5_18_a',passenger:'chess_char_6_05_a',
 pepe:'chess_char_6_06_a',rosmontis:'chess_char_6_12_a',civilight:'chess_char_5_09_a'});
const own=p=>[...p.board,...p.hand,...p.temp].filter(u=>u?.kind==='chess');
const loose=p=>[...p.hand,...p.temp].filter(u=>u?.kind==='item');
const core=(gd,u)=>pieceBonds(gd,u).includes(SARGON58);
const base=(gd,u)=>gd.baseIdOf(u.id);
const healer=(gd,u)=>gd.chess(u.id)?.attackKind==='heal';
const blocker=(gd,u)=>gd.chess(u.id)?.position==='MELEE'&&(gd.chess(u.id)?.stats?.blockCnt||0)>=2;
const bond=(p,id)=>p.bonds.find(b=>b.bondId===id);
const tea=(gd,u)=>(u.items||[]).some(i=>gd.item(i.id)?.giveBondId===SARGON58);
const compass=(gd,u)=>(u.items||[]).some(i=>gd.item(i.id)?.name==='黄沙罗盘');
const investors=(gd,p)=>new Set([...p.board,...p.hand].filter(u=>u?.kind==='chess'&&pieceBonds(gd,u).includes('investShip')).map(u=>base(gd,u)));

export function unitScore58(gd,u){
 const r=gd.chess(u.id),s=r?.stats||{},id=base(gd,u),name=r?.name;
 const priority={[IDS58.sedge]:65,[IDS58.bubble]:45,[IDS58.minimal]:80,[IDS58.titi]:110,
  [IDS58.gavial]:85,[IDS58.passenger]:100,[IDS58.pepe]:95,[IDS58.rosmontis]:core(gd,u)?110:25};
 return (r?.tier||1)*6+(gd.isGolden(u.id)?32:0)+(priority[id]||0)+(core(gd,u)?35:0)
  +(name==='菲莱'?80:0)+(name==='百炼嘉维尔'?85:0)+(name==='魔王'?35:0)+(tea(gd,u)&&compass(gd,u)?180:0)
  +(s.atk||0)/Math.max(1,s.bat||1)/60+(u.items?.length||0)*5;
}

export function rosterBonds58(gd,p,units){
 return computeBonds(gd,{board:new Map(units.map((u,i)=>[String(i),u])),hand:p.hand.filter(u=>u&&!units.some(v=>v.uid===u.uid)),
  layers:Object.fromEntries(p.bonds.map(b=>[b.bondId,b.layers])),m:{rules:null}});
}
export function selectRoster58(gd,p){
 const units=own(p),cap=Math.min(p.deployCap||8,units.length);
 const value=xs=>{
  const bs=rosterBonds58(gd,p,xs),n=bs[SARGON58]?.count||0;
  return xs.reduce((s,u)=>s+unitScore58(gd,u),0)+Math.min(6,n)*38+(n>=3?130:0)+(n>=6?360:0)
   +(xs.some(u=>healer(gd,u))?130:0)+(xs.some(u=>blocker(gd,u))?100:0)
   +(bs.preciShip?.active?100:0)+(bs.swiftShip?.active?100:0)+(bs.maniShip?.active?50:0)
   +supportValue73(gd,p,xs)
   +(xs.some(u=>gd.chess(u.id)?.name==='魔王')&&xs.some(u=>base(gd,u)===IDS58.titi)&&!xs.some(u=>tea(gd,u)&&compass(gd,u))?100:0)
   -xs.filter((u,i)=>xs.slice(0,i).some(v=>base(gd,v)===base(gd,u))).length*75;
 };
 const chosen=[];
 while(chosen.length<cap)chosen.push(units.filter(u=>!chosen.includes(u)).sort((a,b)=>value([...chosen,b])-value([...chosen,a])||a.uid-b.uid)[0]);
 for(let pass=0;pass<3;pass++)for(let i=0;i<chosen.length;i++){
  let high=value(chosen),winner=chosen[i];for(const u of units){if(chosen.includes(u))continue;
   const t=chosen.slice();t[i]=u;const v=value(t);if(v>high+0.01){high=v;winner=u;}}
  chosen[i]=winner;
 }
 return chosen;
}
export function protectedSale58(gd,p,u,chosen=selectRoster58(gd,p)){
 const all=own(p),same=all.filter(v=>base(gd,v)===base(gd,u));
 if(chosen.some(v=>v.uid===u.uid)||u.items?.length)return true;
 if(core(gd,u)&&same.length===1)return true;
 if(same.length===2&&same.every(v=>!gd.isGolden(v.id))&&(core(gd,u)||[IDS58.rosmontis,IDS58.minimal].includes(base(gd,u))))return true;
 if(pieceBonds(gd,u).includes('investShip')&&investors(gd,p).size<=3&&!same.some(v=>v.uid!==u.uid))return true;
 if([IDS58.minimal,IDS58.titi,IDS58.rosmontis].includes(base(gd,u))&&same.length===1)return true;
 if(gd.chess(u.id)?.name==='魔王'&&all.some(v=>base(gd,v)===IDS58.titi)&&same.length===1)return true;
 return false;
}

// Capacity is a reason to release a superseded low-tier bridge, not an excuse
// to sell the investment trio, equipped engines or the actual six-member board.
export function capacitySale67(gd,p,{round,excluded=new Set()}={}){
 const chosen=selectRoster58(gd,p),count=rosterBonds58(gd,p,chosen)[SARGON58]?.count||0;
 return own(p).filter(u=>u.row==null&&!excluded.has(u.uid)&&!chosen.some(v=>v.uid===u.uid)&&!u.items?.length)
  .filter(u=>{
   if(!protectedSale58(gd,p,u,chosen))return true;
   if(!(round>=8&&count>=6&&core(gd,u)&&(gd.chess(u.id)?.tier||1)<=2))return false;
   if(pieceBonds(gd,u).includes('investShip'))return false;
   const normals=own(p).filter(v=>v.id===u.id&&!gd.isGolden(v.id));
   const fundedThird=normals.length===2&&[...p.shop.slots,...(p.shop.rewardOffer?.slots||[])]
    .some(s=>s?.kind==='chess'&&!s.sold&&s.id===u.id&&s.price<=p.funds);
   return !fundedThird;
  }).sort((a,b)=>unitScore58(gd,a)-unitScore58(gd,b)||a.uid-b.uid)[0]||null;
}
export function buyValue58(gd,p,slot,{round=1,reward=false}={}){
 if(!slot||slot.sold)return {group:0,score:0};const units=own(p),rec=slot.kind==='chess'?gd.chess(slot.id):gd.item(slot.id);
 if(!rec||rec.isDiy)return {group:0,score:0};
 if(slot.kind==='item'){
  const available=[...loose(p),...units.flatMap(u=>u.items||[])],copies=available.filter(i=>gd.item(i.id)?.name===rec.name).length;
  const hosts=units.filter(u=>[IDS58.minimal,IDS58.rosmontis].includes(base(gd,u)));
  if(rec.name==='黄沙罗盘')return {group:copies<1&&hosts.length?5:0,score:150};
  if(rec.giveBondId===SARGON58)return {group:copies<Math.max(1,hosts.length)&&hosts.some(u=>!tea(gd,u))?4:0,score:115};
  if(rec.canGiveBond)return {group:copies<1&&units.some(u=>base(gd,u)===IDS58.rosmontis||!core(gd,u)&&tea(gd,u))?4:0,score:110};
  if(rec.name==='精打细算玩偶'&&units.length&&round<=6&&(reward||p.lp>10))return {group:4,score:120-round*5};
  if(['简易通讯机','寻呼模块'].includes(rec.name)&&units.some(u=>core(gd,u)&&(u.items?.length||0)<2))return {group:4,score:115};
  if(rec.giveBondId==='preciShip'&&copies<1&&units.some(u=>core(gd,u)))return {group:2,score:45};
  return {group:0,score:0};
 }
 const id=gd.baseIdOf(slot.id),same=units.filter(u=>base(gd,u)===id),normal=same.filter(u=>!gd.isGolden(u.id));
 const isCore=rec.bonds?.includes(SARGON58),fresh=!same.length,merge=normal.length>=2;
 let group=merge&&(isCore||[IDS58.rosmontis,IDS58.minimal].includes(id))?5:isCore&&fresh?4:0;
 let score=unitScore58(gd,{...slot,kind:'chess',items:[]})-slot.price*2;
 if(isCore&&normal.length===1&&!same.some(u=>gd.isGolden(u.id)))group=Math.max(group,3);
 if([IDS58.titi,IDS58.minimal,IDS58.gavial,IDS58.passenger,IDS58.pepe].includes(id)&&fresh)group=Math.max(group,4);
 if(gd.chess(slot.id)?.name==='魔王'&&fresh&&units.some(u=>base(gd,u)===IDS58.titi))group=Math.max(group,3);
 if(id===IDS58.rosmontis&&fresh&&p.shop.level>=5)group=Math.max(group,3);
 if(healer(gd,slot)&&!units.some(u=>healer(gd,u)))group=Math.max(group,4);
 if(blocker(gd,slot)&&!units.some(u=>blocker(gd,u)))group=Math.max(group,3);
 if(fresh&&rec.bonds?.includes('maniShip')&&(bond(p,SARGON58)?.count||0)>=4&&(bond(p,SARGON58)?.count||0)<6)group=Math.max(group,3);
 if(fresh&&rec.bonds?.includes('preciShip')&&!units.some(u=>pieceBonds(gd,u).includes('preciShip'))&&units.some(u=>core(gd,u)))group=Math.max(group,2);
 if(fresh&&rec.bonds?.includes('investShip')&&investors(gd,p).size<3&&round<=10)group=Math.max(group,3);
 if(fresh&&['莱恩哈特','寒芒克洛丝','华法琳'].includes(rec.name)&&units.some(u=>core(gd,u))){
  const supports=units.filter(u=>['莱恩哈特','寒芒克洛丝','华法琳'].includes(gd.chess(u.id)?.name));
  if(supports.length<2){group=Math.max(group,3);score+=rec.name==='莱恩哈特'?125:85;}
 }
 if(fresh&&rec.name==='妮芙'&&units.some(u=>pieceBonds(gd,u).includes('swiftShip'))&&p.hand.filter(u=>u?.kind==='chess').length>=3){group=Math.max(group,3);score+=75;}
 if(same.some(u=>gd.isGolden(u.id))&&!merge)group=0;
 if(fresh&&units.length<Math.min(4,round+1)&&rec.attackKind!=='none')group=Math.max(group,1);
 if(reward&&sargonTraits58(gd,{id:slot.id}).acquisition.some(t=>/ADD_BOND|COIN|GOLD|FUND/.test(t.effect)))score+=50;
 return {group,score,merge,fresh,isCore};
}

// Fund a visible project only. A replacement can release an obsolete body
// only when the projected roster excludes it. Key-sale protections still apply.
export function fundingSale59(gd,p,{price,replacement=null,excluded=new Set()}={}){
 if(!(price>p.funds))return null;
 const projected=replacement?{...p,temp:[...p.temp,{...replacement,uid:-1,items:[]}]}:p;
 const chosen=selectRoster58(gd,projected);
 const sale=own(p).filter(u=>!excluded.has(u.uid)&&!protectedSale58(gd,p,u,chosen))
  .sort((a,b)=>Number(a.row!=null)-Number(b.row!=null)||unitScore58(gd,a)-unitScore58(gd,b)||a.uid-b.uid);
 if(p.funds+sale.reduce((s,u)=>s+gd.sellPrice(u.id),0)<price)return null;
 return sale[0]||null;
}

// A leftover card carries resale value across a cash-reset boundary. It costs
// money, occupies space, and is never represented as free income.
export function bankOffer59(gd,p,{excluded=new Set()}={}){
 if(!p.hand.some(u=>u==null))return null;
 return p.shop.slots.map((s,slot)=>({s,slot})).filter(({s})=>s?.kind==='chess'&&!s.sold&&!excluded.has(s.id)
  &&s.price>0&&s.price<=p.funds&&gd.sellPrice(s.id)>0
  &&!own(p).some(u=>base(gd,u)===gd.baseIdOf(s.id)))
  .sort((a,b)=>gd.sellPrice(b.s.id)/b.s.price-gd.sellPrice(a.s.id)/a.s.price||a.s.price-b.s.price||a.slot-b.slot)[0]||null;
}

// These are visible-budget decisions, not predictions of the next shop roll.
// A weak wave does not justify a perpetual tier-five lock. Opening the terminal
// tier is a multi-round project; no hard reserve for a same-round purchase.
export function upgradeBudget61(gd,p,{target,critical=false,loss=null,survivalHp=10}={}){
 if(p.shop.level>=target||p.funds<p.shop.upgradePrice||critical)return false;
 const after=p.funds-p.shop.upgradePrice,terminalProject=p.shop.level===5
  &&own(p).some(u=>core(gd,u))&&!own(p).some(u=>tea(gd,u)&&compass(gd,u));
 return p.lp>survivalHp&&p.shop.level<4||loss===0
  ||Number.isFinite(loss)&&p.lp-loss>=12&&after>=3
  ||terminalProject;
}

export function equipStep58(gd,p,{round=1,excluded=new Set(),canRelease=()=>true,allowRecruit=true,allowRewards=true}={}){
 const units=own(p),empty=u=>(u.items?.length||0)<2,items=loose(p);
 for(const it of items){
  const rec=gd.item(it.id);if(rec?.itemType!=='EQUIP')continue;let targets=[];
  if(allowRecruit&&rec.buffs?.some(b=>b.key==='use_equip_recruit_new_char_and_give_char_to_player_most_bond')){
   const spare=capacitySale67(gd,p,{round,excluded});if(spare&&canRelease(spare.uid)&&empty(spare))targets=[spare];
  }else if(rec.buffs?.some(b=>b.key==='equip_round_start_upgrade_char'||allowRewards&&b.key==='use_equip_upgrade_char')){
   const selected=new Set(selectRoster58(gd,p).map(u=>u.uid));
   targets=units.filter(u=>selected.has(u.uid)&&!gd.isGolden(u.id)&&empty(u))
    .sort((a,b)=>unitScore58(gd,b)-unitScore58(gd,a)||a.uid-b.uid);
  }else if(rec.name==='黄沙罗盘')targets=units.filter(u=>empty(u)&&!compass(gd,u)&&tea(gd,u))
   .sort((a,b)=>sargonChargeHost58(gd,b).score-sargonChargeHost58(gd,a).score||unitScore58(gd,b)-unitScore58(gd,a));
  else if(rec.giveBondId===SARGON58){
   targets=units.filter(u=>empty(u)&&!tea(gd,u)&&[IDS58.minimal,IDS58.rosmontis].includes(base(gd,u)))
    .sort((a,b)=>Number(base(gd,b)===IDS58.minimal)-Number(base(gd,a)===IDS58.minimal)||unitScore58(gd,b)-unitScore58(gd,a));
   if(!targets.length)targets=units.filter(u=>empty(u)&&core(gd,u)&&!tea(gd,u));
  }else if(rec.canGiveBond){
   targets=units.filter(u=>empty(u)&&!core(gd,u)&&tea(gd,u));
   if(!targets.length){const selected=new Set(selectRoster58(gd,p).map(u=>u.uid));
    targets=units.filter(u=>selected.has(u.uid)&&empty(u)&&![IDS58.minimal,IDS58.rosmontis].includes(base(gd,u))
     &&!(u.items||[]).some(i=>gd.item(i.id)?.canGiveBond)
     &&(u.items||[]).some(i=>{const id=gd.item(i.id)?.giveBondId;return id&&!gd.modeInactiveBonds.has(id)&&!pieceBonds(gd,u).includes(id);}))
     .sort((a,b)=>unitScore58(gd,b)-unitScore58(gd,a)||a.uid-b.uid);
   }
  }
  else if(['精打细算玩偶','见钱眼开玩偶'].includes(rec.name))targets=units.filter(empty);
  else if(['简易通讯机','寻呼模块'].includes(rec.name))targets=units.filter(u=>empty(u)&&core(gd,u))
   .sort((a,b)=>(pieceBonds(gd,a).length-pieceBonds(gd,b).length)||a.uid-b.uid);
  else if(rec.giveBondId==='preciShip')targets=units.filter(u=>empty(u)&&core(gd,u)&&!pieceBonds(gd,u).includes('preciShip')&&base(gd,u)!==IDS58.minimal);
  else if(rec.category==='SP'&&rec.kind==='passive'&&(rec.params?.sp_each_person||0)>0){
   const selected=new Set(selectRoster58(gd,p).map(u=>u.uid));
   targets=units.filter(u=>selected.has(u.uid)&&empty(u)&&![IDS58.minimal,IDS58.rosmontis].includes(base(gd,u))
    &&!(u.items||[]).some(i=>gd.item(i.id)?.baseId===rec.baseId))
    .sort((a,b)=>unitScore58(gd,b)-unitScore58(gd,a)||a.uid-b.uid);
  }
  else if(rec.kind==='passive'&&!rec.giveBondId&&!rec.canGiveBond)targets=units.filter(u=>empty(u)&&u.row!=null
   &&![IDS58.minimal,IDS58.rosmontis].includes(base(gd,u))).sort((a,b)=>unitScore58(gd,b)-unitScore58(gd,a));
  if(targets.length)return {t:'g.equip',itemUid:it.uid,targetUid:targets[0].uid};
 }
 return null;
}

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
  let p=observe().match.private;if(p.hand.some(u=>u==null))return true;layout(false);p=observe().match.private;
  if(p.hand.some(u=>u==null))return true;
  if(guard.status().pending.length||guard.status().missingSelected.length)return false;
  const surplus=capacitySale67(gd,p,{round,excluded:saleExclusions()});
  return !!surplus&&act({t:'g.sell',uid:surplus.uid},'capacity-non-key');
 };
 for(let step=0;step<policy.maxSteps;step++){
  const p=observe().match.private,key=JSON.stringify([p.funds,p.shop,p.board,p.hand,p.temp,p.personalChoice]);
  if(key===previous){stopReason='unchanged-state';break;}previous=key;
  if(p.personalChoice){layout(false);const choice=selectBounty47(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i),{note});
   const idx=choice.index??botPickCard(m,ps,p.personalChoice.cards,p.personalChoice.cards.map((_,i)=>i));
   if(!act({t:'g.choice',idx,choiceId:p.personalChoice.id},'choose-native-offer'))break;continue;}
  if(p.shop.rewardOffer){
   if(!capacity()){stopReason='reward-capacity';break;}
   const fresh=observe().match.private,offers=fresh.shop.rewardOffer.slots.map((s,idx)=>({s,idx,...buyValue58(gd,fresh,s,{round,reward:true})}))
    .filter(o=>o.s&&!o.s.sold&&o.s.price<=fresh.funds).sort((a,b)=>b.group-a.group||b.score-a.score||a.idx-b.idx);
   if(!offers.length||!act({t:'g.reward',idx:offers[0].idx},'native-free-choice'))break;continue;
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
 for(let n=0;n<40;n++){
  const p=observe().match.private,due=p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));if(!due.length)break;
  const equip=equipStep58(gd,p,{round,excluded:saleExclusions(),canRelease:uid=>guard.canSell(uid),allowRecruit:false,allowRewards:false});if(equip&&due.some(u=>u.uid===equip.itemUid)){if(!act(equip,'consume-due-item'))break;continue;}
  const free=p.hand.findIndex(u=>u==null);if(free>=0){if(!act({t:'g.move',uid:due[0].uid,to:{area:'hand',idx:free}},'rescue-due-card'))break;continue;}
  const disposable=capacitySale67(gd,p,{round,excluded:saleExclusions()});
  if(disposable){if(!act({t:'g.sell',uid:disposable.uid},'rescue-release-non-key'))break;continue;}break;
 }
 finishCash();
 const p=observe().match.private,unresolved=p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));
 const restoration=guard.status(),blocked=unresolved.length>0||!!p.personalChoice||!!p.shop.rewardOffer
  ||restoration.pending.length>0||restoration.missingSelected.length>0,ready=!blocked&&act({t:'g.ready',ready:true},'ready');
 note('sargon-prep58',{round,stopReason,refreshes,ready,blocked,decisions:decisions.length,errors,
  expiringFunds:gd.leftoverKeptBands.includes(p.bandId)?0:p.funds,cashReceipts,
  budgetNote:p.funds?'No permitted affordable purchase/refresh/upgrade or action/capacity bound; not intentional cash saving':'Current-round budget spent'});
 return {economic:{selections:decisions,stopReason,refreshes,policy,cashReceipts},completion:{ready,blocked,errors,layout:finalLayout,restoration}};
}
