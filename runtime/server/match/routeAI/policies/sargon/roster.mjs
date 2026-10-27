// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {IDS58,SARGON58,base,blocker,compass,core,healer,investors,own,tea} from "./model.mjs";
import {computeBonds,pieceBonds} from "../../../bondsMeta.js";
import {supportValue73} from "../../support/sargon-synergy.mjs";


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
