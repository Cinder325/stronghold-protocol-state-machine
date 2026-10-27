// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Research-only PREP_FIN projection. Run native dispatch order against detached
// state, with a capability-limited context; never fire a hook on the real match.
// This models deterministic effects only. Missing random/grant/terrain/team
// operations are explicit abstentions, not assumed rewards or battle guarantees.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {EffectDispatcher,MetaRegistry,makeCtx} from "../../effectsMeta.js";
import {registerBuiltins} from "../../builtinMeta.js";
import {registerAllMeta} from "../../../sim/content/index.js";
import {computeBonds} from "../../bondsMeta.js";

const STREAMS=['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'];
const READS=new Set(['funds','lp','alive','bandId','teamMedicGranted','shopLevel','bond','bonds','bondActive','bondCount',
  'layers','board','hand','temp','piece','pieceAt','chessRecord','pieceBonds','garrisonsOf','stats','roundStats','shopSlots',
  'counter','pieceCounter','effect']);
const WRITES=new Set(['setCounter','incCounter','incPieceCounter','addFunds','addPendingFunds','grantFreeRefresh',
  'addLayers','triggerGarrisons','setEffectCounter']);
const SILENT=new Set(['log','toast','ticker','giftTicker']);
const LOCAL=['layers','bonds','counters','round','stats','shop','funds','pendingFunds','effects'];
// Native Arturia's bondPlan caches a strategy object with function references.
// This memo is not a rule state or a context capability. Its containers can be
// copied for isolation without executing/rebinding the retained native functions.
const READ_ONLY_FUNCTION_CACHES=new Set(['_botFocus']);
const canonicalByData=new WeakMap();
function canonical(gd){
  if(!canonicalByData.has(gd.raw)){
    const registry=new MetaRegistry();registerBuiltins(registry,gd.raw);registerAllMeta(registry);
    canonicalByData.set(gd.raw,registry);
  }
  return canonicalByData.get(gd.raw);
}
const functionOf=(handler,hook,source)=>typeof handler?.[hook]==='function'?handler[hook]
  :source.kind==='garrison'&&typeof handler?.run==='function'?handler.run:null;
function inspectionCopy(value,seen=new WeakMap()){
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  if(value instanceof WeakMap||value instanceof WeakSet||value instanceof Promise)
    throw TypeError('Uninspectable state in PREP_FIN snapshot');
  if(value instanceof Date||value instanceof ArrayBuffer||ArrayBuffer.isView(value))return structuredClone(value);
  const out=value instanceof Map?new Map():value instanceof Set?new Set():Array.isArray(value)?[]:Object.create(Object.getPrototypeOf(value));
  seen.set(value,out);
  if(value instanceof Map)for(const [key,v]of value)out.set(inspectionCopy(key,seen),inspectionCopy(v,seen));
  else if(value instanceof Set)for(const v of value)out.add(inspectionCopy(v,seen));
  else for(const [key,v]of Object.entries(value))out[key]=inspectionCopy(v,seen);
  return out;
}
// structuredClone cannot inspect native bot memos containing selectRoute. Retain
// function identity while snapshotting every surrounding value/container, so the
// same equality assertion still catches cache and gameplay-state mutations.
const snapshotPlayer=p=>inspectionCopy(Object.fromEntries(Object.entries(p)
  .filter(([k,v])=>k!=='m'&&k!=='gd'&&typeof v!=='function')));
const liveSnapshot=m=>({players:m.order.map(snapshotPlayer),uid:m.uidSeq,
  stock:structuredClone(m.pool.entries),itemDebt:structuredClone(m.itemPool.debt),
  rng:STREAMS.map(k=>{assert.equal(typeof m[k]?.state,'function',`Missing real RNG ${k}`);return m[k].state();}),
  dirty:new Set(m._privDirty),wave:structuredClone(m.wave)});
function transaction(ps){
  return {values:Object.fromEntries(LOCAL.map(k=>[k,structuredClone(ps[k])])),
    meta:ps.allChess().map(u=>[u,structuredClone(u.meta)])};
}
function restore(ps,snapshot){
  Object.assign(ps,snapshot.values);
  for(const [u,meta]of snapshot.meta){if(meta===undefined)delete u.meta;else u.meta=meta;}
}

/**
 * The caller supplies the actual hypothetical containers after any roster swaps.
 * Bodies not deployed must still exist in hand/temp, exactly as native placement
 * would leave them. No stock/UID/offer resolution or future team choice is invented.
 * @returns {{player: object, receipt: object}}
 */
