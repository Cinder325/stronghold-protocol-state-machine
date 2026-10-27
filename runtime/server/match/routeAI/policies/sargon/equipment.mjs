// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {IDS58,SARGON58,base,compass,core,loose,own,tea} from "./model.mjs";
import {capacitySale67,selectRoster58,unitScore58} from "./roster.mjs";
import {sargonChargeHost58} from "../../support/sargon-mechanics.mjs";
import {pieceBonds} from "../../../bondsMeta.js";


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
