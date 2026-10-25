// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
import {cashFinish102} from "../support/cashFinish102.js";
import {ensurePurchaseRoom103} from "../support/kjerag-room103.mjs";
// Research-only Kjerag recipe. All mutations go through native intents. Policy constants are
// [ASSUMED] heuristics; no rule, resource, shared-stock, future-shop or random-state manipulation.
import {computeBonds,pieceBonds} from "../../bondsMeta.js";
import {legalTiles,placeClass,canPlace,parseKey} from "../../board.js";
import {planLayout,layoutValue,rangeTiles,rangeRec,fieldModel,LayoutPlan,createRehearsal,LAYOUT_PARAMS} from "../../bot.js";
import {rotateOffset} from "../../../sim/dir.js";
import {applyPlacement47} from "../support/kjerag-placement100.mjs";
import {forecastLayerGains} from "../support/layerForecast.js";
import {chooseTacticalRoster47} from "../support/kjerag-roster47.mjs";
import {openingOpportunity47} from "../support/kjerag-opening47.mjs";
import {reserveVisibleProject47} from "../support/kjerag-reserve47.mjs";
import {selectBounty47} from "../support/kjerag-bounty47.mjs";
import {planBoss47,bossAura47} from "../support/kjerag-boss57.mjs";
import {projectionKind56,projectionQuote56,projectionEquip56} from "../support/kjerag-projection56.mjs";
import {refineWave47} from "../support/kjerag-search52.mjs";
import {normalPreviewOptions48} from "../support/kjerag-preview48.mjs";
export const CORE47='kjeragShip';
export const IDS47=Object.freeze({tank:'chess_char_1_02_a',medic:'chess_char_2_05_a',pram:'chess_char_3_14_a',
  gnosis:'chess_char_4_13_a',silver:'chess_char_4_22_a',arc:'chess_char_3_21_a',sa:'chess_char_5_14_a',
  halo:'chess_char_6_16_a',bell:'chess_char_6_02_a',degen:'chess_char_6_19_a',
  tin:'chess_char_2_19_a',swire:'chess_char_3_04_a',mountain:'chess_char_5_17_a',
  flame:'chess_char_4_19_a',minimal:'chess_char_3_13_a',mumu:'chess_char_6_11_a',dusk:'chess_char_5_12_a',
  ptil:'chess_char_4_21_a',cliff:'chess_char_3_02_a'});
const DIRS=['RIGHT','UP','DOWN','LEFT'];
const own=p=>[...p.board,...p.hand,...p.temp].filter(x=>x?.kind==='chess');
const loose=p=>[...p.hand,...p.temp].filter(x=>x?.kind==='item');
const base=(gd,p)=>gd.baseIdOf(p.id);
const is=(gd,p,id)=>base(gd,p)===id;
const hasCore=(gd,p)=>pieceBonds(gd,p).includes(CORE47);
const heal=(gd,p)=>gd.chess(p.id)?.attackKind==='heal'||['塞雷娅','古米','黍','瑕光'].includes(gd.chess(p.id)?.name);
const block=(gd,p)=>gd.chess(p.id)?.position==='MELEE'&&(gd.chess(p.id)?.stats?.blockCnt||0)>=2;
const rangedDamage=(gd,u)=>gd.chess(u.id)?.position==='RANGED'&&!heal(gd,u)&&gd.chess(u.id)?.attackKind!=='none';
const coreOf=p=>(p.bonds||[]).find(b=>b.bondId===CORE47);
export const DEFAULT_POLICY47=Object.freeze({name:'v8.9',upgradeRounds:[0,0,2,4,5,6,10],maxSteps:300,
  maxRefreshes:24,layerWeight:0.7,layoutPasses:2,mergeHunt:true,reachableUpgradeBudget:true,maxUpgradeSales:2,
  narrowBridge:true,visibleProjectBeforeUpgrade:true,rehearsalCandidates:3,survivalHp:10,
  previewLpBudget:true,plannedPreviewTrade:2,localRankerGuard:true,
  investorProject:true,acquisitionCycles:true,maxCycles:24,freezeExposureWeight:12,
  targetKjerag:300,targetSkillful:100,conversionReserve:true,retainArchetto:true});
const prepHistory47=new WeakMap();

