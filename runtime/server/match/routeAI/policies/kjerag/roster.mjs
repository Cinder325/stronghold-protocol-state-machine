// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {CORE47,IDS47,base,block,coreOf,heal,is,own,rangedDamage} from "./model.mjs";
import {computeBonds} from "../../../bondsMeta.js";
import {economy47} from "./economy.mjs";


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
