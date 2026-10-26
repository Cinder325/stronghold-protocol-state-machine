#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Deterministic policy evaluation on an installed, otherwise unmodified supported host.
// No recordings, user seats, resource grants, balance overrides, or fake battles are used.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installAddon} from './install.mjs';

export const DEFAULT_SEEDS=Object.freeze(Array.from({length:10},(_,i)=>111001+i));
export const HOST_COMMITS=Object.freeze({
 '0.3.1':'b3deebdae4a92642c007d217a1a4573e5d3612c5',
 '0.3.3':'f07b8965061bbc311ad7aa815879b09264a1e47d',
});
const ROOT=path.resolve(import.meta.dirname,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const quiet={info(){},warn(){},error(){},debug(){}};
const ACTIONS=new Set(['g.buy','g.refresh','g.freeze','g.levelUp','g.sell','g.move','g.equip','g.art','g.destroy','g.unequip','g.reward','g.choice','g.offer','g.offerRefresh','g.ready']);
const rel=(base,file)=>path.relative(base,file).split(path.sep).join('/');
const importHost=(host,file)=>import(pathToFileURL(path.join(host,file)));

function freezeHost(host){
 const entries=[];
 function walk(dir){for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),s=fs.lstatSync(file);assert(!s.isSymbolicLink(),'Host source must not contain links');
  if(s.isDirectory())walk(file);else if(s.isFile())entries.push([rel(host,file),sha(fs.readFileSync(file))]);
 }}
 for(const directory of ['server','shared','data'])walk(path.join(host,directory));
 entries.push(['package.json',sha(fs.readFileSync(path.join(host,'package.json')))]);
 return sha(JSON.stringify(entries));
}
function installedHost(host,root){
 const pkg=JSON.parse(fs.readFileSync(path.join(host,'package.json')));
 assert.equal(pkg.name,'stronghold-protocol-alliance');assert(HOST_COMMITS[pkg.version],'Unsupported host version');
 assert.equal(installAddon({target:host,root,dryRun:true}).status,'already-installed','Install this exact addon revision first');
 const bytes=fs.readFileSync(path.join(root,'addon-manifest.json')),manifest=JSON.parse(bytes);
 for(const entry of manifest.files){
  assert.equal(sha(fs.readFileSync(path.join(root,entry.source))),entry.sha256,'Payload changed since manifest generation');
  assert.equal(sha(fs.readFileSync(path.join(host,entry.target))),entry.sha256,'Installed payload differs');
 }
 return {version:manifest.version,hostVersion:pkg.version,hostCommit:HOST_COMMITS[pkg.version],manifestSha256:sha(bytes),hostDigest:freezeHost(host)};
}

/** Every native bond is present, including zero layers and bonds inactive on this board. */
export function snapshotBonds(m,ps){
 const state=ps.bondsView();
 return Object.fromEntries(m.gd.bondIds.slice().sort().map(id=>[id,{
  layers:Number(ps.layers[id])||0,count:state[id]?.count||0,active:!!state[id]?.active,
  modeOff:!!m.gd.modeInactiveBonds.has(id),
 }]));
}

/** Clear cohorts contain only routes still alive for the corresponding cleared boss fight. */
export function aggregateGames(games,bondIds,routeIds){
 const stage=round=>{
  const entered=games.filter(g=>g.bossRounds.some(r=>r.round===round));
  const clears=entered.filter(g=>g.bossRounds.find(r=>r.round===round).cleared);
  const routes=Object.fromEntries(routeIds.map(id=>{
   const samples=clears.flatMap(g=>g.bossRounds.find(r=>r.round===round).players.filter(p=>p.route===id&&p.aliveAtEntry));
   return [id,{samples:samples.length,meanLayers:Object.fromEntries(bondIds.map(b=>[b,samples.length?Math.round(samples.reduce((n,p)=>n+(p.bonds[b]?.layers||0),0)/samples.length*100)/100:null])),
    meanActiveBonds:samples.length?Math.round(samples.reduce((n,p)=>n+Object.values(p.bonds).filter(x=>x.active).length,0)/samples.length*100)/100:null}];
  }));
  return {entered:entered.length,cleared:clears.length,totalGames:games.length,clearRateAllGames:games.length?clears.length/games.length:null,
   clearRateAmongEntered:entered.length?clears.length/entered.length:null,routes};
 };
 return {round14:stage(14),round15:stage(15)};
}

