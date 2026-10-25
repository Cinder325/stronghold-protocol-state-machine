// SPDX-License-Identifier: GPL-3.0-or-later
// Teammate policy state transport. Capturing/hydrating runs no game actions or effect hooks.
// Object IDs retain native container and piece identity across authoritative feedback.
const RNG_STREAMS = ['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'];
const MATCH_FIELDS = (`roomCode mode difficulty modeId seed cs vs requireCs diyKitted rules offers offerWin offerSeq
 isSolo aiPicksLast botRehearsal botRehearsalDelegate botRehearsalDelegateMs botSliceMs hostId battleContent gameSpeed timerScale
 clientCombat stageId factions bossId hiddenBossId disabledBonds staticInactiveBonds bannedChess phase round deadline
 overtimeAt uidSeq ended disposed startedAt setupRevision setupVote draft sp wave bossWaves bossPairs lastResults
 unitePlan uniteResultView teamLp hiddenLayerSum hiddenReached outcome battlePrefix paused loneHuman
 _uniteBounds _uniteLeftKey spectators`).split(/\s+/);
const PLAYER_FIELDS = new Set((`playerId seat name isBot connected left alive lp bandId funds pendingFunds ready infoReady
 lastEmoteAt loadout ops standIns _standInSet diy _diyRecords diyStock diyBanned skins shop offers hand temp prepsEnded
 _tempDue board layers bonds pendingLayerGains bondCountBonus effects bounties personalChoice counters round deployCapBonus
 deployCapMin deviceOverrides tileOverrides stats eliminatedRound creditedKills lpAtFinal lastResult _deployField _legalityStale`).split(/\s+/));
const OPTION_FIELDS = new Set((`roomCode mode difficulty modeId seed cs vs requireCs kitted rules offers seats spectators matchNo
 aiPicksLast battleContent timerScale combatSpeed clientCombat verify headlessSliceMs botRehearsal botSliceMs
 botRehearsalDelegate botRehearsalDelegateMs botStrategy botCoreStrategies botFrontlineRepair botFormationRoles
 botHumanLessons botSiracusaEngines botLateranoLessons botLateranoExperiment botLateranoCoopExperiment
 botSiracusaArcaneWeight botSiracusaAdjustments botSiracusaInvestorDeadline cashGuard102`).split(/\s+/));
const OMIT_POLICY = new Set(['_botFocus','_botRangeRecs','_botPrepToken']);
const sourceGraphs = new WeakMap(), mirrors = new WeakMap();
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const policyKey = k => !OMIT_POLICY.has(k) && (/^_bot/.test(k)
 || /^_routeAI/.test(k) && !/^_routeAI(?:Job|Worker|PrepToken|Timer|Pending|Channel|Port|Cancel)/.test(k));
