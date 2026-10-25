// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// [ASSUMED] Map-independent proposals, never live deployment or a gameplay rule.
// Normal healing range, real legal tiles, and the current boss route supply the geometry.
import {LayoutPlan,rangeRec,rangeTiles} from "../../bot.js";
import {canPlace,legalTiles,parseKey,placeClass} from "../../board.js";
import {bossFieldPlacement} from "../../finalAssault.js";
import {COLS} from "../../../sim/constants.js";

const DIRS=['RIGHT','UP','DOWN','LEFT'];
const copy=p=>{const q=new LayoutPlan(p);q.dirs=new Map(p.dirs||[]);return q;};
const distance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
const medic=(gd,u)=>gd.chess(u.id)?.attackKind==='heal';
const weight=(gd,u)=>{
 const r=gd.chess(u.id),s=r?.stats||{};
 return medic(gd,u)?0:1+(s.atk||0)/Math.max(1,s.bat||1)/250+(s.blockCnt||0)*0.4;
};
export const formationSignature57=p=>JSON.stringify([...p].map(([uid,key])=>[uid,key,p.dirOf(uid)]).sort((a,b)=>a[0]-b[0]));

/** Same normal attack-range helper used by the native bot; potential coverage,
 * not promised healing. Shields, unhealable bodies and active skills remain native. */
export function healingCoverage57(ps,chosen,plan){
 const gd=ps.gd,totalWeight=chosen.reduce((n,u)=>n+weight(gd,u),0);
 const rows=chosen.filter(u=>medic(gd,u)&&plan.has(u.uid)).map(u=>{
  const covered=new Set(rangeTiles(rangeRec(ps,gd.chess(u.id)),...parseKey(plan.get(u.uid)),plan.dirOf(u.uid)));
  const targets=chosen.filter(v=>v.uid!==u.uid&&plan.has(v.uid)&&covered.has(plan.get(v.uid)));
  return {uid:u.uid,coveredUIDs:targets.map(v=>v.uid),weight:targets.reduce((n,v)=>n+weight(gd,v),0)};
 });
 const union=new Set(rows.flatMap(r=>r.coveredUIDs));
 return {rows,coveredUIDs:[...union],weight:chosen.filter(u=>union.has(u.uid)).reduce((n,u)=>n+weight(gd,u),0),totalWeight,
  idleMedicUIDs:rows.filter(r=>!r.coveredUIDs.length).map(r=>r.uid)};
}

export function repairHealing57(ps,chosen,seed,{moves=true}={}){
 const gd=ps.gd,map=ps.deployMap();let best=copy(seed);
 for(const healer of chosen.filter(u=>medic(gd,u)&&seed.has(u.uid))){
  const old=best.get(healer.uid),initial=healingCoverage57(ps,chosen,best);
  let high=initial.weight,personal=initial.rows.find(r=>r.uid===healer.uid)?.weight||0,bestDistance=0,winner=best;
  const tiles=moves?legalTiles(map,placeClass(ps,gd.chess(healer.id))).map(t=>t.join(',')):[old];
  for(const key of tiles){
   const other=chosen.find(u=>u.uid!==healer.uid&&best.get(u.uid)===key);
   if(other&&!canPlace(map,placeClass(ps,gd.chess(other.id)),...parseKey(old)))continue;
   for(const dir of DIRS){
    const trial=copy(best);trial.set(healer.uid,key);trial.dirs.set(healer.uid,dir);if(other)trial.set(other.uid,old);
    const row=healingCoverage57(ps,chosen,trial),d=distance(parseKey(key),parseKey(old));
    const ownWeight=row.rows.find(r=>r.uid===healer.uid)?.weight||0;
    if(row.weight>high+0.001||Math.abs(row.weight-high)<0.001
      &&(ownWeight>personal+0.001||Math.abs(ownWeight-personal)<0.001&&d<bestDistance)){
     high=row.weight;personal=ownWeight;bestDistance=d;winner=trial;
    }
   }
  }
  best=winner;
 }
 return best;
}

export function bossRouteGeometry57(m,ps,seed){
 const group=m.bossGroupOf(ps);if(!group?.wave)return null;
 const side=group.players.indexOf(ps.playerId)===0?'L':'R';
 const own=[...seed.values()].map(k=>{const [r,c]=parseKey(k),p=bossFieldPlacement(side,r,c);return [p.row,p.col];});
 const center=[0,1].map(i=>own.reduce((n,p)=>n+p[i],0)/Math.max(1,own.length));
 const leaders=group.wave.spawns.filter(s=>s.tag==='boss');
 const routes=leaders.map(s=>group.wave.routes[s.routeIndex]).filter(Boolean);
 // The native mirror hook reads actual extraRoutes, which need not be a
 // geometric 20-c reflection. Never invent a mirrored patrol for the right side.
 const tpl=ps.gd.wave?.(group.wave.templateId),branch=tpl?.branches?.boss_battle_multi_player?.[0];
 if(group.players.length>1&&Array.isArray(branch))for(const spawn of branch){
  if(!leaders.some(s=>s.enemyKey===(spawn.key??spawn.enemyKey)))continue;
  const route=tpl.extraRoutes?.[spawn.routeIndex];if(route)routes.push(route);
 }
 const ownEnd=route=>Array.isArray(route.end)&&(side==='R'?route.end[1]>(COLS-1)/2:route.end[1]<=(COLS-1)/2);
 const ownRoutes=routes.filter(ownEnd),relevant=ownRoutes.length?ownRoutes:routes;
 const points=relevant.flatMap(r=>[r.start,...(r.checkpoints||[]),...(r.steps||[]).filter(s=>s.p).map(s=>s.p),r.end]).filter(Array.isArray);
 const ends=[...routes,...group.wave.routes].filter(ownEnd).map(r=>r.end).sort((a,b)=>distance(a,center)-distance(b,center));
 const exit=ends[0];
 // Vector away from the blue goal. No stage ID, seed, operator or fixed coordinate match.
 const away=exit?[center[0]-exit[0],center[1]-exit[1]]:[0,1];
 const localAway=[away[0],side==='R'?-away[1]:away[1]];
 const face=Math.abs(localAway[1])>=Math.abs(localAway[0])?(localAway[1]>=0?'RIGHT':'LEFT'):(localAway[0]>=0?'DOWN':'UP');
 return {side,points,exit,face,localAway,source:'current-wave-and-native-mirror-branch-routes'};
}