// Visible/native receipts, not a hidden-stock or future-card forecast. All budgets below
// are [ASSUMED] recipe choices. Temporary overflow never activates BOARD_AND_DECK bonds.
export function economy47(gd,p){
  const eligible=[...p.board,...p.hand].filter(u=>u?.kind==='chess');
  const investors=new Set(eligible.filter(u=>pieceBonds(gd,u).includes('investShip')).map(u=>base(gd,u)));
  const b=Object.fromEntries((p.bonds||[]).map(b=>[b.bondId,b]));
  const active=!!b.investShip?.active,repeat=active?(b.investShip.layers>=100?3:2):1;
  return {investors:[...investors],investorCount:investors.size,investorActive:active,repeat,
    haloOnBoard:p.board.some(u=>u?.kind==='chess'&&is(gd,u,IDS47.halo)),
    duskOnBoard:p.board.some(u=>u?.kind==='chess'&&is(gd,u,IDS47.dusk)),
    skillActive:!!b.skillfulShip?.active,arcaneActive:!!b.arcaneShip?.active,
    needsMorph:conversionProjects47(gd,p).filter(u=>!(u.items||[]).some(i=>gd.item(i.id)?.canGiveBond)).length
      >loose(p).filter(i=>gd.item(i.id)?.canGiveBond).length};
}
// Count unfinished conversion hosts, not an unrelated morph worn by another unit.
export function conversionProjects47(gd,p){
  const units=own(p);
  return [IDS47.arc,IDS47.halo].flatMap(id=>{
    const hosts=units.filter(u=>base(gd,u)===id);
    if(hosts.some(u=>hasCore(gd,u)))return [];
    return hosts.sort((a,b)=>Number(gd.isGolden(b.id))-Number(gd.isGolden(a.id))
      ||(b.items?.length||0)-(a.items?.length||0)||a.uid-b.uid).slice(0,1);
  });
}
export function acquisition47(gd,p,slot){
  const rec=slot?.kind==='chess'?gd.chess(slot.id):null,e=economy47(gd,p);
  const layers={};let freeRefreshes=0;
  for(const id of rec?.garrisonIds||[]){
    const g=gd.garrison(id);
    if(g?.eventType==='SERVER_GAIN'&&g.effectKey==='SERVER_ADD_BOND_CHESS_ALL')
      for(const bond of rec.bonds||[])layers[bond]=(layers[bond]||0)+(g.bb?.count||0)*e.repeat;
    if(g?.eventType==='SERVER_GAIN'&&g.effectKey==='SERVER_GAIN_FREE_REFRESH_COUNT')
      freeRefreshes+=(g.bb?.count||0)*e.repeat;
  }
  const nativeNet=(slot?.price||0)-(rec?gd.sellPrice(slot.id):0);
  // Acquisition layers persist even before the bond is activated. Do not throw away
  // early Skillful gains because its second deployed base has not been drawn yet.
  const weighted=(layers.kjeragShip||0)*2+(layers.skillfulShip||0)*2+(e.arcaneActive?layers.arcaneShip||0:0);
  return {layers,weighted,nativeNet,repeat:e.repeat,freeRefreshes,
    haloSpend:e.haloOnBoard&&(e.skillActive||e.arcaneActive),duskGain:e.duskOnBoard&&e.arcaneActive};
}
function investorProtected47(gd,p,u){
  if(!pieceBonds(gd,u).includes('investShip'))return false;
  const eligible=[...p.board,...p.hand].filter(v=>v?.kind==='chess'&&v.uid!==u.uid);
  return !eligible.some(v=>base(gd,v)===base(gd,u))&&economy47(gd,p).investorCount<=3;
}

export function routeEligibility47(gd,pub){
  const banned=new Set(pub.bannedChess||[]),eligible=Object.values(gd.raw.chess).filter(r=>r.visible&&!r.isGolden&&!r.isDiy
    &&!banned.has(r.chessId)&&r.bonds?.includes(CORE47)).map(r=>({id:r.chessId,name:r.name}));
  return {nativeShopCoreBases:eligible.length,eligible,bannedKeyTargets:Object.values(IDS47).filter(id=>banned.has(id))
    .map(id=>({id,name:gd.chess(id)?.name})),mainCarry:banned.has(IDS47.bell)?'available-owned-freeze-or-degen':'bell-if-actually-obtained',
    sixMemberConstraint:eligible.length<6?'Requires actually obtained morph membership or another native legal grant; never assume future equipment':'Six native bases exist, draws remain uncertain'};
}

