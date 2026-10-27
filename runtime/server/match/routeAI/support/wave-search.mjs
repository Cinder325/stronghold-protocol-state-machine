// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Bounded, read-only native current-wave coordinate search. A candidate is never
// applied to a live player and preview battles are never actual match recordings.
import assert from 'node:assert/strict';
import {Battle} from "../../../sim/Battle.js";
import {rehearsalCap} from "../../../sim/rehearsal.js";
import {LayoutPlan,fieldModel,rangeRec,rangeTiles} from "../../bot.js";
import {canPlace,legalTiles,parseKey,placeClass} from "../../board.js";
import {computeBonds,pieceBonds} from "../../bondsMeta.js";
import {forecastLayerGains} from "./layerForecast.js";
import {rotateOffset} from "../../../sim/dir.js";
import {normalPreviewOptions48} from "./wave-preview.mjs";

const RNGS=['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'];
const DIRS=['RIGHT','UP','DOWN','LEFT'];
const WEIGHTS={kjeragShip:1,skillfulShip:1.5,arcaneShip:2};
const weighted=g=>Object.entries(g||{}).reduce((s,[id,n])=>s+n*(WEIGHTS[id]||0),0);
const clonePlan=p=>{const q=new LayoutPlan(p);q.dirs=new Map(p.dirs||[]);return q;};
const signature=p=>JSON.stringify([...p].map(([uid,key])=>[uid,key,p.dirOf(uid)]).sort((a,b)=>a[0]-b[0]));
const snapshot=m=>JSON.stringify({players:m.order.map(p=>p.privateView()),uid:m.uidSeq,
  rng:RNGS.map(k=>m[k]?.state?.()),stock:[...m.pool.entries],debt:[...m.itemPool.debt],wave:m.wave});
const healer=(gd,u)=>gd.chess(u.id)?.attackKind==='heal'||['塞雷娅','古米','黍','瑕光'].includes(gd.chess(u.id)?.name);
const freezes=new Set(['chess_char_3_14_a','chess_char_4_22_a','chess_char_5_14_a']);
const SWIRE='chess_char_3_04_a';
const ARCHE='chess_char_3_21_a',WHITE='chess_char_4_21_a';
const OPPOSITE={RIGHT:'LEFT',LEFT:'RIGHT',UP:'DOWN',DOWN:'UP'};

// [ASSUMED] Map-independent proposals: follow each actual ground route from its
// spawn towards its goal. A blocker must intercept BEFORE an exposed healer.
// These are candidates only, not a promise of protection against ranged enemies.
export function pathProtection52(m,ps,chosen,seed,{maxCandidates=4}={}){
  const gd=ps.gd||m.gd,lm=Object.create(m);lm._botPath=null;
  const model=fieldModel(lm,ps),map=ps.deployMap(),out=[];
  const tanks=chosen.filter(u=>gd.chess(u.id)?.position==='MELEE'&&(gd.chess(u.id)?.stats?.blockCnt||0)>=2);
  const medics=chosen.filter(u=>gd.chess(u.id)?.attackKind==='heal');
  const exposed=plan=>model.routes.filter(rt=>!rt.fly).reduce((sum,rt)=>{
    return sum+medics.reduce((n,u)=>{
      const key=plan.get(u.uid),index=rt.tiles.indexOf(key);if(index<0)return n;
      const protectedBy=tanks.some(t=>{const i=rt.tiles.indexOf(plan.get(t.uid));return i>=0&&i<index;});
      return n+(protectedBy?0:rt.n);
    },0);
  },0);
  const before=exposed(seed);
  for(const medic of medics)for(const tank of tanks){
    const a=seed.get(medic.uid),b=seed.get(tank.uid);if(!a||!b)continue;
    if(!canPlace(map,placeClass(ps,gd.chess(medic.id)),...parseKey(b))
      ||!canPlace(map,placeClass(ps,gd.chess(tank.id)),...parseKey(a)))continue;
    const trial=clonePlan(seed);trial.set(medic.uid,b);trial.set(tank.uid,a);
    // Face the healer towards the intercept point, then require real healing range.
    for(const dir of DIRS){
      if(!rangeTiles(rangeRec(ps,gd.chess(medic.id)),...parseKey(b),dir).includes(a))continue;
      const plan=clonePlan(trial);plan.dirs.set(medic.uid,dir);
      const after=exposed(plan);if(after>=before)continue;
      out.push({kind:'path-blocker-before-healer',plan,medicUID:medic.uid,tankUID:tank.uid,before,after});
    }
  }
  return out.sort((a,b)=>a.after-b.after||a.medicUID-b.medicUID||a.tankUID-b.tankUID).slice(0,maxCandidates);
}

