// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {LAYOUT_PARAMS,LayoutPlan,createRehearsal,fieldModel,layoutValue,planLayout,rangeRec,rangeTiles} from "../../../bot.js";
import {rosterBonds47,selectRoster47} from "./roster.mjs";
import {canPlace,legalTiles,parseKey,placeClass} from "../../../board.js";
import {CORE47,DEFAULT_POLICY47,DIRS,IDS47,block,coreOf,heal,is,own} from "./model.mjs";
import {rotateOffset} from "../../../../sim/dir.js";
import {pieceBonds} from "../../../bondsMeta.js";
import {chooseTacticalRoster47} from "../../support/tactical-roster.mjs";
import {protectedSale47} from "./procurement.mjs";
import {bossAura47,planBoss47} from "../../support/boss-planning.mjs";
import {normalPreviewOptions48} from "../../support/wave-preview.mjs";
import {refineWave47} from "../../support/wave-search.mjs";
import {applyPlacement47} from "../../support/kjerag-placement.mjs";
import {forecastLayerGains} from "../../support/layerForecast.js";


export function copyPlan(plan){const out=new LayoutPlan(plan);out.dirs=new Map(plan.dirs);return out;}

export function choosePreview45(candidates,{lp,cap,plannedTrade=2}){
  const full=candidates.map((c,index)=>({...c,index,cappedLoss:Math.min(cap,c.countedLeaks)}))
    .filter(c=>c.finished&&Number.isFinite(c.countedLeaks));
  if(!full.length)return 0;
  const minimum=Math.min(...full.map(c=>c.cappedLoss));
  const budget=lp>cap+2&&minimum<=2?Math.min(plannedTrade,Math.max(0,lp-minimum-1)):0;
  const safe=full.filter(c=>c.cappedLoss<=minimum+budget);
  safe.sort((a,b)=>(minimum>=lp?a.countedLeaks-b.countedLeaks:0)
    ||((b.growthScore||0)-b.cappedLoss*3)-((a.growthScore||0)-a.cappedLoss*3)
    ||a.cappedLoss-b.cappedLoss||a.countedLeaks-b.countedLeaks||a.index-b.index);
  return safe[0].index;
}


export function geometry47(gd,p,units,plan,recOf,model=null,freezeWeight=12){
  const at=new Map(units.filter(u=>plan.has(u.uid)).map(u=>[plan.get(u.uid),u]));
  const b=rosterBonds47(gd,p,units),links=[];let gain=0,healedFront=0;
  for(const u of units){
    const key=plan.get(u.uid);if(!key)continue;const [r,c]=parseKey(key),dir=plan.dirOf(u.uid);
    if(is(gd,u,IDS47.arc)||is(gd,u,IDS47.sa)){
      const [dr,dc]=rotateOffset(0,1,dir),target=at.get(`${r+dr},${c+dc}`),bs=target?pieceBonds(gd,target):[];
      if(is(gd,u,IDS47.arc)){
        const n=gd.isGolden(u.id)?6:3;
        const targetB=bs.filter(id=>b[id]?.active),selfB=pieceBonds(gd,u).filter(id=>b[id]?.active);
        gain+=selfB.reduce((s,id)=>s+n*(id===CORE47?2:1),0);
        gain+=targetB.reduce((s,id)=>s+n*(id===CORE47?2:1),0);
        links.push({kind:'next-prep-start',uid:u.uid,target:target?.uid??null,targetName:target?gd.chess(target.id)?.name:null,
          selfBonds:selfB,targetBonds:targetB});
      }else if(target&&bs.includes(CORE47)){
        // This only values the legal relation; current combat still must create real freezes.
        gain+=6+(is(gd,target,IDS47.gnosis)||is(gd,target,IDS47.pram)?6:0);
        links.push({kind:'current-battle-front-grant',uid:u.uid,target:target.uid,targetName:gd.chess(target.id)?.name});
      }
    }
    if(heal(gd,u)){
      const covered=new Set(rangeTiles(recOf(u),r,c,dir));
      healedFront+=units.filter(v=>block(gd,v)&&covered.has(plan.get(v.uid))).length;
    }
  }
  const receivers=units.filter(u=>is(gd,u,IDS47.pram)||is(gd,u,IDS47.silver));
  for(const link of links.filter(l=>l.kind==='current-battle-front-grant')){
    const target=units.find(u=>u.uid===link.target);if(target)receivers.push(target);
  }
  let freezeExposure=0;
  if(model){
    const total=Math.max(1,model.routes.reduce((s,r)=>s+r.n,0));
    for(const u of receivers){
      const key=plan.get(u.uid);if(!key)continue;
      const [r,c]=parseKey(key),tiles=new Set(rangeTiles(recOf(u),r,c,plan.dirOf(u.uid)));
      freezeExposure+=model.routes.reduce((s,route)=>s+route.n*route.tiles.filter(k=>tiles.has(k)).length/Math.max(1,route.tiles.length),0)/total;
    }
  }
  return {weightedConditionalGrowth:gain+freezeExposure*freezeWeight,healedFront,links,freezeExposure,
    freezeExposureMeaning:'Conditional route coverage per freeze trait; no predicted or realized freeze count'};
}