export async function runGame({host,seed,expectedHostDigest=null,onProgress=()=>{}}){
 assert(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'Seed must be uint32');
 const [{Match},{VirtualScheduler},{DELAYS},{getData},{attachAudit},{runRoute},{ROUTES,routeFor,REQUIRED_BONDS}]=await Promise.all([
  importHost(host,'server/match/Match.js'),importHost(host,'server/match/scheduler.js'),importHost(host,'server/match/match/common.js'),
  importHost(host,'server/data.js'),importHost(host,'server/match/audit.js'),importHost(host,'server/match/routeAI/engine.js'),
  importHost(host,'server/match/routeAI/routes.js'),
 ]);
 const before=freezeHost(host);if(expectedHostDigest)assert.equal(before,expectedHostDigest,'Frozen source changed before the game');
 const sched=new VirtualScheduler(),seats=ROUTES.map((r,seat)=>({seat,playerId:`ai_route_${seat+1}`,name:`AI${seat+1}`,isBot:true,connected:true,botPersona:'unified'}));
 const report={seed,stageId:null,bossId:null,hiddenBossId:null,drawnBans:[],assignments:[],bossRounds:[],eliminations:[],outcome:null};
 let final=null,m;
 try{
  m=new Match({roomCode:'TEST',mode:'coop',difficulty:'ABYSS',seed,seats,data:getData({log:quiet}),scheduler:sched,
   routeAITest:true,routeAIIntervalMs:0,clientCombat:false,botRehearsal:0,botSliceMs:Infinity,botRehearsalDelegate:false,
   send:()=>true,broadcast(){},onEnd:r=>{final=r;},log:quiet});
  assert(m.order.length===4&&m.order.every(p=>p.isBot),'Exactly four actual AI seats required');
  report.stageId=m.stageId;report.bossId=m.bossId;report.hiddenBossId=m.hiddenBossId;
  report.drawnBans=(m.drawnDisabledBonds||m.disabledBonds||[]).slice().sort();
  assert(!REQUIRED_BONDS.some(id=>report.drawnBans.includes(id)),'Test opening failed declared keep conditions');
  const wanted=m.gd.bans(m.gd.difficulty),draw=report.drawnBans;
  assert.equal(draw.filter(id=>m.gd.bond(id).isCore).length,wanted.core);
  assert.equal(draw.filter(id=>!m.gd.bond(id).isCore).length,wanted.addon);
  report.assignments=m.order.map(p=>({seat:p.seat,route:routeFor(m,p).id}));
  assert.equal(new Set(report.assignments.map(p=>p.route)).size,4);
  const audit=attachAudit(m,{invariants:true});
  m.scheduleBotPrep=function(ps,i=0){
   assert(ps.isBot);const round=this.round,token=ps._botPrepToken=(ps._botPrepToken||0)+1;
   this.later(this.scaled(DELAYS.BOT_ACTION+i*DELAYS.BOT_STAGGER),()=>{
    if(this.phase!=='PREP'||this.round!==round||!ps.alive||ps.ready||ps._botPrepToken!==token)return;
    const observe=()=>({me:{playerId:ps.playerId},room:{code:this.roomCode,mode:this.mode,difficulty:this.difficulty,seats:this.opts.seats},
     match:{public:this.publicView(),private:ps.privateView(),result:null,battle:null}});
    const handle=intent=>{assert(ACTIONS.has(intent.t),'Policy attempted an unsupported action');return this._handle(ps,intent);};
    const result=runRoute(this,ps,{observe,handle});
    if(!result?.completion?.ready||!ps.ready){
     const view=ps.privateView(),state=result?.completion?.restoration;
     onProgress({event:'prep-blocked',seed,round,route:routeFor(this,ps).id,blocked:!!result?.completion?.blocked,
      pendingMembers:state?.pending?.length||0,missingMembers:state?.missingSelected?.length||0,
      pendingTemp:view.temp.filter(Boolean).length,rewardPending:!!view.shop.rewardOffer,choicePending:!!view.personalChoice});
    }
    assert(result?.completion?.ready&&ps.ready,'Policy failed to reach Ready');
    onProgress({event:'prep',seed,round,route:routeFor(this,ps).id});
   });
  };
  const enter=m.startFinalAssault.bind(m);
  m.startFinalAssault=function(hidden){
   const row={round:this.round,hidden:!!hidden,cleared:false,teamLpAtEntry:this.alivePlayers().reduce((n,p)=>n+p.lp,0),players:this.order.map(p=>({
    route:routeFor(this,p).id,aliveAtEntry:p.alive,lp:p.lp,bandId:p.bandId,bonds:snapshotBonds(this,p),
   }))};
   report.bossRounds.push(row);return enter(hidden);
  };
  const finishFinal=m._finishFinal.bind(m);
  m._finishFinal=function(hidden,resultOf){
   const row=report.bossRounds.find(r=>r.round===this.round);
   assert(row,'Boss end without recorded entry');
   row.cleared=this._finalEnding?this._finalEnding==='cleared':this.bossPool.hp<=0;
   row.teamLpAtEnd=this.teamLp;row.bossRemainingHp=Math.max(0,Math.round(this.bossPool.hp));
   const returned=finishFinal(hidden,resultOf);
   // Native result hooks have finished; the scheduled continuation has not yet switched to R15.
   for(const p of row.players){const ps=this.order.find(s=>routeFor(this,s).id===p.route);p.bonds=snapshotBonds(this,ps);p.lpAtEnd=ps.lp;}
   return returned;
  };
  const eliminated=new Set();m.start();let steps=0;
  while(!m.ended&&steps++<3000000){
   assert(sched.runNext(),'Native scheduler exhausted');
   assert.equal(sched.errors.length,0,'Native callback failed');
   assert.equal(m.errorCount,0,'Match callback failed');
   for(const p of m.order)if(!p.alive&&!eliminated.has(p.playerId)){eliminated.add(p.playerId);report.eliminations.push({route:routeFor(m,p).id,round:m.round});}
   if(steps%100===0)await new Promise(resolve=>setImmediate(resolve));
  }
  assert(m.ended&&final,'Match did not finish');
  assert.equal(m.errorCount,0,'Match errors were recorded');assert.equal(m.simErrors,0,'Simulation errors were recorded');
  assert.equal(m.dispatcher.errors,0,'Meta handler errors were recorded');assert.equal(audit.violations.length,0,'Native rule audit failed');
  report.outcome={victory:!!final.victory,hiddenReached:!!m.hiddenReached,hiddenCleared:!!m.outcome?.hiddenCleared,reason:m.outcome?.reason||null};
  report.validation={matchErrors:m.errorCount,simErrors:m.simErrors,metaErrors:m.dispatcher.errors,schedulerErrors:sched.errors.length,auditViolations:audit.violations.length};
  report.finalPlayers=m.order.map(p=>({route:routeFor(m,p).id,alive:p.alive,lp:p.lp}));
  report.bondIds=m.gd.bondIds.slice().sort();
  assert.equal(freezeHost(host),before,'Frozen source changed during game');return report;
 }finally{m?.dispose();sched.dispose();}
}