/** Compact anchors get one inexpensive geometric pass. Native paired previews
 * decide whether they actually improve the fight; compactness is never a hard constraint. */
export function bossFormationProposals57(m,ps,chosen,seed,{maxCandidates=4}={}){
 if(!chosen.length)return [];
 const gd=ps.gd,map=ps.deployMap(),geometry=bossRouteGeometry57(m,ps,seed),out=[];
 const add=(kind,plan)=>{if(formationSignature57(plan)!==formationSignature57(seed))out.push({kind,plan,healing:healingCoverage57(ps,chosen,plan)});};
 add('healer-facing',repairHealing57(ps,chosen,seed,{moves:false}));
 add('healer-range',repairHealing57(ps,chosen,seed));
 if(!geometry)return out.slice(0,maxCandidates);
 const anchors=[...new Set(seed.values())].map(parseKey);
 const middle=[0,1].map(i=>anchors.reduce((n,p)=>n+p[i],0)/anchors.length);
 anchors.sort((a,b)=>distance(a,middle)-distance(b,middle));
 const away=geometry.localAway,norm=Math.max(1,Math.abs(away[0])+Math.abs(away[1]));
 for(const anchor of anchors.slice(0,3)){
  const plan=new LayoutPlan(),used=new Set();
  // Constrained placement classes first, then medics behind the block line.
  const order=chosen.map(u=>({u,tiles:legalTiles(map,placeClass(ps,gd.chess(u.id)))}))
   .sort((a,b)=>a.tiles.length-b.tiles.length||Number(medic(gd,a.u))-Number(medic(gd,b.u))||a.u.uid-b.u.uid);
  for(const {u,tiles} of order){
   const rec=gd.chess(u.id),front=rec?.position==='MELEE'&&(rec.stats?.blockCnt||0)>=2?1:medic(gd,u)?-1:0;
   const score=pos=>distance(pos,anchor)*3-front*((pos[0]-anchor[0])*away[0]+(pos[1]-anchor[1])*away[1])/norm;
   const tile=tiles.filter(t=>!used.has(t.join(','))).sort((a,b)=>score(a)-score(b)||a[0]-b[0]||a[1]-b[1])[0];
   if(!tile)break;
   const key=tile.join(',');plan.set(u.uid,key);used.add(key);plan.dirs.set(u.uid,geometry.face);
   if(!medic(gd,u)){
    let high=-1;
    for(const dir of [geometry.face,...DIRS.filter(d=>d!==geometry.face)]){
     const field=bossFieldPlacement(geometry.side,...tile,dir);
     const range=new Set(rangeTiles(rangeRec(ps,rec),field.row,field.col,field.dir));
     const n=geometry.points.filter(p=>range.has(p.join(','))).length;
     if(n>high){high=n;plan.dirs.set(u.uid,dir);}
    }
   }
  }
  if(plan.size===chosen.length)add('route-compact-healed',repairHealing57(ps,chosen,plan,{moves:false}));
 }
 const seen=new Set();return out.filter(r=>{const k=formationSignature57(r.plan);if(seen.has(k))return false;seen.add(k);return true;}).slice(0,maxCandidates);
}

/** Compare completed previews at the same current pair/roster. Other boss fields
 * remain unknown. Own damage is diagnostic; conditional pair HP and LP decide. */
export function chooseBossCandidate57(rows){
 const valid=rows.filter(c=>!c.budgetExhausted&&c.errors===0&&Number.isFinite(c.poolHpLeft)&&Number.isFinite(c.pairRemainingLp));
 const baseline=valid.find(c=>c.index===0);if(!baseline)return null;
 const eligible=valid.filter(c=>c.pairRemainingLp>=baseline.pairRemainingLp-1e-6);
 eligible.sort((a,b)=>a.poolHpLeft-b.poolHpLeft||b.pairRemainingLp-a.pairRemainingLp
  ||b.unitSurvivors-a.unitSurvivors||a.ownDeaths-b.ownDeaths
  ||(b.healing?.weight||0)-(a.healing?.weight||0)||a.index-b.index);
 return eligible[0]?.index??0;
}