function requireBot(m,ps) {
 if(!ps || ps.isBot!==true || m.players.get(ps.playerId)!==ps)throw Error('State transport requires an AI teammate');
}
function containsCallable(v, seen=new Set()) {
 if(typeof v==='function')return true;
 if(!v || typeof v!=='object' || seen.has(v))return false;
 seen.add(v);
 const xs=v instanceof Map?[...v].flat():v instanceof Set?[...v]:Object.values(v);
 return xs.some(x=>containsCallable(x,seen));
}
function graphEncoder(m,stable=true) {
 if(!sourceGraphs.has(m))sourceGraphs.set(m,{objects:new WeakMap(),sequence:0});
 const graph=stable?sourceGraphs.get(m):{objects:new WeakMap(),sequence:0}, visited=new Set();
 const encode=v=>{
  if(v===undefined)return {kind:'undefined'};
  if(typeof v==='number'&&!Number.isFinite(v))return {kind:'number',value:String(v)};
  if(v===null || typeof v!=='object'){
   if(['function','symbol','bigint'].includes(typeof v))throw Error('Unsupported policy state value');
   return v;
  }
  if(v.m===m && m.players.get(v.playerId)===v)return {kind:'player',value:v.playerId};
  let id=graph.objects.get(v);if(!id){id=++graph.sequence;graph.objects.set(v,id);}
  if(visited.has(id))return {kind:'reference',id};visited.add(id);
  if(Array.isArray(v))return {kind:'array',id,value:v.map(encode)};
  if(v instanceof Map)return {kind:'map',id,value:[...v].map(([k,x])=>[encode(k),encode(x)])};
  if(v instanceof Set)return {kind:'set',id,value:[...v].map(encode)};
  return {kind:'object',id,value:Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x!=='function').map(([k,x])=>[k,encode(x)]))};
 };
 return encode;
}
function graphDecoder(m,objects=new Map()) {
 const decode=v=>{
  if(v===null || typeof v!=='object')return v;
  if(v.kind==='undefined')return undefined;
  if(v.kind==='number'){
   if(!['NaN','Infinity','-Infinity'].includes(v.value))throw Error('Invalid numeric state');
   return Number(v.value);
  }
  if(v.kind==='player')return m.players.get(v.value);
  if(v.kind==='reference'){if(!objects.has(v.id))throw Error('Unknown state reference');return objects.get(v.id);}
  if(!Number.isInteger(v.id)||v.id<1)throw Error('Invalid state object ID');
  const kinds={array:Array.isArray,map:x=>x instanceof Map,set:x=>x instanceof Set,object:x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&!(x instanceof Map)&&!(x instanceof Set)};
  if(!own(kinds,v.kind))throw Error('Invalid state object kind');
  let out=objects.get(v.id);
  if(out&&!kinds[v.kind](out))throw Error('State reference changed kind');
  if(!out){out=v.kind==='array'?[]:v.kind==='map'?new Map():v.kind==='set'?new Set():{};objects.set(v.id,out);}
  if(v.kind==='array'){out.length=v.value.length;v.value.forEach((x,i)=>{out[i]=decode(x);});}
  else if(v.kind==='map'){out.clear();for(const [k,x]of v.value)out.set(decode(k),decode(x));}
  else if(v.kind==='set'){out.clear();for(const x of v.value)out.add(decode(x));}
  else{
   for(const k of Object.keys(out))if(!own(v.value,k))delete out[k];
   for(const [k,x]of Object.entries(v.value)){
    if(['__proto__','constructor','prototype'].includes(k))throw Error('Unsafe state property');
    out[k]=decode(x);
   }
  }
  return out;
 };
 return decode;
}
function playerFields(ps) {
 return Object.fromEntries(Object.entries(ps).filter(([k,v])=>(PLAYER_FIELDS.has(k)||policyKey(k))
  &&typeof v!=='function'&&!containsCallable(v)));
}
export function captureBotState(m) {
 if(!m.order.some(p=>p.isBot))throw Error('No AI teammate in this match');
 const encode=graphEncoder(m);
 // Later roots can refer to earlier roots: this traversal order is part of the format.
 const options=encode(Object.fromEntries(Object.entries(m.opts).filter(([k,v])=>(OPTION_FIELDS.has(k)||/^routeAI/.test(k))&&!containsCallable(v))));
 const match=encode(Object.fromEntries(MATCH_FIELDS.filter(k=>own(m,k)).map(k=>[k,m[k]])));
 const players=m.order.map(ps=>({playerId:ps.playerId,fields:encode(playerFields(ps))}));
 const pool=encode({entries:m.pool.entries,banned:m.pool.banned}),itemPool=encode({debt:m.itemPool.debt});
 return {version:1,options,match,players,pool,itemPool,rng:Object.fromEntries(RNG_STREAMS.map(k=>[k,m[k].state()])),now:m.sched.now()};
}
export function botOptions(state) {
 if(state?.version!==1)throw Error('Unsupported teammate state');
 return graphDecoder({players:new Map()})(state.options);
}
export function hydrateBotState(m,state,{preservePolicyFor=null}={}) {
 if(state?.version!==1)throw Error('Unsupported teammate state');
 if(preservePolicyFor!==null)requireBot(m,m.players.get(preservePolicyFor));
 if(!mirrors.has(m))mirrors.set(m,{objects:new Map(),initialized:false,players:new Map()});
 const context=mirrors.get(m),decode=graphDecoder(m,context.objects);
 Object.assign(m.opts,decode(state.options));Object.assign(m,decode(state.match));
 for(const row of state.players){
  const ps=m.players.get(row.playerId);if(!ps)throw Error('Teammate state player is missing');
  const fields=decode(row.fields),previous=context.players.get(row.playerId)||new Set(),preserve=ps.playerId===preservePolicyFor;
  for(const k of previous)if(!own(fields,k)&&!(preserve&&policyKey(k)))delete ps[k];
  for(const [k,v]of Object.entries(fields)){
   if(context.initialized&&preserve&&policyKey(k))continue;
   if(k==='diyStock')Object.assign(ps.diyStock,v);else ps[k]=v;
  }
  context.players.set(row.playerId,new Set(Object.keys(fields)));ps._deployMap=null;
 }
 Object.assign(m.pool,decode(state.pool));Object.assign(m.itemPool,decode(state.itemPool));
 m.stage=m.stageId?m.gd.stage(m.stageId):null;m.sched.t=state.now;context.initialized=true;return m;
}
export function capturePolicyState(m,ps) {
 requireBot(m,ps);
 return graphEncoder(m,false)(Object.fromEntries(Object.entries(ps).filter(([k,v])=>policyKey(k)&&typeof v!=='function'&&!containsCallable(v))));
}
export function applyPolicyState(m,ps,state) {
 requireBot(m,ps);if(!state)return;
 const fields=graphDecoder(m)(state);
 for(const [k,v]of Object.entries(fields))if(policyKey(k))ps[k]=v;
 // Function-valued strategy caches rebuild from the confirmed current inventory.
 delete ps._botFocus;
}
// Native mulberry32 semantics, including zero-state clones. No state is drawn while capturing a snapshot.
export function botRng(state,draw=null,readState=null) {
 let s=Number(state)>>>0;
 const next=()=>{if(draw)return draw();s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const rng=()=>next();rng.int=n=>Math.floor(next()*Math.max(0,n));rng.range=(a,b)=>a+next()*(b-a);rng.chance=p=>next()<p;rng.pick=a=>a?.length?a[Math.floor(next()*a.length)]:undefined;
 rng.shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 rng.weighted=(a,weight)=>{let total=0;for(const x of a)total+=Math.max(0,weight(x));if(total<=0)return undefined;let pick=next()*total;for(const x of a){pick-=Math.max(0,weight(x));if(pick<0)return x;}return a.at(-1);};
 rng.state=()=>readState?readState():s;rng.clone=()=>botRng(rng.state());return rng;
}