// [ASSUMED] Geometry proposes one supported upstream buffer. Only a subsequent
// native battle can establish whether it survives, protects the core or gains layers.
export function supportedSwireFront47(m,ps,chosen,seed,{model=null}={}){
  const gd=ps.gd||m.gd,swire=chosen.find(u=>gd.baseIdOf(u.id)===SWIRE&&!pieceBonds(gd,u).includes('kjeragShip'));
  if(!swire)return {plan:null,reason:'No non-Kjerag Swire in the actual roster'};
  if(!chosen.some(u=>u.uid!==swire.uid&&healer(gd,u)))return {plan:null,reason:'No true healer in the actual roster'};
  const lm=Object.create(m);lm._botPath=null;
  const copy=Object.create(ps);copy._botRangeRecs=new Map(ps._botRangeRecs||[]);
  const field=model||fieldModel(lm,copy),map=ps.deployMap(),old=seed.get(swire.uid),proposals=[];
  if(!old)return {plan:null,reason:'Swire has no legal starting placement'};
  const currentProgress=field.ground.get(old)?.prog??1;
  for(const [r,c]of legalTiles(map,placeClass(ps,gd.chess(swire.id)))){
    const key=`${r},${c}`,flow=field.ground.get(key);
    if(!flow||flow.prog>=currentProgress||key===old)continue;
    const other=chosen.find(u=>u.uid!==swire.uid&&seed.get(u.uid)===key);
    if(other&&!canPlace(map,placeClass(ps,gd.chess(other.id)),...parseKey(old)))continue;
    const trial=clonePlan(seed);trial.set(swire.uid,key);if(other)trial.set(other.uid,old);
    const covering=chosen.filter(u=>u.uid!==swire.uid&&trial.has(u.uid)&&rangeTiles(rangeRec(copy,gd.chess(u.id)),
      ...parseKey(trial.get(u.uid)),trial.dirOf(u.uid)).includes(key));
    const heals=covering.filter(u=>healer(gd,u));
    const fire=covering.filter(u=>!healer(gd,u)&&gd.chess(u.id)?.attackKind!=='none'&&(gd.chess(u.id)?.stats?.atk||0)>0);
    const nearby=chosen.filter(u=>u.uid!==swire.uid&&trial.has(u.uid)&&Math.max(...parseKey(trial.get(u.uid)).map((x,i)=>Math.abs(x-[r,c][i])))<=2);
    if(!heals.length||fire.length<2||nearby.length<2)continue;
    proposals.push({plan:trial,target:key,progress:flow.prog,flow:flow.flow,healerUIDs:heals.map(u=>u.uid),
      fireUIDs:fire.map(u=>u.uid),nearbyUIDs:nearby.map(u=>u.uid),outgoingUID:other?.uid??null});
  }
  proposals.sort((a,b)=>a.progress-b.progress||b.flow-a.flow||b.fireUIDs.length-a.fireUIDs.length||a.target.localeCompare(b.target));
  return proposals.length?{...proposals[0],reason:'Supported upstream non-core buffer; geometry is heuristic, native combat decides'}
    :{plan:null,reason:'No legal upstream tile with true healing, two other damage ranges and nearby allies'};
}