export function arrangeKjerag47(m,ps,{observe,handle,policy=DEFAULT_POLICY47,note=()=>{},finalLayout=false}){
  let p=observe().match.private;const gd=ps.gd||m.gd;
  let chosen=selectRoster47(gd,p);
  const tactical=finalLayout?chooseTacticalRoster47(m,ps,p,chosen,{note,maxCandidates:8}):null;
  if(tactical)chosen=tactical.chosen;
  const ids=new Set(chosen.map(u=>u.uid));
  for(const u of p.board.filter(u=>u.kind==='chess'&&!ids.has(u.uid))){
    const fresh=observe().match.private,idx=fresh.hand.findIndex(x=>x==null);
    if(idx>=0)handle({t:'g.move',uid:u.uid,to:{area:'hand',idx}},'fsm-roster-withdraw');
    else if(!protectedSale47(gd,fresh,u,chosen))handle({t:'g.sell',uid:u.uid},'fsm-unprotected-roster-replacement');
  }
  p=observe().match.private;
  // Reuse only native geometry/exposure functions, with isolated deterministic tie-breaking.
  // No bondPlan, hidden-pool scoring, generic chooseLineup or generic economic loop is called.
  const lm=Object.create(m);lm.rngBots=()=>0.5;lm._botPath=null;
  const recOf=u=>rangeRec(ps,gd.chess(u.id));
  let plan=tactical?.plan?copyPlan(tactical.plan):planLayout(lm,ps,chosen),model=fieldModel(lm,ps);const combatPlan=copyPlan(plan);
  const projectionCache=new Map();
  const geometry=t=>{
    const key=JSON.stringify(chosen.map(u=>[u.uid,t.get(u.uid),t.dirOf(u.uid)]));
    if(!projectionCache.has(key))projectionCache.set(key,projectGeometry47(m,ps,p,chosen,t,recOf,model,policy.freezeExposureWeight));
    return projectionCache.get(key);
  };
  const norm=Math.max(1,model.routes.reduce((s,r)=>s+r.n,0));
  const plannedBonds={...p,bonds:Object.entries(rosterBonds47(gd,p,chosen)).map(([bondId,b])=>({bondId,...b}))};
  const value=t=>layoutValue(lm,ps,chosen,t)/norm*100
    +geometry(t).weightedConditionalGrowth*policy.layerWeight
    +geometry47(gd,p,chosen,t,recOf).healedFront*5
    +bossAura47(gd,plannedBonds,chosen,t).weightedCoverage*0.03;
  let best=value(plan);
  const map=ps.deployMap();
  for(let pass=0;pass<policy.layoutPasses;pass++){
    let changed=false;
    for(const u of chosen){
      let winning=plan,high=best;
      for(const [r,c] of legalTiles(map,placeClass(ps,gd.chess(u.id)))){
        const k=`${r},${c}`,occupant=chosen.find(v=>v.uid!==u.uid&&plan.get(v.uid)===k),old=plan.get(u.uid);
        if(occupant&&(!old||!canPlace(map,placeClass(ps,gd.chess(occupant.id)),...parseKey(old))))continue;
        for(const dir of DIRS){
          const trial=copyPlan(plan);trial.set(u.uid,k);trial.dirs.set(u.uid,dir);
          if(occupant)trial.set(occupant.uid,old);
          const score=value(trial);if(score>high+0.001){high=score;winning=trial;}
        }
      }
      if(winning!==plan){plan=winning;best=high;changed=true;}
    }
    if(!changed)break;
  }
  let preview=null;
  if(finalLayout&&policy.rehearsalCandidates>1&&m.wave&&m.round>=3){
    const inputs=[plan,combatPlan,planLayout(lm,ps,chosen,{...LAYOUT_PARAMS,hold:8,healHold:1})];
    const previews=[],preparations=[];lm.botRehearsal=policy.rehearsalCandidates;
    lm._normalOpts=(copy,options)=>{const projected=normalPreviewOptions48(m,copy,options);
      preparations.push(projected.receipt);return projected.opts;};
    lm.newBattle=(opts,flags)=>{const battle=m.newBattle(opts,flags);previews.push(battle);return battle;};
    const before=JSON.stringify(observe().match.private),job=createRehearsal(lm,ps,chosen,inputs);
    if(job){
      if(policy.previewLpBudget){
        for(const b of previews){let ticks=0;while(!b.finished&&ticks++<job.cap)b.step();if(!b.finished)b.forceEnd('timeout');}
      }else job.run();
      preview={kind:'isolated-current-wave-native-preview',settled:false,selected:job.plans.indexOf(job.best),
        lossScope:'min(native per-round cap, own leaks) before unknown teammate rescue; not actual settled team loss',
        candidates:previews.map((b,i)=>{const r=b.result(),own=r.perPlayer?.[ps.playerId],gain=own?.layerGains||{};
          const geometry=projectGeometry47(m,ps,p,chosen,job.plans[i],recOf,model,policy.freezeExposureWeight);
          return {finished:b.finished,killed:own?.killed??null,countedLeaks:own?.leaked?.filter(l=>l.counted!==false).length??null,
            conditionalNextPrepGrowth:geometry.weightedConditionalGrowth,previewLayerGains:gain,
            preparationProjection:preparations[i],
            growthScore:geometry.weightedConditionalGrowth+(gain[CORE47]||0)+(gain.skillfulShip||0)*1.5+(gain.arcaneShip||0)*2};})};
      if(policy.previewLpBudget)preview.selected=choosePreview45(preview.candidates,{lp:p.lp,cap:gd.lpCapPerRound,plannedTrade:policy.plannedPreviewTrade});
      plan=job.plans[preview.selected];
    }
    if(JSON.stringify(observe().match.private)!==before)throw Error('Preview changed real private state');
    if(preview)note('fsm-preview',preview);
  }
  const boss=finalLayout?planBoss47(m,ps,observe().match.private,chosen,{basePlan:plan,note,maxCandidates:8}):null;
  if(boss)plan=boss.plan;
  const refined=finalLayout?refineWave47(m,ps,observe().match.private,chosen,plan,{note,maxEvaluations:80}):null;
  if(refined)plan=refined.plan;
  const placement=applyPlacement47(ps,chosen,plan,{observe,handle});
  note('fsm-placement-receipt',placement);
  const final=observe().match.private,actual=new LayoutPlan(final.board.filter(u=>u.kind==='chess').map(u=>[u.uid,`${u.row},${u.col}`]));
  actual.dirs=new Map(final.board.map(u=>[u.uid,u.dir]));
  const summary={nativeCore:coreOf(final),preview,tactical:tactical?.receipt??null,boss:boss?.receipt??null,search:refined?.receipt??null,
    placement,roster:final.board.filter(u=>u.kind==='chess').map(u=>({uid:u.uid,name:gd.chess(u.id)?.name,
    id:u.id,row:u.row,col:u.col,dir:u.dir,items:u.items})),geometry:projectGeometry47(m,ps,final,
      final.board.filter(u=>u.kind==='chess'),actual,recOf,model,policy.freezeExposureWeight),heuristicValue:best};
  note('fsm-layout',summary);return summary;
}


