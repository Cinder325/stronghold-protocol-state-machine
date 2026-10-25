// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: free a real hand slot only for an already visible useful purchase.
// A recruitment tool is expendable only when no safely expendable recipient exists.
export function blockedRecruitmentTool(gd,p,{canSpendOn=()=>false,canUseOn=()=>false}={}){
 if(p.hand.some(u=>u==null)||!(p.funds>0))return null;
 if(!p.shop.slots.some(s=>s&&!s.sold&&s.price>0&&s.price<=p.funds&&canSpendOn(s)))return null;
 const units=[...p.board,...p.hand,...p.temp].filter(u=>u?.kind==='chess');
 if(units.some(canUseOn))return null;
 const item=[...p.hand].filter(u=>u?.kind==='item').find(u=>{
  const r=gd.item(u.id);return r?.kind==='consume_on_equip'&&!r.canGiveBond
   &&r.buffs?.some(b=>b.key==='use_equip_recruit_new_char_and_give_char_to_player_most_bond');
 });
 return item?{t:'g.destroy',uid:item.uid}:null;
}