export function rosterBonds47(gd,p,units){
  return computeBonds(gd,{board:new Map(units.map((u,i)=>[String(i),u])),hand:p.hand.filter(u=>u&&!units.some(v=>v.uid===u.uid)),
    layers:Object.fromEntries((p.bonds||[]).map(b=>[b.bondId,b.layers])),m:{rules:null}});
}
export function unitValue47(gd,p,u){
  const rec=gd.chess(u.id),id=base(gd,u),layers=coreOf(p)?.layers||0;
  const bonus={[IDS47.tank]:4,[IDS47.medic]:18,[IDS47.pram]:13,[IDS47.gnosis]:38,[IDS47.silver]:25,
    [IDS47.arc]:30,[IDS47.sa]:34,[IDS47.halo]:45,[IDS47.bell]:70+Math.min(70,layers*0.5),[IDS47.degen]:55,
    [IDS47.ptil]:own(p).some(v=>is(gd,v,IDS47.arc))?75:20,[IDS47.cliff]:25};
  const econ=economy47(gd,p);
  const income=id===IDS47.swire&&!econ.investorActive&&p.shop.level<=4?30:0;
  const arcEngine=id===IDS47.dusk&&econ.haloOnBoard?28:0;
  return (rec?.tier||1)*5+(rec?.isGolden?15:0)+(bonus[id]||0)+(u.items?.length||0)*4+income+arcEngine;
}
export function selectRoster47(gd,p){
  const units=own(p),cap=p.deployCap||8;
  const value=set=>{
    const b=rosterBonds47(gd,p,set),k=b[CORE47]?.count||0;
    let n=set.reduce((v,u)=>v+unitValue47(gd,p,u),0)+Math.min(6,k)*30+(k>=3?50:0)+(k>=6?150:0);
    if(set.some(u=>heal(gd,u)))n+=75;
    if(set.some(u=>block(gd,u)))n+=70;
    if(set.filter(u=>block(gd,u)).length>=2)n+=15;
    if(set.some(u=>rangedDamage(gd,u)))n+=55;
    for(const id of ['skillfulShip','arcaneShip'])if(b[id]?.active)n+=30+Math.min(30,(b[id]?.layers||0)*0.2);
    // The growth engine is useful only while its battle bonds stay active. A
    // second copy of a carry must not routinely evict the second Skillful base.
    if(b[CORE47]?.active&&b.skillfulShip?.active&&set.some(u=>is(gd,u,IDS47.halo)))
      n+=100+Math.min(80,(b.skillfulShip.layers||0)*0.5);
    if(b[CORE47]?.active&&b.skillfulShip?.active&&set.some(u=>is(gd,u,IDS47.arc)))
      n+=180;
    if(set.some(u=>is(gd,u,IDS47.arc))&&set.some(u=>is(gd,u,IDS47.ptil)))n+=100;
    if(set.filter(u=>is(gd,u,IDS47.ptil)).length>1)n-=160;
    return n;
  };
  const set=[];
  while(set.length<Math.min(cap,units.length)){
    const next=units.filter(u=>!set.includes(u)).sort((a,b)=>value([...set,b])-value([...set,a])||a.uid-b.uid)[0];
    set.push(next);
  }
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(let i=0;i<set.length;i++){
      const score=value(set);let winner=null,best=score;
      for(const u of units){if(set.includes(u))continue;const trial=set.slice();trial[i]=u;const v=value(trial);
        if(v>best+0.001){best=v;winner=u;}}
      if(winner){set[i]=winner;changed=true;}
    }
    if(!changed)break;
  }
  return set;
}

export function phase47(gd,p,round,bossRound){
  if(round>=bossRound)return 'BOSS_CONVERSION';
  const k=rosterBonds47(gd,p,selectRoster47(gd,p))[CORE47]?.count||0;
  if(p.shop.level<3)return 'OPENING_BRIDGE';
  if(k<3)return 'BUILD_CORE3';
  if(k<6)return 'PROMOTION_AND_CORE6';
  return 'GROWTH_TO_DAMAGE';
}
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

function copyPlan(plan){const out=new LayoutPlan(plan);out.dirs=new Map(plan.dirs);return out;}

// A pair is a commitment only while a third native quote is visible and funded.
// This guard also covers room() between two purchases in a visible three-copy project.
export function fundedVisibleThird54(gd,p,id){
  if(gd.isGolden(id))return false;
  return [...(p.shop.slots||[]),...(p.shop.rewardOffer?.slots||[])].some(s=>s?.kind==='chess'
    &&!s.sold&&s.id===id&&Number.isFinite(s.price)&&s.price<=p.funds);
}

