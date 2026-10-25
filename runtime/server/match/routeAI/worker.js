// SPDX-License-Identifier: GPL-3.0-or-later
// Detached teammate planner. It never authorizes human actions or writes game state to disk.
import {parentPort,workerData} from 'node:worker_threads';
import {Match} from '../Match.js';
import {VirtualScheduler} from '../scheduler.js';
import {capturePolicyState,hydrateBotState,botOptions,botRng} from './transport.js';
import {runRoute} from './engine.js';
const {buffer,playerId}=workerData,control=new Int32Array(buffer,0,4);
const quiet={info(){},warn(){},error(){}};
const m=new Match({...botOptions(workerData.state),data:workerData.data,scheduler:new VirtualScheduler(),send:()=>true,broadcast(){},onEnd(){},log:quiet});
const ps=m.players.get(playerId);let current=workerData.state;
function rpc(message){
 if(Atomics.load(control,2))throw Error('Teammate job cancelled');
 const seq=Atomics.load(control,0);parentPort.postMessage(message);
 while(Atomics.load(control,0)===seq&&!Atomics.load(control,2))Atomics.wait(control,0,seq,30000);
 if(Atomics.load(control,2))throw Error('Teammate job cancelled');
 return JSON.parse(Buffer.from(buffer,16,Atomics.load(control,1)).toString('utf8'));
}
function hydrate(state){
 current=state;hydrateBotState(m,state,{preservePolicyFor:playerId});m.opts.cashGuard102=true;
 for(const [key,value]of Object.entries(state.rng))m[key]=key==='rngBots'
  ?botRng(value,()=>{const r=rpc({kind:'rng'});current.rng.rngBots=r.state;return r.draw;},()=>current.rng.rngBots)
  :botRng(value);
}
function handle(intent){const r=rpc({kind:'action',intent,policy:capturePolicyState(m,ps)});if(r.state)hydrate(r.state);return r.result;}
hydrate(current);
// Copies used by rehearsals must keep their native methods. Only this AI seat crosses the authority boundary.
const calls={buy:(slot)=>({t:'g.buy',slot}),refresh:()=>({t:'g.refresh'}),freeze:()=>({t:'g.freeze'}),levelUp:()=>({t:'g.levelUp'}),
 sell:uid=>({t:'g.sell',uid}),move:(uid,to,dir)=>({t:'g.move',uid,to,...(dir?{dir}:{})}),equip:(itemUid,targetUid,replaceUid)=>({t:'g.equip',itemUid,targetUid,...(replaceUid!=null?{replaceUid}:{})}),
 useArt:(itemUid,row,col,dir)=>({t:'g.art',itemUid,row,col,dir}),destroy:uid=>({t:'g.destroy',uid}),unequip:itemUid=>({t:'g.unequip',itemUid}),pickReward:idx=>({t:'g.reward',idx}),setReady:ready=>({t:'g.ready',ready}),resolveTemp:()=>({t:'route.resolveTemp'})};
for(const [name,intent]of Object.entries(calls)){
 const native=ps[name];ps[name]=function(...args){return this===ps?handle(intent(...args)):native.apply(this,args);};
}
const pick=m.pickPersonalChoice;m.pickPersonalChoice=function(p,idx,choiceId){return p===ps?handle({t:'g.choice',idx,choiceId}):pick.call(this,p,idx,choiceId);};
try{
 runRoute(m,ps,{observe:()=>({match:{public:m.publicView(),private:ps.privateView()}}),handle});
 parentPort.postMessage({kind:'done',policy:capturePolicyState(m,ps)});
}catch{parentPort.postMessage({kind:'failed'});}
finally{m.dispose();parentPort.close();}