export function projectGeometry47(m,ps,p,units,plan,recOf,model=null,freezeWeight=12){
  const gd=ps.gd||m.gd,geometry=geometry47(gd,p,units,plan,recOf,model,freezeWeight);
  const views=new Map(units.filter(u=>plan.has(u.uid)).map(u=>{
    const [row,col]=parseKey(plan.get(u.uid));return [u.uid,{...u,row,col,dir:plan.dirOf(u.uid)}];
  }));
  const board=new Map([...views.values()].map(u=>[`${u.row},${u.col}`,u]));
  const hand=p.hand.filter(u=>u&&!views.has(u.uid));
  const prepForecast=forecastLayerGains(m,ps,{board,hand,views,bonds:rosterBonds47(gd,p,units)},
    {bondWeights:{kjeragShip:1,skillfulShip:1.5,arcaneShip:2},nextStartWeight:m.round<gd.bossRound?1:0});
  const weights={kjeragShip:1,skillfulShip:1.5,arcaneShip:2};
  const futureWeight=m.round<gd.bossRound?Math.min(3,gd.bossRound-m.round):0;
  const objective=prepForecast.forecasts.reduce((sum,f)=>sum+Object.entries(f.gains).reduce((n,[id,gain])=>n+gain*(weights[id]||0),0)
    *(f.event==='SERVER_PREP_START'?futureWeight:1),0);
  return {...geometry,prepForecast,futureWeight,futureWeightMeaning:'Heuristic value multiplier for one conditional next-start projection; not three promised future settlements',weightedConditionalGrowth:objective
    +geometry.freezeExposure*freezeWeight+geometry.links.filter(l=>l.kind==='current-battle-front-grant').length*6};
}