function detached(ps,chosen){
  const copy=Object.create(ps),selected=new Set(chosen.map(u=>u.uid));
  copy._botRangeRecs=new Map(ps._botRangeRecs||[]);
  copy.hand=structuredClone(ps.hand.map(u=>u&&selected.has(u.uid)?null:u));
  copy.temp=structuredClone(ps.temp.map(u=>u&&selected.has(u.uid)?null:u));
  for(const u of ps.board.values())if(u.kind==='chess'&&!selected.has(u.uid)){
    const i=copy.hand.findIndex(x=>x==null);
    if(i>=0)copy.hand[i]=structuredClone(u);else copy.temp.push(structuredClone(u));
  }
  return copy;
}

// Propose a small diverse set of atomic copy relations before the coordinate
// budget is shared out. Geometry only proposes: actual current-wave combat still
// decides whether moving a healer or carry is safe. No fixed seed/board pattern.
export function copyRelations47(m,ps,chosen,seed,{maxCandidates=6}={}){
  const gd=ps.gd||m.gd,map=ps.deployMap(),out=[],seen=new Set([signature(seed)]);
  const arches=chosen.filter(u=>gd.baseIdOf(u.id)===ARCHE),whites=chosen.filter(u=>gd.baseIdOf(u.id)===WHITE);
  const movable=(trial,u,key,dir)=>{
    const old=trial.get(u.uid);if(!old||!canPlace(map,placeClass(ps,gd.chess(u.id)),...parseKey(key)))return false;
    const other=chosen.find(v=>v.uid!==u.uid&&trial.get(v.uid)===key);
    if(other&&!canPlace(map,placeClass(ps,gd.chess(other.id)),...parseKey(old)))return false;
    trial.set(u.uid,key);trial.dirs.set(u.uid,dir);if(other)trial.set(other.uid,old);return true;
  };
  for(const arc of arches)for(const white of whites){
    if(!seed.has(arc.uid)||!seed.has(white.uid))continue;
    const anchors=new Set([seed.get(arc.uid),seed.get(white.uid)]);
    for(const key of [...anchors])for(const dir of DIRS){
      const[r,c]=parseKey(key),[dr,dc]=rotateOffset(0,1,dir);anchors.add(`${r+dr},${c+dc}`);
    }
    for(const anchor of anchors)for(const dir of DIRS){
      const[r,c]=parseKey(anchor),[dr,dc]=rotateOffset(0,1,dir),whiteKey=`${r-dr},${c-dc}`;
      for(const kind of ['copy-front-chain','copy-face-to-face','copy-white-arc-gnosis']){
        const trial=clonePlan(seed),arcDir=kind==='copy-face-to-face'?OPPOSITE[dir]:dir;
        if(!movable(trial,arc,anchor,arcDir)||!movable(trial,white,whiteKey,dir))continue;
        if(kind==='copy-white-arc-gnosis'){
          const gnosis=chosen.find(u=>ps.gd.baseIdOf(u.id)==='chess_char_4_13_a');
          if(!gnosis||!movable(trial,gnosis,`${r+dr},${c+dc}`,trial.dirOf(gnosis.uid)))continue;
        }
        const sig=signature(trial);if(seen.has(sig))continue;seen.add(sig);
        const copy=detached(ps,chosen),views=new Map(chosen.map(u=>{
          const[row,col]=parseKey(trial.get(u.uid));return[u.uid,{...u,row,col,dir:trial.dirOf(u.uid)}];
        })),board=new Map([...views.values()].map(u=>[`${u.row},${u.col}`,u]));
        const bonds=computeBonds(gd,{board,hand:copy.hand,layers:ps.layers,m});
        const forecast=forecastLayerGains(m,copy,{board,hand:copy.hand,views,bonds},{events:['SERVER_PREP_START']});
        const gains=forecast.forecasts[0].gains;
        const distance=chosen.reduce((n,u)=>{
          const a=parseKey(seed.get(u.uid)),b=parseKey(trial.get(u.uid));
          return n+Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        },0);
        out.push({kind,plan:trial,arcUID:arc.uid,whiteUID:white.uid,gains,score:weighted(gains),distance,sig});
      }
    }
  }
  const order=(a,b)=>b.score-a.score||a.distance-b.distance||a.sig.localeCompare(b.sig);
  const groups=['copy-front-chain','copy-face-to-face','copy-white-arc-gnosis'].map(kind=>out.filter(r=>r.kind===kind).sort(order));
  const selected=[];
  // Both relation families get a chance even when one has the larger heuristic
  // projection. A missing relation is not replaced by a fabricated operator.
  while(selected.length<Math.max(0,maxCandidates)&&groups.some(g=>g.length))
    for(const group of groups)if(group.length&&selected.length<maxCandidates)selected.push(group.shift());
  return selected;
}

