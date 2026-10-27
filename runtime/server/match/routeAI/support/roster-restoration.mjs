// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// AI-only preparation guard. Native move/sell validation remains unchanged.
// Reserve intended and temporarily withdrawn bodies until restoration, even if
// a later intermediate roster score changes while that body is in the hand.
// Modified 2026-10-26: readiness follows the current roster; historical withdrawn
// reserves stay sale-protected but are not an extra mandatory deployment.
import {applyPlacement47} from "./kjerag-placement.mjs";

const owned=p=>[...p.board,...p.hand,...p.temp].filter(u=>u?.kind==='chess');
export function createRosterGuard69({observe,keyOf=()=>false}={}){
 let selected=new Set();const pending=new Set();
 const view=()=>observe().match.private;
 const sync=()=>{
  const p=view(),all=new Set(owned(p).map(u=>u.uid)),board=new Set(p.board.map(u=>u.uid));
  for(const uid of pending)if(!all.has(uid)||board.has(uid))pending.delete(uid);
  return p;
 };
 const protectedUids=()=>{
  const p=sync();return new Set([...selected,...pending,...owned(p).filter(u=>keyOf(u,p)).map(u=>u.uid)]);
 };
 return {
  begin(chosen){selected=new Set(chosen.map(u=>u.uid));sync();},
  observeMove(intent,before,result){
   if(result?.ok!==true||intent.t!=='g.move')return;
   const p=view();
   // A native board swap can withdraw its occupant as well as the named unit.
   for(const old of before.board){
    // A key deliberately excluded from this roster is a protected reserve,
    // not an extra mandatory ninth deployment. Only intended units need return.
    if(selected.has(old.uid)&&!p.board.some(u=>u.uid===old.uid)
      &&owned(p).some(u=>u.uid===old.uid))pending.add(old.uid);
   }
   sync();
  },
  protectedUids,
  canSell(uid){return !protectedUids().has(uid);},
  status(){const p=sync();return {pending:[...pending].filter(uid=>selected.has(uid)),missingSelected:[...selected]
   .filter(uid=>owned(p).some(u=>u.uid===uid)&&!p.board.some(u=>u.uid===uid))};},
 };
}

// Incoming desired bodies go first, so deploying onto spare board capacity
// frees a real hand slot before rearranging incumbents. Full-board replacement
// remains the native swap handled by applyPlacement47, never withdraw-and-sell.
export function applyRestoringPlacement69(ps,chosen,plan,{observe,handle,guard}={}){
 guard?.begin(chosen);
 const p=observe().match.private,onBoard=new Set(p.board.map(u=>u.uid));
 const ordered=chosen.map((u,index)=>({u,index})).sort((a,b)=>Number(onBoard.has(a.u.uid))-Number(onBoard.has(b.u.uid))||a.index-b.index).map(v=>v.u);
 const receipt=applyPlacement47(ps,ordered,plan,{observe,handle:(intent,source)=>{
  const before=observe().match.private,result=handle(intent,source);guard?.observeMove(intent,before,result);return result;
 }});
 receipt.restoration=guard?.status()||{pending:[],missingSelected:receipt.unresolved.filter(u=>u.actual?.area!=='board').map(u=>u.uid)};
 return receipt;
}