// Data-driven whitelist of harmless implemented stat equipment. Damage-over-time,
// stat penalties, summons, random effects and unknown passive handlers are excluded.
export function simpleTool54(gd,id){
  const r=gd.item(id),allowed=new Set(['atk','def','max_hp','magic_resistance','attack_speed']);
  return !!r&&r.itemType==='EQUIP'&&r.kind==='passive'&&r.category==='STAT'&&!r.canGiveBond
    &&Array.isArray(r.buffs)&&r.buffs.length===1&&r.buffs[0]?.bbStr?.key==='attr_common_global_buff'
    &&Object.entries(r.buffs[0]?.bb||{}).length>0
    &&Object.entries(r.buffs[0].bb).every(([k,v])=>allowed.has(k)&&Number.isFinite(v)&&v>0);
}
function simpleToolValue54(gd,rec,u){
  return (rec.params?.def||rec.params?.max_hp?Number(block(gd,u))*100:0)
    +(rec.params?.atk?Number(!heal(gd,u)&&gd.chess(u.id)?.attackKind!=='none')*100:0);
}
export function simpleToolTargets54(gd,p,rec){
  const selected=new Set(selectRoster47(gd,p).map(u=>u.uid));
  return own(p).filter(u=>selected.has(u.uid)&&(u.items?.length||0)<2
    &&![IDS47.arc,IDS47.halo].includes(base(gd,u)))
    .sort((a,b)=>simpleToolValue54(gd,rec,b)-simpleToolValue54(gd,rec,a)
      ||unitValue47(gd,p,b)-unitValue47(gd,p,a)||a.uid-b.uid);
}

// Select three DISTINCT actual investor bases, preferring Saint SilverAsh's dual
// combat/economy use. A fourth different investor is not itself a mandatory fourth slot.
function investorReserve54(gd,p){
  const units=own(p),where=u=>p.board.some(v=>v.uid===u.uid)?0:p.hand.some(v=>v?.uid===u.uid)?1:2;
  const byBase=new Map();
  for(const u of units.filter(u=>pieceBonds(gd,u).includes('investShip'))
    .sort((a,b)=>Number(is(gd,b,IDS47.sa))-Number(is(gd,a,IDS47.sa))
      ||where(a)-where(b)||Number(gd.isGolden(b.id))-Number(gd.isGolden(a.id))||a.uid-b.uid))
    if(!byBase.has(base(gd,u)))byBase.set(base(gd,u),u);
  return new Set([...byBase.values()].slice(0,3).map(u=>u.uid));
}
function overflowKey54(gd,p,u,chosen,investors){
  if(u.kind==='item')return true;
  if(u.kind!=='chess')return false; // summon stacks return next round natively
  if(chosen.some(v=>v.uid===u.uid))return true;
  if(investors.has(u.uid))return true;
  const reason=protectedSale47(gd,p,u,chosen);
  if(reason==='investor-project-member')return false; // excess fourth member only
  return !!reason;
}

