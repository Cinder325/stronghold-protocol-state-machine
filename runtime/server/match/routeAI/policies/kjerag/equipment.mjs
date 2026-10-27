// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {CORE47,IDS47,base,block,hasCore,heal,is,loose,own} from "./model.mjs";
import {selectRoster47,unitValue47} from "./roster.mjs";
import {projectionEquip56,projectionKind56} from "../../support/promotion-projection.mjs";
import {conversionProjects47} from "./economy.mjs";


// Data-driven whitelist of harmless implemented stat equipment. Damage-over-time,
// stat penalties, summons, random effects and unknown passive handlers are excluded.
export function simpleTool54(gd,id){
  const r=gd.item(id),allowed=new Set(['atk','def','max_hp','magic_resistance','attack_speed']);
  return !!r&&r.itemType==='EQUIP'&&r.kind==='passive'&&r.category==='STAT'&&!r.canGiveBond
    &&Array.isArray(r.buffs)&&r.buffs.length===1&&r.buffs[0]?.bbStr?.key==='attr_common_global_buff'
    &&Object.entries(r.buffs[0]?.bb||{}).length>0
    &&Object.entries(r.buffs[0].bb).every(([k,v])=>allowed.has(k)&&Number.isFinite(v)&&v>0);
}

export function simpleToolValue54(gd,rec,u){
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