export function projectPrepEnd48(m,ps,{board=ps.board,hand=ps.hand,temp=ps.temp}={}){
  assert(ps._prepProjection48Round!==m.round,'Do not project PREP_FIN twice');
  const before=liveSnapshot(m),gd=ps.gd||m.gd,registry=canonical(gd);
  const receipt={kind:'detached-native-deterministic-prep-end',round:m.round,settled:false,
    nativeOrder:'global -> band -> bonds -> operator traits -> board/hand garrisons -> equipped items -> persistent effects',
    calls:[],unsupported:[],readOnlyCacheCopies:[],layerDelta:{},pendingFundsDelta:0,realStateUnchanged:false,
    limitations:['Deterministic local operations only; random rolls, gifts, new equipment/chess, transformation, terrain and teammate writes are excluded.',
      'This is one current PREP_FIN projection; future shops, later teammate changes and combat gains are not predicted.']};
  const lm=Object.create(m),copy=Object.create(ps);
  // Callers commonly wrap PlayerState with Object.create before replacing the
  // hypothetical containers. Clone resolved inherited fields as well: own-only
  // cloning would leave counters/shop/effects shared with the real player.
  for(const key in ps)if(!['m','gd'].includes(key)){
    const value=ps[key];
    if(typeof value==='function')continue;
    try{copy[key]=structuredClone(value);}catch(error){
      if(READ_ONLY_FUNCTION_CACHES.has(key)){
        copy[key]=inspectionCopy(value);
        receipt.readOnlyCacheCopies.push({key,functionIdentityRetained:true,executedInProjection:false});
      }else{
        // Never fall back to an inherited shared mutable value for a rule field.
        throw TypeError(`Cannot detach PREP_FIN player field ${key}: ${error.message}`,{cause:error});
      }
    }
  }
  copy.m=lm;copy.board=structuredClone(board);copy.hand=structuredClone(hand);copy.temp=structuredClone(temp);
  copy.layers={...ps.layers};copy.bonds=computeBonds(gd,copy);
  copy.dirty=()=>{};
  // Candidate legality is supplied by the layout planner. Native battleInput still
  // checks this map, but neither terrain nor summon eviction runs on a live state.
  const deployMap=ps.deployMap();copy.deployMap=()=>deployMap;copy._legalityStale=false;
  copy.recompute=()=>{
    const old=copy.bonds;copy.bonds=computeBonds(gd,copy);
    const activated=gd.bondIds.filter(id=>copy.bonds[id]?.active&&!old[id]?.active);
    const deactivated=gd.bondIds.filter(id=>old[id]?.active&&!copy.bonds[id]?.active);
    if(activated.length||deactivated.length)lm.dispatch(copy,'onActiveBonds',{activated,deactivated});
  };
  // Preserve the real visible team context (bands/medic effects). Teammate
  // mutation capabilities below remain blocked; only this player's state runs.
  lm.order=m.order.map(p=>p.playerId===copy.playerId?copy:p);
  lm.players=new Map(lm.order.map(p=>[p.playerId,p]));
  lm.sendTo=()=>{};lm.toast=()=>{};lm.tickerText=()=>{};lm.tickerFor=()=>{};
  lm.markPrivate=()=>{};lm.markPublic=()=>{};lm.log={info(){},warn(){},error(){}};
  for(const key of STREAMS)lm[key]=m[key].clone();
  const dispatcher=new EffectDispatcher(lm,registry);lm.dispatcher=dispatcher;
  lm.dispatch=(player,hook,event,options)=>dispatcher.dispatch(player,hook,event,options);
  const unsupported=(key,hook,reason,source)=>receipt.unsupported.push({key,hook,reason,
    uid:source?.piece?.uid??null,garrisonId:source?.garrisonId??null});
  // Walk the active registry in native order. Only the matching canonical native
  // function may execute. A plugin override is diagnosed rather than guessed.
  dispatcher.registry=m.dispatcher.registry;
  dispatcher._report=(key,hook,error)=>unsupported(key,hook,String(error.message||error));
  dispatcher._call=function(player,key,handler,hook,source,event,repeat=1){
    const fn=functionOf(handler,hook,source);if(!fn)return;
    const trusted=registry.get(key),nativeFn=functionOf(trusted,hook,source);
    if(!nativeFn||nativeFn.toString()!==fn.toString()){
      unsupported(key,hook,'Handler is not the inspected canonical native implementation',source);return;
    }
    const values=transaction(player),call={key,hook,uid:source.piece?.uid??null,
      garrisonId:source.garrisonId??null,repeat,completed:false};
    const callIndex=receipt.calls.length;receipt.calls.push(call);
    try{
      const raw=makeCtx(lm,player,source,hook,event),ctx=Object.create(null);
      for(const [name,value]of Object.entries(raw)){
        if(typeof value!=='function'){ctx[name]=name==='source'?source:value;continue;}
        if(READS.has(name))ctx[name]=(...args)=>structuredClone(value(...args));
        else if(WRITES.has(name))ctx[name]=value;
        else if(SILENT.has(name))ctx[name]=()=>{};
        else ctx[name]=()=>{throw Error(`Unsupported context operation: ${name}`);};
      }
      const blocked=()=>{throw Error('Unsupported context operation: random');};
      ctx.rng=new Proxy(blocked,{get:()=>blocked});
      for(let i=0;i<repeat;i++)nativeFn.call(trusted,ctx,event);
      call.completed=true;
    }catch(error){
      restore(player,values);
      for(const nested of receipt.calls.slice(callIndex))nested.rolledBack=true;
      unsupported(key,hook,String(error.message||error),source);
    }
  };
  try{
    dispatcher.dispatch(copy,'onPrepEnd',{round:m.round},{quiet:true});
    // Live endPrep subsequently resolves due temp and clears funds. Inventory
    // expiry can return stock/dispatch onSold, so never approximate that path.
    if(copy.temp.some(Boolean))receipt.unsupported.push({reason:'Temp expiry/fill and its nested effects are not projected'});
    if(!gd.leftoverKeptBands.includes(copy.bandId))copy.funds=0;
    copy.ready=true;copy.prepsEnded++;
    copy._prepProjection48Round=m.round;
    receipt.layerDelta=Object.fromEntries(Object.entries(copy.layers)
      .map(([id,n])=>[id,n-(ps.layers[id]||0)]).filter(([,n])=>n!==0));
    receipt.pendingFundsDelta=copy.pendingFunds-ps.pendingFunds;
    receipt.completeWithinSupportedScope=receipt.unsupported.length===0;
    return {player:copy,receipt};
  }finally{
    const after=liveSnapshot(m);receipt.realStateUnchanged=isDeepStrictEqual(after,before);
    assert(receipt.realStateUnchanged,'PREP_FIN projection changed live state/RNG/UID/stock');
  }
}