// Native PREP expiry destroys unresolved due cards (not a paid sell). Rescue keys
// into normal storage, then sell dispensable due bodies before Ready. Every step
// reobserves native state because refills, gifts and merges can change the queue.
export function rescueOverflow54(m,ps,{observe,handle,note=()=>{},maxSteps=80,allowDeploy=true}={}){
  const gd=ps.gd||m.gd,receipt={kind:'native-prep-overflow-rescue',steps:[],unresolved:[],settled:false};
  const due=p=>p.temp.filter(u=>u&&u.kind!=='token'&&(!ps.tempDue||ps.tempDue(u)<=ps.prepsEnded));
  const act=(intent,task,purpose)=>{
    const result=handle(intent,`fsm54:${task}`,{task,purpose});receipt.steps.push({intent,task,purpose,accepted:result?.ok===true,result});
    return result?.ok===true;
  };
  const seen=new Set();
  for(let step=0;step<maxSteps;step++){
    const p=observe().match.private,expired=due(p);if(!expired.length)break;
    const sig=JSON.stringify([p.board,p.hand,p.temp]);if(seen.has(sig))break;seen.add(sig);
    const chosen=selectRoster47(gd,p),investors=investorReserve54(gd,p),keys=expired.filter(u=>overflowKey54(gd,p,u,chosen,investors));
    const equips=equipStep47(gd,p,{round:m.round});
    if(equips&&expired.some(u=>u.uid===equips.itemUid)){
      if(!act(equips,'consume-due-item','使用即将到期的有效道具并重新检查招募溢出'))break;continue;
    }
    const key=keys[0];
    if(key){
      const free=p.hand.findIndex(x=>x==null);
      if(free>=0){if(!act({t:'g.move',uid:key.uid,to:{area:'hand',idx:free}},'rescue-key-to-hand','将临时区关键牌移入正式手牌'))break;continue;}
      // A native hand/temp swap rescues the key without depending on the refill
      // queue's order; the displaced non-key is explicitly sold on the next pass.
      const replace=p.hand.map((u,idx)=>({u,idx})).filter(({u})=>u?.kind==='chess'
        &&!overflowKey54(gd,p,u,chosen,investors)&&!u.items?.length)
        .sort((a,b)=>unitValue47(gd,p,a.u)-unitValue47(gd,p,b.u)||a.u.uid-b.u.uid)[0];
      if(replace){
        if(!act({t:'g.move',uid:key.uid,to:{area:'hand',idx:replace.idx}},'swap-key-out-of-overflow','关键牌换入手牌，非关键单张移至待清理区'))break;continue;
      }
      if(allowDeploy&&key.kind==='chess'&&chosen.some(u=>u.uid===key.uid)){
        const legal=legalTiles(ps.deployMap(),placeClass(ps,gd.chess(key.id)));
        const target=legal.find(([r,c])=>!p.board.some(u=>u.row===r&&u.col===c)&&p.board.filter(u=>u.kind==='chess').length<p.deployCap)
          ||legal.find(([r,c])=>p.board.some(u=>u.row===r&&u.col===c&&u.kind==='chess'
            &&!overflowKey54(gd,p,u,chosen,investors)&&!u.items?.length));
        if(target){if(!act({t:'g.move',uid:key.uid,to:{area:'board',row:target[0],col:target[1]},dir:'RIGHT'},
          'deploy-overflow-key','先部署关键干员，随后统一重排真实阵容'))break;continue;}
      }
      // Existing useful equipment may free an ordinary slot without liquidating a key.
      if(equips){if(!act(equips,'equip-to-free-hand','装备已有有效道具为关键牌腾出正式空间'))break;continue;}
      break;
    }
    const surplus=expired.filter(u=>u.kind==='chess'&&!u.items?.length).sort((a,b)=>unitValue47(gd,p,a)-unitValue47(gd,p,b)||a.uid-b.uid)[0];
    if(!surplus)break;
    if(!act({t:'g.sell',uid:surplus.uid},'sell-due-non-key','到期前回收非关键单张，避免原生到期销毁'))break;
  }
  const p=observe().match.private,chosen=selectRoster47(gd,p),investors=investorReserve54(gd,p);
  receipt.unresolved=due(p).map(u=>({uid:u.uid,id:u.id,kind:u.kind,key:overflowKey54(gd,p,u,chosen,investors)}));
  receipt.safe=receipt.unresolved.length===0;
  receipt.reason=receipt.safe?'No due operator/item remains in temp':'No safe native capacity operation remains; do not Ready and silently lose keys';
  note('fsm-overflow-rescue54',receipt);return receipt;
}
export function choosePreview45(candidates,{lp,cap,plannedTrade=2}){
  const full=candidates.map((c,index)=>({...c,index,cappedLoss:Math.min(cap,c.countedLeaks)}))
    .filter(c=>c.finished&&Number.isFinite(c.countedLeaks));
  if(!full.length)return 0;
  const minimum=Math.min(...full.map(c=>c.cappedLoss));
  const budget=lp>cap+2&&minimum<=2?Math.min(plannedTrade,Math.max(0,lp-minimum-1)):0;
  const safe=full.filter(c=>c.cappedLoss<=minimum+budget);
  safe.sort((a,b)=>(minimum>=lp?a.countedLeaks-b.countedLeaks:0)
    ||((b.growthScore||0)-b.cappedLoss*3)-((a.growthScore||0)-a.cappedLoss*3)
    ||a.cappedLoss-b.cappedLoss||a.countedLeaks-b.countedLeaks||a.index-b.index);
  return safe[0].index;
}