export async function runBenchmark({host,out,seeds=DEFAULT_SEEDS,root=ROOT,onProgress=()=>{}}){
 host=path.resolve(host);assert(out&&Array.isArray(seeds)&&seeds.length>0);out=path.resolve(out);
 assert(!fs.existsSync(out),'Choose a new output file; completed evidence is never overwritten');
 assert.equal(new Set(seeds).size,seeds.length,'Duplicate seeds are not allowed');
 const input=installedHost(host,root),manifest=JSON.parse(fs.readFileSync(path.join(root,'addon-manifest.json')));
 const evaluatorSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
 const {ROUTES,REQUIRED_BONDS}=await importHost(host,'server/match/routeAI/routes.js');
 const result={schema:1,addonVersion:input.version,upstream:{version:input.hostVersion,commit:input.hostCommit},manifestSha256:input.manifestSha256,evaluatorSha256,hostSourceDigest:input.hostDigest,
  mode:'coop',difficulty:'ABYSS',content:'full',players:4,seeds:[...seeds],complete:false,
  scheduling:'Native BOT_ACTION plus seat BOT_STAGGER; in-process deterministic policy execution; not a worker-latency benchmark.',
  conditions:{requiredBonds:[...REQUIRED_BONDS],banSampling:'Native distribution conditioned on declared kept bonds; unchanged native core/addon ban counts.',
   nativeBattleRules:true,noResourceGrants:true,noBalanceOverrides:true,noHumanTraces:true,
   cohort:'Seeds fixed before this evaluation. All outcomes, including failure to enter R15, are retained.'},
  layerCohort:'Raw persistent layers of every native bond, including zero and inactive bonds. Means use routes alive at entry to the corresponding team-cleared boss round; sample counts are explicit. Eliminated or never-entered routes are not zero-imputed.',
  games:[],summary:null};
 const save=()=>{fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');};
 // The first write fixes the cohort even if the process is interrupted before game one completes.
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 for(const seed of seeds){
  const game=await runGame({host,seed,expectedHostDigest:input.hostDigest,onProgress});result.games.push(game);
  result.summary=aggregateGames(result.games,game.bondIds,ROUTES.map(r=>r.id));save();
  onProgress({event:'finished',seed,round14:game.bossRounds.find(r=>r.round===14)?.cleared||false,round15:game.bossRounds.find(r=>r.round===15)?.cleared||false});
 }
 result.complete=true;result.summary=aggregateGames(result.games,result.games[0].bondIds,ROUTES.map(r=>r.id));
 assert.equal(manifest.version,input.version);assert.equal(freezeHost(host),input.hostDigest);
 assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))),evaluatorSha256,'Frozen evaluator changed');save();return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),opts={};
  for(let i=0;i<args.length;i++){const k=args[i];if(!['--host','--out','--seeds'].includes(k)||!args[i+1])throw Error('option');opts[k.slice(2)]=args[++i];}
  if(!opts.host||!opts.out)throw Error('option');
  const seeds=opts.seeds?opts.seeds.split(',').map(Number):DEFAULT_SEEDS;
  await runBenchmark({host:opts.host,out:opts.out,seeds,onProgress:event=>process.stdout.write(JSON.stringify(event)+'\n')});
 }catch{
  // Do not emit errors or stacks containing the caller's machine paths into shareable output.
  process.stderr.write('Benchmark stopped. Check installation, options, and the incomplete output; no failed game was discarded.\n');process.exitCode=1;
 }
}
