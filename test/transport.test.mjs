import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureBotState,hydrateBotState,botOptions,capturePolicyState,applyPolicyState,botRng} from '../runtime/server/match/routeAI/transport.js';
function fixture(){
 const m={opts:{roomCode:'TEST',mode:'coop',difficulty:'ABYSS',seed:7,seats:[{seat:0,playerId:'bot',isBot:true},{seat:1,playerId:'human',isBot:false}],routeAITest:true,routeAIIntervalMs:100},players:new Map(),pool:{entries:new Map([['card',{left:6}]]),banned:new Set()},itemPool:{debt:new Map()},stageId:'stage',gd:{stage:id=>({id})},sched:{t:3,now(){return this.t;}},phase:'PREP',round:1,uidSeq:2};
 const make=(playerId,isBot)=>({m,playerId,isBot,hand:[null,null],temp:[null],board:new Map(),funds:3,counters:{},stats:{},shop:{level:1},layers:{},bonds:{},diyStock:{entries:new Map()},_tempDue:new Map()});
 const bot=make('bot',true),human=make('human',false),piece={uid:1,id:'card',kind:'chess'};bot.hand[1]=piece;bot._botFocusId='kjeragShip';bot._botFocus={select(){}};bot._routeAIPlan={route:'kjerag'};
 m.order=[bot,human];for(const ps of m.order)m.players.set(ps.playerId,ps);
 for(const k of ['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta'])m[k]=botRng(3);
 return {m,bot,human,piece};
}
test('snapshot is JSON-safe and feedback preserves native containers, UID identity and moved aliases',()=>{
 const a=fixture(),b=fixture(),before=a.m.rngShop.state(),wire=JSON.parse(JSON.stringify(captureBotState(a.m)));
 assert.equal(a.m.rngShop.state(),before);assert.equal(botOptions(wire).routeAIIntervalMs,100);hydrateBotState(b.m,wire,{preservePolicyFor:'bot'});
 const hand=b.bot.hand,piece=hand[1],board=b.bot.board;a.bot.hand[1]=null;a.bot.board.set('9,2',a.piece);a.piece.dir='LEFT';
 hydrateBotState(b.m,JSON.parse(JSON.stringify(captureBotState(a.m))),{preservePolicyFor:'bot'});
 assert.equal(b.bot.hand,hand);assert.equal(b.bot.board,board);assert.equal(b.bot.board.get('9,2'),piece);assert.equal(piece.dir,'LEFT');assert.equal(b.bot.hand[1],null);
 a.bot.hand=[null,a.piece];a.bot.board.clear();hydrateBotState(b.m,captureBotState(a.m),{preservePolicyFor:'bot'});assert.notEqual(b.bot.hand,hand);assert.equal(b.bot.hand[1],piece);
});
test('policy capture cannot target humans and preserves a teammate commitment across authority feedback',()=>{
 const a=fixture(),b=fixture();assert.throws(()=>capturePolicyState(a.m,a.human),/AI teammate/);assert.throws(()=>applyPolicyState(a.m,a.human,{}),/AI teammate/);assert.throws(()=>hydrateBotState(b.m,captureBotState(a.m),{preservePolicyFor:'human'}),/AI teammate/);
 hydrateBotState(b.m,captureBotState(a.m),{preservePolicyFor:'bot'});b.bot._botFocusId='sargonShip';hydrateBotState(b.m,captureBotState(a.m),{preservePolicyFor:'bot'});assert.equal(b.bot._botFocusId,'sargonShip');
 b.bot._botRoute={id:'route'};applyPolicyState(a.m,a.bot,capturePolicyState(b.m,b.bot));assert.equal(a.bot._botFocusId,'sargonShip');assert.deepEqual(a.bot._botRoute,{id:'route'});assert.equal(a.bot._botFocus,undefined);
});
test('transport omits host credentials, callbacks and function caches while retaining rule counters',()=>{
 const a=fixture();a.m.opts.token='do-not-copy';a.m.opts.scheduler=a.m.sched;a.bot.counters['band:pepe:special']=1;a.bot._routeAIWorker={postMessage(){}};
 const wire=captureBotState(a.m),options=botOptions(wire);assert(!Object.hasOwn(options,'token'));assert(!Object.hasOwn(options,'scheduler'));const b=fixture();hydrateBotState(b.m,wire);assert.equal(b.bot.counters['band:pepe:special'],1);assert.equal(b.bot._routeAIWorker,undefined);
});
test('bot RNG helpers preserve exact native draw order and independent zero-state clones',()=>{
 const a=botRng(0),b=a.clone();assert.equal(b.state(),0);assert.equal(a(),b());assert.equal(a.int(9),b.int(9));assert.equal(a.pick([1,2,3]),b.pick([1,2,3]));assert.deepEqual(a.shuffle([1,2,3,4]),b.shuffle([1,2,3,4]));assert.equal(a.weighted([1,2,3],n=>n),b.weighted([1,2,3],n=>n));assert.equal(a.state(),b.state());
 let state=3,draws=0;const remote=botRng(3,()=>{draws++;return 0.25;},()=>state);assert.equal(remote.int(8),2);state=4;assert.equal(remote.state(),4);assert.equal(draws,1);
});
test('clean host native state and prototypes round-trip', {skip:!process.env.SP_HOST_ROOT},async t=>{
 const load=file=>import(pathToFileURL(path.resolve(process.env.SP_HOST_ROOT,file))),[{getData},{Match},{VirtualScheduler},{createRng}]=await Promise.all([load('server/data.js'),load('server/match/Match.js'),load('server/match/scheduler.js'),load('server/sim/rng.js')]);
 const opts={data:getData({log:{info(){},warn(){},error(){}}}),roomCode:'TEST',mode:'coop',difficulty:'ABYSS',seed:7,seats:[{seat:0,playerId:'bot',name:'AI',isBot:true,connected:true},{seat:1,playerId:'human',name:'Player',isBot:false,connected:true}],scheduler:new VirtualScheduler(),send:()=>true,broadcast(){},onEnd(){},log:{info(){},warn(){},error(){}}};
 const a=new Match(opts),wire=JSON.parse(JSON.stringify(captureBotState(a))),b=new Match({...botOptions(wire),data:opts.data,scheduler:new VirtualScheduler(),send:()=>true,broadcast(){},onEnd(){},log:opts.log});t.after(()=>{a.dispose();b.dispose();});hydrateBotState(b,wire,{preservePolicyFor:'bot'});
 assert.deepEqual(b.players.get('bot').privateView(),a.players.get('bot').privateView());assert.equal(typeof b.players.get('bot').diyStock.take,'function');assert.equal(Object.getPrototypeOf(b.players.get('bot').diyStock),Object.getPrototypeOf(a.players.get('bot').diyStock));
 const native=createRng(42),copy=botRng(native.state());for(let i=0;i<12;i++)assert.equal(native(),copy());
});
