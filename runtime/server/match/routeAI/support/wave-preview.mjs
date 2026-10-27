// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Research-only preparation projection shared by every current-wave preview.
// Native rules and real PlayerState remain unchanged; preview fields are never recordings.
import {projectPrepEnd48} from "./kjerag-preparation.mjs";

export function normalPreviewOptions48(m,ps,{board=ps.board}={}){
  const selected=new Set([...board.values()].map(u=>u.uid)),copy=Object.create(ps);
  copy.hand=structuredClone(ps.hand.map(u=>u&&selected.has(u.uid)?null:u));
  copy.temp=structuredClone(ps.temp.map(u=>u&&selected.has(u.uid)?null:u));
  const stowed=new Set([...copy.hand,...copy.temp].filter(Boolean).map(u=>u.uid)),reconstructed=[];
  for(const u of ps.board.values())if(u.kind==='chess'&&!selected.has(u.uid)&&!stowed.has(u.uid)){
    const slot=copy.hand.findLastIndex(v=>v==null);
    if(slot>=0)copy.hand[slot]=structuredClone(u);else copy.temp.push(structuredClone(u));
    reconstructed.push({uid:u.uid,area:slot>=0?'hand':'temp',slot:slot>=0?slot:copy.temp.length-1});
    stowed.add(u.uid);
  }
  const {player,receipt}=projectPrepEnd48(m,copy,{board,hand:copy.hand,temp:copy.temp});
  if(reconstructed.length)receipt.hypotheticalStow={bodies:reconstructed,
    limitation:'Conserves assets with native rightmost-free stow order; complex actual swaps can use different hand slots. Actual placement receipts are recorded separately.'};
  const opts=m._normalOpts(player,{preview:true,board:player.board});
  return {opts,receipt};
}
