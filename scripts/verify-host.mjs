#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {installAddon} from './install.mjs';
/** Install into an explicitly supplied test copy; exercise real workers against original PlayerState handlers. */
export async function verifyHost(host){
 host=path.resolve(host);const installation=installAddon({target:host});
 const load=file=>import(pathToFileURL(path.join(host,file)));
 const [{Match},{VirtualScheduler},{getData},{ROUTES,routeFor},{startPrep,cancelBots},transport]=await Promise.all([
  load('server/match/Match.js'),load('server/match/scheduler.js'),load('server/data.js'),
  load('server/match/routeAI/routes.js'),load('server/match/routeAI/driver.js'),load('server/match/routeAI/transport.js')]);
 const sched=new VirtualScheduler(),quiet={info(){},warn(){},error(){}};
 const seats=ROUTES.map((route,seat)=>({seat,playerId:`verify_ai_${seat}`,name:`AI${seat+1}`,isBot:true,botPersona:'unified',connected:true}));
 const m=new Match({mode:'coop',difficulty:'ABYSS',seed:111000,routeAITest:true,routeAIIntervalMs:0,seats,
  data:getData({log:quiet}),scheduler:sched,send:()=>true,broadcast(){},onEnd(){},log:quiet,clientCombat:false,botRehearsalDelegate:false});
 try{
  // This smoke starts at a real first-round prep; the full unskipped match is the benchmark's job.
  m.scheduleBotPrep=()=>{};
  for(const ps of m.order){ps.bandId=routeFor(m,ps).band;ps.lp=m.gd.startLp(ps.bandId);}
  m.startRound(1);m.enterPrep();
  const before=m.rngShop.state();const wire=transport.captureBotState(m);assert.equal(m.rngShop.state(),before);
  assert.equal(transport.botOptions(wire).routeAITest,true);
  for(const ps of m.order)assert.equal(startPrep(m,ps),true);
  const end=Date.now()+120000;
  while(!m.order.every(ps=>ps.ready)&&Date.now()<end){await delay(5);sched.advance(0);if(m.errorCount)break;}
  assert.equal(m.errorCount,0,'Worker policy reported an error');
  assert(m.order.every(ps=>ps.ready),'All four worker policies must reach Ready');
  assert(m.order.every(ps=>ps.board.size>0),'All four routes must deploy an opening');
  assert.equal(new Set(m.order.map(ps=>routeFor(m,ps).id)).size,4);
  const fake={playerId:'human',isBot:false};assert.equal(startPrep(m,fake),false);
  cancelBots(m);return {hostVersion:JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,
   installation:installation.status,workerRoutes:m.order.map(ps=>routeFor(m,ps).id),ready:4,humanSeatRejected:true,errors:m.errorCount};
 }finally{cancelBots(m);m.dispose();sched.dispose();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--host')throw Error('option');console.log(JSON.stringify(await verifyHost(args[1])));}
 catch{console.error('Host verification failed. Use an isolated supported original installation; review local diagnostics before publishing.');process.exitCode=1;}
}
