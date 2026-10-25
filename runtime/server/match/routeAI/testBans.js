// SPDX-License-Identifier: GPL-3.0-or-later
import {drawDisabledBonds} from '../pool.js';
import {REQUIRED_BONDS} from './routes.js';
/** Only bonds eligible for the original draw can be protected. */
export function nativeBanChoices(gd){
 return gd.bondIds.filter(id=>Number(gd.bond(id)?.weight)>0&&!gd.modeInactiveBonds.has(id))
  .map(id=>({id,name:gd.bond(id).name,isCore:!!gd.bond(id).isCore}));
}
/** Validate without drawing or consuming RNG; an empty selection is legal. */
export function validateProtectedBonds(gd,selected){
 if(!Array.isArray(selected)||selected.length>64||selected.some(id=>typeof id!=='string')||new Set(selected).size!==selected.length)throw Error('Invalid protected bond selection');
 const choices=nativeBanChoices(gd),eligible=new Set(choices.map(b=>b.id)),keep=new Set(selected);
 if(selected.some(id=>!eligible.has(id)))throw Error('Protected bonds are unavailable in this ruleset');
 const counts=gd.bans(gd.difficulty);
 for(const [category,n] of [['core',counts.core],['addon',counts.addon]]){
  const remaining=choices.filter(b=>b.isCore===(category==='core')&&!keep.has(b.id));
  if(!Number.isInteger(n)||n<0||remaining.length<n)throw Error('Protected bonds cannot produce a legal native ban draw');
 }
 // Canonical native order makes equivalent UI selections reproducible.
 return choices.filter(b=>keep.has(b.id)).map(b=>b.id);
}
/** Conditional native draw, not a new ban rule: the original category counts stay intact. */
export function selectTestBans(gd,rng,opts={}){
 // Programmatic routeAITest-only callers retain the published benchmark setup.
 // Rooms always pass an explicit boolean, so the player-facing feature defaults off.
 if((opts.routeAIBanProtection??opts.routeAITest)!==true)return drawDisabledBonds(gd,rng);
 const keep=new Set(validateProtectedBonds(gd,opts.routeAIRequiredBonds===undefined?REQUIRED_BONDS:opts.routeAIRequiredBonds));
 const view=Object.create(gd);view.bondIds=gd.bondIds.filter(id=>!keep.has(id));
 return drawDisabledBonds(view,rng);
}
