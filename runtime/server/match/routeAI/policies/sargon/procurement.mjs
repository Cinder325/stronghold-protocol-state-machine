// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {IDS58,SARGON58,base,blocker,bond,compass,core,healer,investors,loose,own,tea} from "./model.mjs";
import {protectedSale58,selectRoster58,unitScore58} from "./roster.mjs";
import {pieceBonds} from "../../../bondsMeta.js";
import {sargonTraits58} from "../../support/sargon-mechanics.mjs";

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
