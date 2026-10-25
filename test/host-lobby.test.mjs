// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// SP_HOST_ROOT points to an isolated original host with this addon installed.
test('installed original server validates selection, preserves native seats, and starts a four-bot observer test',{skip:!process.env.SP_HOST_ROOT,timeout:30000},async()=>{
 const hostRoot=path.resolve(process.env.SP_HOST_ROOT),load=name=>import(pathToFileURL(path.join(hostRoot,name)).href);
 const [{startServer},{StubMatch},{TestClient},{validateC2S}]=await Promise.all([load('server/index.js'),load('server/match/StubMatch.js'),load('test/helpers/wsClient.js'),load('shared/protocol.js')]);
 assert.equal(validateC2S({t:'room.addBot',persona:'unified'}),null);
 assert.equal(validateC2S({t:'room.addBot',persona:'unrecognized'})?.startsWith('bad'),true);
 assert.equal(validateC2S({t:'room.setRouteTest',on:true}),null);
 assert.equal(validateC2S({t:'room.setRouteBans',on:true,requiredBonds:['kjeragShip','skillfulShip']}),null);
 assert.equal(validateC2S({t:'room.setRouteBans',on:false}),null);
 assert.notEqual(validateC2S({t:'room.setRouteBans',on:true,requiredBonds:'kjeragShip'}),null);
 assert.equal(validateC2S({t:'room.setRouteInterval',intervalMs:5000}),null);
 assert.notEqual(validateC2S({t:'room.setRouteInterval',intervalMs:5001}),null);
 const started=[],errors=[],clients=[];
 class CaptureMatch extends StubMatch{constructor(opts){super(opts);this.opts=opts;started.push(this);}}
 const log={info(){},warn(){},debug(){},error(...args){errors.push(args.map(String).join(' '));}};
 const server=await startServer({host:'127.0.0.1',port:0,quiet:true,log,MatchClass:CaptureMatch});
 const ok=async(client,msg)=>{const reply=await client.request(msg);assert.equal(reply.t,'ok',JSON.stringify(reply));};
 try{
  const client=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);clients.push(client);
  const welcome=await client.hello('TestHost'),id=welcome.playerId;
  await ok(client,{t:'room.create',mode:'coop',difficulty:'NORMAL'});
  let room=await client.waitFor('room.state',s=>s.hostId===id);
  assert.equal(room.routeAI.banProtection,false);assert.equal(room.routeAI.requiredBonds.length,10);
  assert(room.routeAI.availableBonds.every(b=>typeof b.id==='string'&&typeof b.name==='string'&&typeof b.isCore==='boolean'));
  await ok(client,{t:'room.setRouteBans',on:true,requiredBonds:['kjeragShip','skillfulShip']});
  room=await client.waitFor('room.state',s=>s.routeAI?.banProtection===true);
  const saved=room.routeAI.requiredBonds.slice();assert.deepEqual(new Set(saved),new Set(['kjeragShip','skillfulShip']));
  for(const requiredBonds of [['unknown'],['kjeragShip','kjeragShip'],room.routeAI.availableBonds.map(b=>b.id)]){
   const refused=await client.request({t:'room.setRouteBans',on:true,requiredBonds});assert.notEqual(refused.t,'ok');
  }
  await ok(client,{t:'room.setRouteBans',on:false});room=await client.waitFor('room.state',s=>s.routeAI?.banProtection===false);
  assert.deepEqual(room.routeAI.requiredBonds,saved);
  await ok(client,{t:'room.addBot'});room=await client.waitFor('room.state',s=>s.seats.some(x=>x?.botPersona==='unified'));
  const bot=room.seats.find(s=>s?.isBot);assert.equal(bot.botPersona,'unified');
  await ok(client,{t:'room.addBot',persona:'vanilla'});room=await client.waitFor('room.state',s=>s.seats.filter(x=>x?.isBot).length===2);
  assert.equal(room.seats.filter(s=>s?.botPersona==='vanilla').length,1);
  await ok(client,{t:'room.setRouteInterval',intervalMs:100});
  await ok(client,{t:'room.setRouteTest',on:true});
  room=await client.waitFor('room.state',s=>s.routeAI?.test===true);assert.equal(room.difficulty,'ABYSS');
  await ok(client,{t:'room.start'});room=await client.waitFor('room.state',s=>s.inMatch===true);
  assert.equal(started.length,1);assert.equal(started[0].opts.seats.length,4);assert(started[0].opts.seats.every(s=>s.isBot&&s.botPersona==='unified'));
  assert.deepEqual(started[0].opts.spectators,[id]);assert.equal(started[0].opts.routeAITest,true);assert.equal(started[0].opts.routeAIIntervalMs,100);
  assert.equal(started[0].opts.routeAIBanProtection,false);assert.deepEqual(started[0].opts.routeAIRequiredBonds,saved);
  assert.equal(room.spectators.some(s=>s.playerId===id),true);assert.equal(room.seats.some(s=>s?.playerId===id),false);
  await ok(client,{t:'room.setRouteInterval',intervalMs:0});assert.equal(started[0].opts.routeAIIntervalMs,0);
  started[0].onEndFn({victory:false,reason:'test-fixture'});
  room=await client.waitFor('room.state',s=>s.inMatch===false&&s.seats.some(x=>x?.playerId===id));
  assert.equal(room.spectators.some(s=>s.playerId===id),false);assert.equal(room.hostId,id);assert.equal(room.seats.filter(Boolean).length,3);
  await ok(client,{t:'room.setRouteBans',on:true});room=await client.waitFor('room.state',s=>s.routeAI?.banProtection===true);
  assert.deepEqual(room.routeAI.requiredBonds,saved);
  await ok(client,{t:'room.start'});room=await client.waitFor('room.state',s=>s.inMatch===true);
  assert.equal(started.length,2);assert.equal(started[1].opts.routeAIBanProtection,true);assert.deepEqual(started[1].opts.routeAIRequiredBonds,saved);
  started[1].onEndFn({victory:false,reason:'test-fixture'});
  await client.waitFor('room.state',s=>s.inMatch===false&&s.seats.some(x=>x?.playerId===id));
 }finally{
  await Promise.all(clients.map(c=>c.terminate()));await server.close();
 }
 assert.deepEqual(errors,[]);
});
