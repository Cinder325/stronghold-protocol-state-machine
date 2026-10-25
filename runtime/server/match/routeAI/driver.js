// SPDX-License-Identifier: GPL-3.0-or-later
// A worker thinks; the original match alone executes confirmed, paced teammate actions.
import {Worker} from 'node:worker_threads';
import {validateC2S} from '../../../shared/protocol.js';
import {captureBotState,applyPolicyState} from './transport.js';
import {isUnifiedBot,ensureAssignments} from './routes.js';
const jobs=new WeakMap(),LIMIT=16*1024*1024;
const ALLOWED=new Set(['g.buy','g.refresh','g.freeze','g.levelUp','g.sell','g.move','g.equip','g.art','g.destroy','g.unequip','g.reward','g.choice','g.ready']);
export const interval=ms=>Math.round(Math.max(0,Math.min(5000,Number(ms)||0)));
export function actionAllowed(intent){return !!intent&&ALLOWED.has(intent.t)&&!validateC2S(intent);}
function live(job){const {m,ps}=job;return !job.closed&&!m.disposed&&!m.ended&&m.round===job.round&&m.phase==='PREP'&&ps.alive&&!ps.ready&&isUnifiedBot(m,ps);}
function reply(job,value){
 const bytes=Buffer.from(JSON.stringify(value));
 if(bytes.length>LIMIT){stop(job);job.m.reportError('route AI',Error('AI feedback exceeded the transport limit'));return;}
 new Uint8Array(job.buffer,16,bytes.length).set(bytes);Atomics.store(job.control,1,bytes.length);Atomics.add(job.control,0,1);Atomics.notify(job.control,0);
}
function stop(job,completed=false){
 if(job.closed)return;job.closed=true;if(job.timer!=null)job.m.sched.clearTimeout(job.timer);
 Atomics.store(job.control,2,1);Atomics.notify(job.control,0);
 // Let an RPC wait unwind normally. Immediate termination during another worker's
 // module compilation can crash older Node 22 builds on Windows.
 if(!completed){const timer=globalThis.setTimeout(()=>void job.worker.terminate(),5000);timer.unref();job.worker.once('exit',()=>globalThis.clearTimeout(timer));}
 const active=jobs.get(job.m);if(active?.get(job.ps.playerId)===job)active.delete(job.ps.playerId);
}
function dispatch(job,message){
 if(!live(job)){stop(job);return;}
 const {m,ps}=job;
 if(message.kind==='rng'){reply(job,{draw:m.rngBots(),state:m.rngBots.state()});return;}
 if(message.kind!=='action'){stop(job);return;}
 const valid=message.intent?.t==='route.resolveTemp'||actionAllowed(message.intent);
 if(!valid){reply(job,{result:{error:'BAD_MSG'},state:captureBotState(m)});return;}
 job.pending=message;
 const execute=()=>{
  job.timer=null;if(!live(job)){stop(job);return;}
  const pending=job.pending;job.pending=null;let result;
  try{
   applyPolicyState(m,ps,pending.policy);
   if(pending.intent.t==='route.resolveTemp'){ps.resolveTemp();result={ok:true};}
   else result=m._handle(ps,pending.intent)||{ok:true};
   job.last=m.sched.now();m.flush();
  }catch{result={error:'INTERNAL'};m.reportError('route AI action',Error('AI teammate action failed'));}
  reply(job,{result,state:captureBotState(m)});
 };
 job.execute=execute;const due=job.last+interval(m.opts.routeAIIntervalMs)-m.sched.now();
 job.timer=m.sched.setTimeout(execute,Math.max(0,due));
}
export function startPrep(m,ps,i=0){
 if(!isUnifiedBot(m,ps))return false;
 ensureAssignments(m);let active=jobs.get(m);if(!active){active=new Map();jobs.set(m,active);}
 if(active.has(ps.playerId))stop(active.get(ps.playerId));
 const buffer=new SharedArrayBuffer(LIMIT+16),control=new Int32Array(buffer,0,4);
 const worker=new Worker(new URL('./worker.js',import.meta.url),{execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type')),workerData:{buffer,state:captureBotState(m),data:m.data,playerId:ps.playerId}});worker.unref();
 const job={m,ps,worker,buffer,control,round:m.round,closed:false,timer:null,pending:null,last:m.sched.now()+i*30};active.set(ps.playerId,job);
 worker.on('message',message=>{
  if(message.kind==='done'){
   if(!job.closed&&!m.ended&&!m.disposed&&m.round===job.round&&isUnifiedBot(m,ps))applyPolicyState(m,ps,message.policy);
   stop(job,true);return;
  }
  if(message.kind==='failed'){if(live(job))m.reportError('route AI worker',Error('AI teammate policy failed'));stop(job,true);return;}
  dispatch(job,message);
 });
 worker.on('error',()=>{if(live(job))m.reportError('route AI worker',Error('AI teammate worker failed'));stop(job);});
 worker.on('exit',code=>{if(!job.closed){if(code&&live(job))m.reportError('route AI worker',Error('AI teammate worker exited'));stop(job);}});
 return true;
}
export function setInterval(m,ms){
 m.opts.routeAIIntervalMs=interval(ms);
 for(const job of jobs.get(m)?.values()||[]){if(job.pending&&job.timer!=null){m.sched.clearTimeout(job.timer);job.timer=m.sched.setTimeout(job.execute,Math.max(0,job.last+m.opts.routeAIIntervalMs-m.sched.now()));}}
 return m.opts.routeAIIntervalMs;
}
export function cancelBots(m){for(const job of [...(jobs.get(m)?.values()||[])])stop(job);}
