// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildHostPatches} from '../scripts/host-patches.mjs';

// Exercise the addon-owned lobby boundary without importing or vendoring the game's server.
const banHelpers=fs.readFileSync(new URL('../runtime/server/match/routeAI/testBans.js',import.meta.url),'utf8')
 .slice(fs.readFileSync(new URL('../runtime/server/match/routeAI/testBans.js',import.meta.url),'utf8').indexOf('/** Only bonds'))
 .split('/** Conditional native draw')[0].replaceAll('export function','function');
const source=fs.readFileSync(new URL('../runtime/server/routeLobby.js',import.meta.url),'utf8')
 .replace("import {ERR,MAX_SPECTATORS,modeIdFor} from '../shared/constants.js';","const ERR=Object.fromEntries(['NOT_IN_ROOM','NOT_HOST','ROOM_STARTED','BAD_TARGET','BAD_MSG','ROOM_FULL'].map(x=>[x,x])); const MAX_SPECTATORS=2;const modeIdFor=(mode,difficulty)=>difficulty;")
 .replace("import {getData} from './data.js';","const getData=()=>({});")
 .replace("import {GameData} from './match/gamedata.js';",`class GameData{constructor(data,difficulty){this.difficulty=difficulty;this.bondIds=[...ROUTE_REQUIREMENTS,'freeCore1','freeCore2','freeCore3','freeAddon1','freeAddon2','freeAddon3','freeAddon4'];this.modeInactiveBonds=new Set();}bond(id){return this.bondIds.includes(id)?{name:id,weight:1,isCore:ROUTE_REQUIREMENTS.slice(0,4).includes(id)||id.startsWith('freeCore')}:null;}bans(){return {core:3,addon:4};}}`)
 .replace("import {nativeBanChoices,validateProtectedBonds} from './match/routeAI/testBans.js';",banHelpers)
 .replace("import {setInterval as setRouteIntervalRuntime} from './match/routeAI/index.js';","const setRouteIntervalRuntime=(m,ms)=>{m.opts.routeAIIntervalMs=ms;};");
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(){
 const session={playerId:'host',name:'Host',connected:true},host={seat:0,...session,isBot:false,ready:false};
 const room={mode:'coop',difficulty:'NORMAL',hostId:'host',seats:[host,null,null,null],spectators:[],match:null,modded:false,
  freeSeat(){return this.seats.indexOf(null);},seatOf(id){return this.seats.find(s=>s?.playerId===id)||null;},spectatorOf(id){return this.spectators.find(s=>s.playerId===id)||null;},activeHumans(){return this.seats.filter(s=>s&&!s.isBot&&!s.left);}};
 const lobby={roomOf:()=>room,dataFor:()=>({}),broadcasts:0,broadcastState(){this.broadcasts++;},dropReplay(){},addBot(){return {ok:true,native:true};}};
 return {session,host,room,lobby};
}
test('teammate selection defaults to unified, numbers companions, and keeps native AI authorization native',()=>{
 const {lobby,room,session}=fixture();
 assert.equal(api.addRouteBot(lobby,{playerId:'guest'},{}).error,'NOT_HOST');
 assert.deepEqual(room.seats.slice(1),[null,null,null]);
 assert.equal(api.addRouteBot(lobby,session,{}).ok,true);
 assert.equal(room.seats[1].name,'协同AI');
 assert.equal(api.addRouteBot(lobby,session,{}).ok,true);
 assert.deepEqual(room.seats.slice(1,3).map(s=>s.name),['协同AI1','协同AI2']);
 assert(room.seats.slice(1,3).every(s=>s.isBot&&s.botPersona==='unified'&&s.playerId.startsWith('ai_')));
 assert.deepEqual(api.addRouteBot(lobby,session,{persona:'vanilla'}),{ok:true,native:true});
 assert.equal(api.addRouteBot(lobby,session,{persona:'unknown'}).error,'BAD_MSG');
 room.version='other-period';assert.equal(api.addRouteBot(lobby,session,{}).error,'BAD_TARGET');
 assert.equal(api.addRouteBot(lobby,session,{persona:'vanilla'}).native,true);
});
test('four-AI test uses native observer seats and restores original seats after completion or a failed start',()=>{
 const {lobby,room,session,host}=fixture(),before=room.seats.slice();
 assert.equal(api.setRouteTest(lobby,session,{on:true}).ok,true);assert.equal(room.difficulty,'ABYSS');
 assert.equal(api.adaptTestRoom(lobby,room,session).ok,true);
 assert.equal(room.seats.length,4);assert(room.seats.every(s=>s.isBot&&s.botPersona==='unified'));
 assert.equal(new Set(room.seats.map(s=>s.playerId)).size,4);
 assert.equal(room.spectatorOf(host.playerId).playerId,host.playerId);
 assert.deepEqual(room.seats.map(s=>s.name),['协同AI1','协同AI2','协同AI3','协同AI4']);
 room.spectatorOf(host.playerId).connected=false;
 api.restoreRouteHost(lobby,room);
 assert.deepEqual(room.seats,before);assert.equal(room.spectators.length,0);assert.equal(host.connected,false);
 api.restoreRouteHost(lobby,room);assert.deepEqual(room.seats,before);
 room.seats[1]={seat:1,playerId:'guest',isBot:false};
 assert.equal(api.adaptTestRoom(lobby,room,session).error,'BAD_TARGET');assert.equal(room.seats[0],host);
});
test('test configuration rejects human replacement, full spectators, invalid speed and gameplay changes',()=>{
 const {lobby,room,session}=fixture();
 for(const ms of [-1,5001,1.5,NaN,'100'])assert.equal(api.setRouteInterval(lobby,session,{intervalMs:ms}).error,'BAD_MSG');
 room.match={opts:{}};
 assert.equal(api.setRouteInterval(lobby,session,{intervalMs:5000}).ok,true);assert.equal(room.match.opts.routeAIIntervalMs,5000);
 assert.equal(api.setRouteTest(lobby,session,{on:true}).error,'ROOM_STARTED');
 room.match=null;room.seats[1]={playerId:'guest',isBot:false};assert.equal(api.setRouteTest(lobby,session,{on:true}).error,'BAD_TARGET');
 room.seats[1]=null;api.setRouteTest(lobby,session,{on:true});room.spectators=[{playerId:'watch1'},{playerId:'watch2'}];
 assert.equal(api.adaptTestRoom(lobby,room,session).error,'ROOM_FULL');assert.equal(room.seats[0].playerId,'host');
 room.spectators=[];room.modded=true;assert.equal(api.adaptTestRoom(lobby,room,session).error,'BAD_TARGET');
});
test('no-ban protection defaults off independently of four-AI mode and toggling off preserves selection',()=>{
 const {lobby,room,session}=fixture();
 let cfg=api.publicRouteRoom(room).routeAI;
 assert.equal(cfg.banProtection,false);assert.deepEqual(cfg.requiredBonds,api.ROUTE_REQUIREMENTS);
 assert(cfg.availableBonds.every(b=>typeof b.name==='string'&&typeof b.isCore==='boolean'));
 assert.deepEqual(cfg.banCounts,{core:3,addon:4});
 api.setRouteTest(lobby,session,{on:true});
 assert.equal(api.routeMatchOptions(room).routeAIBanProtection,false);
 assert.equal(api.setRouteBans(lobby,session,{on:true,requiredBonds:['kjeragShip','skillfulShip']}).ok,true);
 assert.equal(api.setRouteBans(lobby,session,{on:false}).ok,true);
 cfg=api.publicRouteRoom(room).routeAI;
 assert.equal(cfg.banProtection,false);assert.deepEqual(cfg.requiredBonds,['kjeragShip','skillfulShip']);
 assert.deepEqual(api.routeMatchOptions(room).routeAIRequiredBonds,cfg.requiredBonds);
 assert.equal(api.setRouteBans(lobby,session,{on:true}).ok,true);
 assert.equal(api.routeMatchOptions(room).routeAIBanProtection,true);
 assert.equal(api.setRouteBans(lobby,session,{on:true,requiredBonds:[]}).ok,true);
 assert.deepEqual(api.publicRouteRoom(room).routeAI.requiredBonds,[]);
 // A stricter difficulty can invalidate an earlier selection; disabling still
 // succeeds and preserves it, while re-enabling must be validated again.
 room.routeAIRequiredBonds=cfg.availableBonds.map(b=>b.id);room.routeAIBanProtection=true;
 assert.equal(api.setRouteBans(lobby,session,{on:false}).ok,true);
 assert.deepEqual(room.routeAIRequiredBonds,cfg.availableBonds.map(b=>b.id));
 assert.equal(api.setRouteBans(lobby,session,{on:true}).error,'BAD_MSG');
});
test('no-ban configuration rejects malformed, impossible and unauthorized changes atomically',()=>{
 const {lobby,room,session}=fixture();
 assert.equal(api.setRouteBans(lobby,session,{on:true,requiredBonds:['kjeragShip']}).ok,true);
 const before=api.publicRouteRoom(room).routeAI,broadcasts=lobby.broadcasts;
 for(const selected of [null,'kjeragShip',['unknown'],['kjeragShip','kjeragShip'],[2],Array(65).fill('kjeragShip'),before.availableBonds.map(b=>b.id)]){
  assert.equal(api.setRouteBans(lobby,session,{on:true,requiredBonds:selected}).error,'BAD_MSG');
  assert.deepEqual(api.publicRouteRoom(room).routeAI,before);assert.equal(lobby.broadcasts,broadcasts);
 }
 assert.equal(api.setRouteBans(lobby,{playerId:'guest'},{on:false}).error,'NOT_HOST');
 for(const changes of [{version:'other-period'},{modded:true},{mode:'solo'}]){
  const original={version:room.version,modded:room.modded,mode:room.mode};Object.assign(room,changes);
  assert.equal(api.adaptTestRoom(lobby,room,session).error,'BAD_TARGET');Object.assign(room,original);
 }
 room.match={};assert.equal(api.setRouteBans(lobby,session,{on:false}).error,'ROOM_STARTED');
 room.match=null;room.modded=true;assert.equal(api.setRouteBans(lobby,session,{on:false}).error,'BAD_TARGET');
});
test('every original host integration anchor is unique and no human-control method is patched',{skip:!process.env.SP_UPSTREAM_ROOT},()=>{
 const patches=buildHostPatches(process.env.SP_UPSTREAM_ROOT);
 assert.equal(new Set(patches.map(p=>p.target)).size,patches.length);
 assert(patches.some(p=>p.target==='server/lobby.js'));
 assert(!patches.some(p=>p.target.includes('intents')));
 assert(!patches.flatMap(p=>p.replacements).some(p=>/g\.autoplay|setAutoplay/.test(p.replace)));
});