export function geometry47(gd,p,units,plan,recOf,model=null,freezeWeight=12){
  const at=new Map(units.filter(u=>plan.has(u.uid)).map(u=>[plan.get(u.uid),u]));
  const b=rosterBonds47(gd,p,units),links=[];let gain=0,healedFront=0;
  for(const u of units){
    const key=plan.get(u.uid);if(!key)continue;const [r,c]=parseKey(key),dir=plan.dirOf(u.uid);
    if(is(gd,u,IDS47.arc)||is(gd,u,IDS47.sa)){
      const [dr,dc]=rotateOffset(0,1,dir),target=at.get(`${r+dr},${c+dc}`),bs=target?pieceBonds(gd,target):[];
      if(is(gd,u,IDS47.arc)){
        const n=gd.isGolden(u.id)?6:3;
        const targetB=bs.filter(id=>b[id]?.active),selfB=pieceBonds(gd,u).filter(id=>b[id]?.active);
        gain+=selfB.reduce((s,id)=>s+n*(id===CORE47?2:1),0);
        gain+=targetB.reduce((s,id)=>s+n*(id===CORE47?2:1),0);
        links.push({kind:'next-prep-start',uid:u.uid,target:target?.uid??null,targetName:target?gd.chess(target.id)?.name:null,
          selfBonds:selfB,targetBonds:targetB});
      }else if(target&&bs.includes(CORE47)){
        // This only values the legal relation; current combat still must create real freezes.
        gain+=6+(is(gd,target,IDS47.gnosis)||is(gd,target,IDS47.pram)?6:0);
        links.push({kind:'current-battle-front-grant',uid:u.uid,target:target.uid,targetName:gd.chess(target.id)?.name});
      }
    }
    if(heal(gd,u)){
      const covered=new Set(rangeTiles(recOf(u),r,c,dir));
      healedFront+=units.filter(v=>block(gd,v)&&covered.has(plan.get(v.uid))).length;
    }
  }
  const receivers=units.filter(u=>is(gd,u,IDS47.pram)||is(gd,u,IDS47.silver));
  for(const link of links.filter(l=>l.kind==='current-battle-front-grant')){
    const target=units.find(u=>u.uid===link.target);if(target)receivers.push(target);
  }
  let freezeExposure=0;
  if(model){
    const total=Math.max(1,model.routes.reduce((s,r)=>s+r.n,0));
    for(const u of receivers){
      const key=plan.get(u.uid);if(!key)continue;
      const [r,c]=parseKey(key),tiles=new Set(rangeTiles(recOf(u),r,c,plan.dirOf(u.uid)));
      freezeExposure+=model.routes.reduce((s,route)=>s+route.n*route.tiles.filter(k=>tiles.has(k)).length/Math.max(1,route.tiles.length),0)/total;
    }
  }
  return {weightedConditionalGrowth:gain+freezeExposure*freezeWeight,healedFront,links,freezeExposure,
    freezeExposureMeaning:'Conditional route coverage per freeze trait; no predicted or realized freeze count'};
}

