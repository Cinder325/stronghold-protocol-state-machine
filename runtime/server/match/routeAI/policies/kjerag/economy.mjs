// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {pieceBonds} from "../../../bondsMeta.js";
import {IDS47,base,hasCore,is,loose,own} from "./model.mjs";


// Visible/native receipts, not a hidden-stock or future-card forecast. All budgets below
// are [ASSUMED] recipe choices. Temporary overflow never activates BOARD_AND_DECK bonds.
export function economy47(gd,p){
  const eligible=[...p.board,...p.hand].filter(u=>u?.kind==='chess');
  const investors=new Set(eligible.filter(u=>pieceBonds(gd,u).includes('investShip')).map(u=>base(gd,u)));
  const b=Object.fromEntries((p.bonds||[]).map(b=>[b.bondId,b]));
  const active=!!b.investShip?.active,repeat=active?(b.investShip.layers>=100?3:2):1;
  return {investors:[...investors],investorCount:investors.size,investorActive:active,repeat,
    haloOnBoard:p.board.some(u=>u?.kind==='chess'&&is(gd,u,IDS47.halo)),
    duskOnBoard:p.board.some(u=>u?.kind==='chess'&&is(gd,u,IDS47.dusk)),
    skillActive:!!b.skillfulShip?.active,arcaneActive:!!b.arcaneShip?.active,
    needsMorph:conversionProjects47(gd,p).filter(u=>!(u.items||[]).some(i=>gd.item(i.id)?.canGiveBond)).length
      >loose(p).filter(i=>gd.item(i.id)?.canGiveBond).length};
}

// Count unfinished conversion hosts, not an unrelated morph worn by another unit.
export function conversionProjects47(gd,p){
  const units=own(p);
  return [IDS47.arc,IDS47.halo].flatMap(id=>{
    const hosts=units.filter(u=>base(gd,u)===id);
    if(hosts.some(u=>hasCore(gd,u)))return [];
    return hosts.sort((a,b)=>Number(gd.isGolden(b.id))-Number(gd.isGolden(a.id))
      ||(b.items?.length||0)-(a.items?.length||0)||a.uid-b.uid).slice(0,1);
  });
}

export function acquisition47(gd,p,slot){
  const rec=slot?.kind==='chess'?gd.chess(slot.id):null,e=economy47(gd,p);
  const layers={};let freeRefreshes=0;
  for(const id of rec?.garrisonIds||[]){
    const g=gd.garrison(id);
    if(g?.eventType==='SERVER_GAIN'&&g.effectKey==='SERVER_ADD_BOND_CHESS_ALL')
      for(const bond of rec.bonds||[])layers[bond]=(layers[bond]||0)+(g.bb?.count||0)*e.repeat;
    if(g?.eventType==='SERVER_GAIN'&&g.effectKey==='SERVER_GAIN_FREE_REFRESH_COUNT')
      freeRefreshes+=(g.bb?.count||0)*e.repeat;
  }
  const nativeNet=(slot?.price||0)-(rec?gd.sellPrice(slot.id):0);
  // Acquisition layers persist even before the bond is activated. Do not throw away
  // early Skillful gains because its second deployed base has not been drawn yet.
  const weighted=(layers.kjeragShip||0)*2+(layers.skillfulShip||0)*2+(e.arcaneActive?layers.arcaneShip||0:0);
  return {layers,weighted,nativeNet,repeat:e.repeat,freeRefreshes,
    haloSpend:e.haloOnBoard&&(e.skillActive||e.arcaneActive),duskGain:e.duskOnBoard&&e.arcaneActive};
}

export function investorProtected47(gd,p,u){
  if(!pieceBonds(gd,u).includes('investShip'))return false;
  const eligible=[...p.board,...p.hand].filter(v=>v?.kind==='chess'&&v.uid!==u.uid);
  return !eligible.some(v=>base(gd,v)===base(gd,u))&&economy47(gd,p).investorCount<=3;
}
