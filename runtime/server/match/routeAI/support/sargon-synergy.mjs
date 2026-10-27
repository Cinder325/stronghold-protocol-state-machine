// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Map-independent hypotheses from tutorials, verified against current record traits.
// Placement candidates only. Actual native rehearsals decide survival and layers.
import {LayoutPlan} from "../../bot.js";
import {canPlace,placeClass,parseKey} from "../../board.js";
import {rotateOffset} from "../../../sim/dir.js";
import {sargonChargeHost58,sargonTraits58} from "./sargon-mechanics.mjs";
const copy=p=>{const q=new LayoutPlan(p);q.dirs=new Map(p.dirs||[]);return q;};
export function relationPlans73(ps,chosen,seed,{maxCandidates=5}={}){
 const gd=ps.gd,map=ps.deployMap(),out=[];
 const providers=chosen.filter(u=>['寒芒克洛丝','华法琳','魔王'].includes(gd.chess(u.id)?.name));
 for(const holder of providers){
  const name=gd.chess(holder.id).name;
  const targets=chosen.filter(u=>u.uid!==holder.uid).map(u=>({u,charge:sargonChargeHost58(gd,u,{loadout:ps.loadout}),traits:sargonTraits58(gd,u)}))
   .filter(t=>name==='魔王'?t.traits.battleSources.length:t.charge.eligible)
   .sort((a,b)=>Number(gd.chess(b.u.id)?.name==='缇缇')*Number(name==='魔王')-Number(gd.chess(a.u.id)?.name==='缇缇')*Number(name==='魔王')
    ||b.charge.score-a.charge.score||a.u.uid-b.u.uid);
  for(const {u}of targets.slice(0,2)){
   const [r,c]=parseKey(seed.get(u.uid)),old=seed.get(holder.uid);if(!old)continue;
   for(const dir of ['RIGHT','UP','DOWN','LEFT']){
    const [dr,dc]=rotateOffset(0,1,dir),pos=[r-dr,c-dc],key=pos.join(',');
    if(!canPlace(map,placeClass(ps,gd.chess(holder.id)),...pos))continue;
    const other=chosen.find(v=>v.uid!==holder.uid&&seed.get(v.uid)===key);
    if(other&&!canPlace(map,placeClass(ps,gd.chess(other.id)),...parseKey(old)))continue;
    const plan=copy(seed);plan.set(holder.uid,key);plan.dirs.set(holder.uid,dir);if(other)plan.set(other.uid,old);
    out.push({kind:'native-front-trait',holder:holder.uid,target:u.uid,plan});
   }
  }
 }
 // Interleave providers rather than spending the whole budget on four rotations of one provider.
 const seen=new Set(),fair=out.sort((a,b)=>out.filter(x=>x.holder===a.holder).indexOf(a)-out.filter(x=>x.holder===b.holder).indexOf(b));
 return fair.filter(x=>{const s=JSON.stringify([...x.plan].map(([id,k])=>[id,k,x.plan.dirs.get(id)]));if(seen.has(s))return false;seen.add(s);return true;}).slice(0,maxCandidates).map(x=>x.plan);
}
export function supportValue73(gd,p,units){
 const names=new Set(units.map(u=>gd.chess(u.id)?.name));
 const hasShort=units.some(u=>sargonChargeHost58(gd,u,{loadout:p.loadout}).score>=12);
 const hasTiti=names.has('缇缇');
 return (names.has('寒芒克洛丝')&&hasShort?135:0)
  +(names.has('莱恩哈特')&&units.some(u=>gd.chess(u.id)?.name==='异客'||gd.chess(u.id)?.name==='缇缇')?155:0)
  +(names.has('华法琳')&&hasShort?85:0)+(names.has('魔王')&&hasTiti?120:0);
}