export function arrangeKjerag47(m,ps,{observe,handle,policy=DEFAULT_POLICY47,note=()=>{},finalLayout=false}){
  let p=observe().match.private;const gd=ps.gd||m.gd;
  let chosen=selectRoster47(gd,p);
  const tactical=finalLayout?chooseTacticalRoster47(m,ps,p,chosen,{note,maxCandidates:8}):null;
  if(tactical)chosen=tactical.chosen;
  const ids=new Set(chosen.map(u=>u.uid));
  for(const u of p.board.filter(u=>u.kind==='chess'&&!ids.has(u.uid))){
    const fresh=observe().match.private,idx=fresh.hand.findIndex(x=>x==null);
    if(idx>=0)handle({t:'g.move',uid:u.uid,to:{area:'hand',idx}},'fsm-roster-withdraw');
    else if(!protectedSale47(gd,fresh,u,chosen))handle({t:'g.sell',uid:u.uid},'fsm-unprotected-roster-replacement');
  }
  p=observe().match.private;
  // Reuse only native geometry/exposure functions, with isolated deterministic tie-breaking.
  // No bondPlan, hidden-pool scoring, generic chooseLineup or generic economic loop is called.
  const lm=Object.create(m);lm.rngBots=()=>0.5;lm._botPath=null;
  const recOf=u=>rangeRec(ps,gd.chess(u.id));
  let plan=tactical?.plan?copyPlan(tactical.plan):planLayout(lm,ps,chosen),model=fieldModel(lm,ps);const combatPlan=copyPlan(plan);
  const projectionCache=new Map();
  const geometry=t=>{
    const key=JSON.stringify(chosen.map(u=>[u.uid,t.get(u.uid),t.dirOf(u.uid)]));
    if(!projectionCache.has(key))projectionCache.set(key,projectGeometry47(m,ps,p,chosen,t,recOf,model,policy.freezeExposureWeight));
    return projectionCache.get(key);
  };
  const norm=Math.max(1,model.routes.reduce((s,r)=>s+r.n,0));
  const plannedBonds={...p,bonds:Object.entries(rosterBonds47(gd,p,chosen)).map(([bondId,b])=>({bondId,...b}))};
  const value=t=>layoutValue(lm,ps,chosen,t)/norm*100
    +geometry(t).weightedConditionalGrowth*policy.layerWeight
    +geometry47(gd,p,chosen,t,recOf).healedFront*5
    +bossAura47(gd,plannedBonds,chosen,t).weightedCoverage*0.03;
  let best=value(plan);
  const map=ps.deployMap();
  for(let pass=0;pass<policy.layoutPasses;pass++){
    let changed=false;
    for(const u of chosen){
      let winning=plan,high=best;
      for(const [r,c] of legalTiles(map,placeClass(ps,gd.chess(u.id)))){
        const k=`${r},${c}`,occupant=chosen.find(v=>v.uid!==u.uid&&plan.get(v.uid)===k),old=plan.get(u.uid);
        if(occupant&&(!old||!canPlace(map,placeClass(ps,gd.chess(occupant.id)),...parseKey(old))))continue;
        for(const dir of DIRS){
          const trial=copyPlan(plan);trial.set(u.uid,k);trial.dirs.set(u.uid,dir);
          if(occupant)trial.set(occupant.uid,old);
          const score=value(trial);if(score>high+0.001){high=score;winning=trial;}
        }
      }
      if(winning!==plan){plan=winning;best=high;changed=true;}
    }
    if(!changed)break;
  }
  let preview=null;
  if(finalLayout&&policy.rehearsalCandidates>1&&m.wave&&m.round>=3){
    const inputs=[plan,combatPlan,planLayout(lm,ps,chosen,{...LAYOUT_PARAMS,hold:8,healHold:1})];
    const previews=[],preparations=[];lm.botRehearsal=policy.rehearsalCandidates;
    lm._normalOpts=(copy,options)=>{const projected=normalPreviewOptions48(m,copy,options);
      preparations.push(projected.receipt);return projected.opts;};
    lm.newBattle=(opts,flags)=>{const battle=m.newBattle(opts,flags);previews.push(battle);return battle;};
    const before=JSON.stringify(observe().match.private),job=createRehearsal(lm,ps,chosen,inputs);
    if(job){
      if(policy.previewLpBudget){
        for(const b of previews){let ticks=0;while(!b.finished&&ticks++<job.cap)b.step();if(!b.finished)b.forceEnd('timeout');}
      }else job.run();
      preview={kind:'isolated-current-wave-native-preview',settled:false,selected:job.plans.indexOf(job.best),
        lossScope:'min(native per-round cap, own leaks) before unknown teammate rescue; not actual settled team loss',
        candidates:previews.map((b,i)=>{const r=b.result(),own=r.perPlayer?.[ps.playerId],gain=own?.layerGains||{};
          const geometry=projectGeometry47(m,ps,p,chosen,job.plans[i],recOf,model,policy.freezeExposureWeight);
          return {finished:b.finished,killed:own?.killed??null,countedLeaks:own?.leaked?.filter(l=>l.counted!==false).length??null,
            conditionalNextPrepGrowth:geometry.weightedConditionalGrowth,previewLayerGains:gain,
            preparationProjection:preparations[i],
            growthScore:geometry.weightedConditionalGrowth+(gain[CORE47]||0)+(gain.skillfulShip||0)*1.5+(gain.arcaneShip||0)*2};})};
      if(policy.previewLpBudget)preview.selected=choosePreview45(preview.candidates,{lp:p.lp,cap:gd.lpCapPerRound,plannedTrade:policy.plannedPreviewTrade});
      plan=job.plans[preview.selected];
    }
    if(JSON.stringify(observe().match.private)!==before)throw Error('Preview changed real private state');
    if(preview)note('fsm-preview',preview);
  }
  const boss=finalLayout?planBoss47(m,ps,observe().match.private,chosen,{basePlan:plan,note,maxCandidates:8}):null;
  if(boss)plan=boss.plan;
  const refined=finalLayout?refineWave47(m,ps,observe().match.private,chosen,plan,{note,maxEvaluations:80}):null;
  if(refined)plan=refined.plan;
  const placement=applyPlacement47(ps,chosen,plan,{observe,handle});
  note('fsm-placement-receipt',placement);
  const final=observe().match.private,actual=new LayoutPlan(final.board.filter(u=>u.kind==='chess').map(u=>[u.uid,`${u.row},${u.col}`]));
  actual.dirs=new Map(final.board.map(u=>[u.uid,u.dir]));
  const summary={nativeCore:coreOf(final),preview,tactical:tactical?.receipt??null,boss:boss?.receipt??null,search:refined?.receipt??null,
    placement,roster:final.board.filter(u=>u.kind==='chess').map(u=>({uid:u.uid,name:gd.chess(u.id)?.name,
    id:u.id,row:u.row,col:u.col,dir:u.dir,items:u.items})),geometry:projectGeometry47(m,ps,final,
      final.board.filter(u=>u.kind==='chess'),actual,recOf,model,policy.freezeExposureWeight),heuristicValue:best};
  note('fsm-layout',summary);return summary;
}