/** Return the best actually tested layout, or an explicit abstention; no live mutation. */
export function refineWave47(m,ps,p,chosen,basePlan,{note=()=>{},maxEvaluations=80}={}){
  if(m.phase!=='PREP'||!m.wave||m.round>=m.gd.bossRound||!ps.alive||!chosen.length)return null;
  const gd=ps.gd||m.gd,owned=new Set(ps.allChess().map(u=>u.uid)),map=ps.deployMap();
  const receipt={kind:'bounded-native-current-wave-coordinate-search',settled:false,round:m.round,
    maxEvaluations:Math.max(1,Math.min(80,Math.trunc(maxEvaluations)||80)),evaluations:[],selected:null,
    relationCandidates:[],unitSearches:[],
    weights:WEIGHTS,conditional:'Fixed actual roster/current wave. Next prep growth requires own-wave survival; unknown teammate rescue is not credited.',
    tieBreakMeaning:'Heuristic at equal growth and loss: preserve native freeze-support survivors; with no additional deaths or leaks prefer non-core Swire taking damage. Deployment does not fabricate acquisition layers.',
    liveStateUnchanged:false,abstention:null};
  let plan=clonePlan(basePlan);
  const before=snapshot(m),seen=new Set(),valid=[];
  const legal=t=>{const used=new Set();return chosen.every(u=>{
    const key=t.get(u.uid);if(!owned.has(u.uid)||!key||used.has(key))return false;used.add(key);
    return canPlace(map,placeClass(ps,gd.chess(u.id)),...parseKey(key));
  });};
  const run=t=>{
    const key=signature(t);
    if(seen.has(key)||receipt.evaluations.length>=receipt.maxEvaluations||!legal(t))return null;
    seen.add(key);const row={index:receipt.evaluations.length,plan:[...t].map(([uid,tile])=>({uid,tile,dir:t.dirOf(uid)}))};
    receipt.evaluations.push(row);
    try{
      const copy=detached(ps,chosen),board=new Map(chosen.map(u=>[t.get(u.uid),{...u,dir:t.dirOf(u.uid)}]));
      const projected=normalPreviewOptions48(m,copy,{board}),opts=projected.opts,battle=m.newBattle(opts,{preview:true});
      row.preparationProjection=projected.receipt;
      assert(battle instanceof Battle,'Native Battle required');
      let ticks=0;const cap=rehearsalCap(opts.timeLimit);
      while(!battle.finished&&ticks++<cap)battle.step();
      if(!battle.finished||battle.errorCount>0)throw Error('Incomplete or errored native battle');
      const result=battle.result(),own=result.perPlayer?.[ps.playerId];assert(own,'Missing own native result');
      const leaks=(own.leaked||[]).filter(l=>l.counted!==false).length;
      const loss=Math.min(gd.lpCapPerRound,leaks),survives=p.lp>loss;
      const views=new Map(chosen.map(u=>{const [r,c]=parseKey(t.get(u.uid));return [u.uid,{...u,row:r,col:c,dir:t.dirOf(u.uid)}];}));
      const bonds=computeBonds(gd,{board,hand:copy.hand,layers:ps.layers,m});
      const forecast=forecastLayerGains(m,copy,{board,hand:copy.hand,views,bonds},{bondWeights:WEIGHTS,nextStartWeight:1});
      const finish=forecast.forecasts.find(f=>f.event==='SERVER_PREP_FIN')?.gains||{};
      const next=forecast.forecasts.find(f=>f.event==='SERVER_PREP_START')?.gains||{};
      const futureWeight=p.lp>gd.lpCapPerRound+2?Math.min(3,gd.bossRound-m.round):1;
      const freezeUIDs=new Set(chosen.filter(u=>freezes.has(gd.baseIdOf(u.id))).map(u=>u.uid));
      const swireUIDs=new Set(chosen.filter(u=>gd.baseIdOf(u.id)===SWIRE&&!pieceBonds(gd,u).includes('kjeragShip')).map(u=>u.uid));
      Object.assign(row,{finished:true,errors:result.errors,ticks,countedLeaks:leaks,cappedLoss:loss,ownLossSurvives:survives,
        killed:own.killed,deaths:own.deaths,layerGains:own.layerGains||{},conditionalPrepForecast:forecast,
        freezeSupportSurvivors:(own.unitsEnd||[]).filter(u=>u.alive&&freezeUIDs.has(u.uid)).length,
        nonCoreSwireDamageTaken:(own.unitStats||[]).filter(u=>swireUIDs.has(u.uid)).reduce((s,u)=>s+(u.taken||0),0),
        futureWeight,futureWeightMeaning:'Heuristic value of a conditional next-start projection, not repeated guaranteed gains',
        growthScore:weighted(own.layerGains)+weighted(finish)+(survives?weighted(next)*futureWeight:0)});
      valid.push({...row,testedPlan:clonePlan(t)});return row;
    }catch(error){row.finished=false;row.error=String(error.message||error);return row;}
  };
  const best=()=>{
    if(!valid.length)return null;
    const survivors=valid.filter(r=>r.ownLossSurvives),set=survivors.length?survivors:valid;
    const minimum=Math.min(...set.map(r=>r.cappedLoss));
    const budget=survivors.length&&minimum<=2&&p.lp>gd.lpCapPerRound+2?2:0;
    return set.filter(r=>r.cappedLoss<=minimum+budget).sort((a,b)=>survivors.length
      ?b.growthScore-a.growthScore||a.cappedLoss-b.cappedLoss||a.countedLeaks-b.countedLeaks
        ||b.freezeSupportSurvivors-a.freezeSupportSurvivors||a.deaths-b.deaths||b.nonCoreSwireDamageTaken-a.nonCoreSwireDamageTaken||a.index-b.index
      :a.cappedLoss-b.cappedLoss||a.countedLeaks-b.countedLeaks||b.growthScore-a.growthScore||a.index-b.index)[0];
  };
  try{
    const baseline=run(plan);
    if(!baseline?.finished){receipt.abstention='No finished legal native baseline';return {plan,receipt};}
    receipt.pathCandidates=[];
    for(const candidate of pathProtection52(m,ps,chosen,plan)){
      const row=run(candidate.plan);
      receipt.pathCandidates.push({...candidate,plan:undefined,evaluation:row?.index??null});
      if(row)row.proposal=candidate.kind;
    }
    const pathWinner=best();if(pathWinner)plan=pathWinner.testedPlan;
    const frontline=supportedSwireFront47(m,ps,chosen,plan);
    receipt.frontlineCandidate={...frontline,plan:undefined,heuristic:true,
      ruleBoundary:'Swire is an expendable body, not a fabricated layer trigger. Degenbrecher acquisition layers are not granted by deployment.'};
    if(frontline.plan){
      const row=run(frontline.plan);receipt.frontlineCandidate.evaluation=row?.index??null;
      if(row)row.proposal='supported-non-core-Swire-frontline';
      const winner=best();if(winner)plan=winner.testedPlan;
    }
    for(const relation of copyRelations47(m,ps,chosen,plan)){
      if(receipt.evaluations.length>=receipt.maxEvaluations)break;
      const row=run(relation.plan);
      receipt.relationCandidates.push({kind:relation.kind,arcUID:relation.arcUID,whiteUID:relation.whiteUID,
        conditionalNextGains:relation.gains,evaluation:row?.index??null});
      if(row){row.proposal=relation.kind;row.relationUIDs=[relation.whiteUID,relation.arcUID];}
    }
    const relationWinner=best();if(relationWinner)plan=relationWinner.testedPlan;
    const safe=baseline.countedLeaks===0;
    const priority=u=>{
      const id=gd.baseIdOf(u.id);
      if(safe&&freezes.has(id))return 0;
      if(healer(gd,u))return 1;
      if(freezes.has(id))return 2;
      if(['chess_char_3_21_a','chess_char_4_21_a'].includes(id))return 3;
      if(id==='chess_char_3_04_a')return 4;
      return 5;
    };
    const units=chosen.slice().sort((a,b)=>priority(a)-priority(b)||Number(gd.isGolden(b.id))-Number(gd.isGolden(a.id))||a.uid-b.uid);
    for(const [index,u]of units.entries()){
      const search={uid:u.uid,id:u.id,priority:priority(u),quota:0,evaluations:[]};receipt.unitSearches.push(search);
      const remaining=receipt.maxEvaluations-receipt.evaluations.length;
      if(!remaining){search.abstention='Global native-preview budget exhausted';continue;}
      search.quota=Math.ceil(remaining/(units.length-index));
      const seed=clonePlan(plan),old=seed.get(u.uid);
      const [or,oc]=parseKey(old),tiles=legalTiles(map,placeClass(ps,gd.chess(u.id)))
        .sort((a,b)=>Math.abs(a[0]-or)+Math.abs(a[1]-oc)-Math.abs(b[0]-or)-Math.abs(b[1]-oc)||a[0]-b[0]||a[1]-b[1]);
      const proposals=[];
      // Facing changes are cheap and useful at the existing tile. Thereafter
      // test the current facing across nearby tiles before spending on their
      // other directions, instead of using an entire quota on one far corner.
      for(const dir of DIRS)proposals.push({r:or,c:oc,dir});
      for(const dir of [seed.dirOf(u.uid),...DIRS.filter(d=>d!==seed.dirOf(u.uid))])
        for(const[r,c]of tiles)if(r!==or||c!==oc)proposals.push({r,c,dir});
      for(const {r,c,dir}of proposals){
        if(search.evaluations.length>=search.quota||receipt.evaluations.length>=receipt.maxEvaluations)break;
        const key=`${r},${c}`,other=chosen.find(v=>v.uid!==u.uid&&seed.get(v.uid)===key);
        if(other&&!canPlace(map,placeClass(ps,gd.chess(other.id)),...parseKey(old)))continue;
        const trial=clonePlan(seed);trial.set(u.uid,key);trial.dirs.set(u.uid,dir);
        if(other)trial.set(other.uid,old);
        const row=run(trial);
        if(row){row.proposal='unit-coordinate';row.sourceUID=u.uid;search.evaluations.push(row.index);}
      }
      if(!search.evaluations.length)search.abstention='No distinct legal native candidate remained';
      const winner=best();if(winner)plan=winner.testedPlan;
    }
    const winner=best();
    if(winner){plan=winner.testedPlan;receipt.selected=winner.index;receipt.baseline=receipt.evaluations[0];
      receipt.selection={countedLeaks:winner.countedLeaks,cappedLoss:winner.cappedLoss,growthScore:winner.growthScore,ownLossSurvives:winner.ownLossSurvives,
        freezeSupportSurvivors:winner.freezeSupportSurvivors,nonCoreSwireDamageTaken:winner.nonCoreSwireDamageTaken};}
    return {plan,receipt};
  }finally{
    receipt.liveStateUnchanged=snapshot(m)===before;
    assert(receipt.liveStateUnchanged,'Current-wave coordinate preview changed live state, RNG, UID or stock');
    note('fsm-current-wave-search47',receipt);
  }
}