export function projectGeometry47(m,ps,p,units,plan,recOf,model=null,freezeWeight=12){
  const gd=ps.gd||m.gd,geometry=geometry47(gd,p,units,plan,recOf,model,freezeWeight);
  const views=new Map(units.filter(u=>plan.has(u.uid)).map(u=>{
    const [row,col]=parseKey(plan.get(u.uid));return [u.uid,{...u,row,col,dir:plan.dirOf(u.uid)}];
  }));
  const board=new Map([...views.values()].map(u=>[`${u.row},${u.col}`,u]));
  const hand=p.hand.filter(u=>u&&!views.has(u.uid));
  const prepForecast=forecastLayerGains(m,ps,{board,hand,views,bonds:rosterBonds47(gd,p,units)},
    {bondWeights:{kjeragShip:1,skillfulShip:1.5,arcaneShip:2},nextStartWeight:m.round<gd.bossRound?1:0});
  const weights={kjeragShip:1,skillfulShip:1.5,arcaneShip:2};
  const futureWeight=m.round<gd.bossRound?Math.min(3,gd.bossRound-m.round):0;
  const objective=prepForecast.forecasts.reduce((sum,f)=>sum+Object.entries(f.gains).reduce((n,[id,gain])=>n+gain*(weights[id]||0),0)
    *(f.event==='SERVER_PREP_START'?futureWeight:1),0);
  return {...geometry,prepForecast,futureWeight,futureWeightMeaning:'Heuristic value multiplier for one conditional next-start projection; not three promised future settlements',weightedConditionalGrowth:objective
    +geometry.freezeExposure*freezeWeight+geometry.links.filter(l=>l.kind==='current-battle-front-grant').length*6};
}

export function equipStep47(gd,p,{round}={}){
  const projection=projectionEquip56(gd,p,{round,lastGuaranteedPrepRound:gd.bossRound});
  if(projection)return projection.intent;
  const units=own(p),looseItems=loose(p),empty=u=>(u.items||[]).length<2;
  const hosts=new Set(conversionProjects47(gd,p).map(u=>u.uid));
  for(const it of looseItems){
    const rec=gd.item(it.id);if(rec?.itemType!=='EQUIP')continue;
    let targets=[];
    if(['精打细算玩偶','见钱眼开玩偶'].includes(rec.name))targets=units.filter(empty);
    else if(['简易通讯机','寻呼模块'].includes(rec.name))
      targets=units.filter(u=>empty(u)&&hasCore(gd,u));
    else if(/拟态物质/.test(rec.name))targets=units.filter(u=>!gd.isGolden(u.id)&&empty(u)
      &&units.filter(v=>v.id===u.id).length>=2);
    else if(projectionKind56(gd,it))continue;
    else if(rec.canGiveBond)targets=units.filter(u=>empty(u)&&!hasCore(gd,u)&&(u.items||[]).some(i=>gd.item(i.id)?.giveBondId===CORE47));
    else if(rec.giveBondId===CORE47){
      targets=units.filter(u=>empty(u)&&hosts.has(u.uid)&&!hasCore(gd,u)
        &&!(u.items||[]).some(i=>gd.item(i.id)?.giveBondId===CORE47));
      if(!targets.length&&looseItems.some(i=>gd.item(i.id)?.canGiveBond))continue;
      // Retain ice for an actual non-Kjerag growth host. Native Kjerag already has
      // membership; spending the scarce item there can prevent the two-slot recipe.
    }else if(simpleTool54(gd,it.id))targets=simpleToolTargets54(gd,p,rec);
    else if(rec.kind==='passive'&&!rec.canGiveBond)targets=units.filter(u=>empty(u)&&u.row!=null
      &&![IDS47.arc,IDS47.halo].includes(base(gd,u)));
    if(targets.length){targets.sort((a,b)=>
      (simpleTool54(gd,it.id)?simpleToolValue54(gd,rec,b)-simpleToolValue54(gd,rec,a):0)
      ||
      (['简易通讯机','寻呼模块'].includes(rec.name)?
        (is(gd,a,IDS47.silver)?0:is(gd,a,IDS47.sa)?1:2)-(is(gd,b,IDS47.silver)?0:is(gd,b,IDS47.sa)?1:2):0)
      ||
      (rec.canGiveBond||rec.giveBondId===CORE47?((is(gd,a,IDS47.arc)?0:1)-(is(gd,b,IDS47.arc)?0:1)):0)
      ||unitValue47(gd,p,b)-unitValue47(gd,p,a)||a.uid-b.uid);
      return {t:'g.equip',itemUid:it.uid,targetUid:targets[0].uid};}
  }
  return null;
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
