// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
const host=process.env.SP_HOST_ROOT;
for(const maxSteps of [1,0])test(`native overflow refill and queued reward complete with main action bound ${maxSteps}`,{skip:!host},async t=>{
 const load=file=>import(pathToFileURL(path.resolve(host,file)));
 const [{Match},{VirtualScheduler},{getData},{legalTiles,positionClass},{runSargonPrep58,DEFAULT_SARGON58,selectRoster58}]=await Promise.all([
  load('server/match/Match.js'),load('server/match/scheduler.js'),load('server/data.js'),load('server/match/board.js'),load('server/match/routeAI/policies/sargon.mjs')]);
 const log={info(){},warn(){},error(){}},m=new Match({mode:'coop',difficulty:'ABYSS',routeAITest:true,seed:111013,data:getData({log}),scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'reward_fixture',name:'AI',isBot:true}],send:()=>true,broadcast(){},onEnd(){},log});
 t.after(()=>m.dispose());m.phase='PREP';m.round=1;
 const ps=m.order[0],gd=m.gd;ps.bandId='band_pepe';ps.lp=28;ps.shop.slots=[];ps.funds=0;
 const cores=Object.values(m.data.chess).filter(r=>r.isGolden&&!r.isDiy&&r.bonds.includes('sargonShip')&&gd.chess(r.chessId)).slice(0,8);assert.equal(cores.length,8);
 for(const r of cores){const u=ps.acquireChess(r.chessId,{fromPool:false,silent:true});assert(u,r.chessId);const tile=legalTiles(ps.deployMap(),positionClass(r)).find(([row,col])=>!ps.board.has(`${row},${col}`));assert(tile);assert(ps.move(u.uid,{area:'board',row:tile[0],col:tile[1]},'RIGHT').ok);}
 const coreUids=new Set(ps.allChess().map(u=>u.uid));
 const coin=Object.values(m.data.items).find(r=>r.isGolden&&r.name==='盟约之币');assert(coin);
 for(let n=0;n<8;n++)assert(ps.acquireItem(coin.id,{requirePool:false,silent:true}));
 const surplus=gd.visibleChess.map(id=>gd.chess(id)).filter(r=>r&&!r.isGolden&&r.tier===1&&!r.isDiy&&r.attackKind!=='heal'&&!r.bonds.includes('sargonShip')&&!r.bonds.includes('investShip'))[0];assert(surplus);
 for(let n=0;n<2;n++)assert(ps.acquireChess(surplus.chessId,{fromPool:false,silent:true}));
 assert(ps.acquireItem(coin.id,{requirePool:false,silent:true}));
 assert.equal(ps.hand.filter(Boolean).length,ps.hand.length);assert.equal(ps.temp.filter(Boolean).length,1);
 assert(selectRoster58(gd,ps.privateView()).every(u=>coreUids.has(u.uid)),'Fixture board is already the intended roster');
 ps.offers.push({source:'merge',tier:6,slots:[{kind:'item',id:coin.id,price:0,sold:false}]});
 const actions=[],observe=()=>({match:{private:ps.privateView(),public:m.publicView()}});
 const result=runSargonPrep58(m,ps,{observe,policy:{...DEFAULT_SARGON58,maxSteps},handle:intent=>{const before={hand:ps.hand.filter(Boolean).length,temp:ps.temp.filter(Boolean).length};const response=m._handle(ps,intent);actions.push({intent,response,before,after:{hand:ps.hand.filter(Boolean).length,temp:ps.temp.filter(Boolean).length}});return response;}});
 assert(actions.some(a=>a.intent.t==='g.sell'&&a.after.hand===ps.hand.length&&a.after.temp<a.before.temp),'Native sale really refills from overflow');
 assert.equal(result.completion.ready,true);assert.equal(ps.ready,true);assert.equal(ps.offers.length,0);assert.equal(ps.temp.filter(Boolean).length,0);
 assert(!actions.some(a=>a.response?.error),'No speculative HAND_FULL reward action');
 assert(!actions.some(a=>a.intent.t==='g.sell'&&coreUids.has(a.intent.uid)),'Never sell a core to force readiness');
 assert.equal(m.errorCount,0);assert.equal(m.dispatcher.errors,0);
});

test('a full board and hand can replace an unselected high-ground body with a melee core using a protected buffer',{skip:!host},async t=>{
 const load=file=>import(pathToFileURL(path.resolve(host,file)));
 const [{Match},{VirtualScheduler},{getData},{legalTiles,positionClass},{runSargonPrep58,DEFAULT_SARGON58,selectRoster58}]=await Promise.all([
  load('server/match/Match.js'),load('server/match/scheduler.js'),load('server/data.js'),load('server/match/board.js'),load('server/match/routeAI/policies/sargon.mjs')]);
 const log={info(){},warn(){},error(){}},m=new Match({mode:'coop',difficulty:'ABYSS',routeAITest:true,seed:111018,data:getData({log}),scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'buffer_fixture',name:'AI',isBot:true}],send:()=>true,broadcast(){},onEnd(){},log});
 t.after(()=>m.dispose());m.phase='PREP';m.round=1;const ps=m.order[0],gd=m.gd;ps.bandId='band_pepe';ps.lp=28;ps.shop.slots=[];ps.funds=0;
 const coreRecords=Object.values(m.data.chess).filter(r=>r.isGolden&&!r.isDiy&&r.bonds.includes('sargonShip')&&r.baseId!=='chess_char_6_06_a'&&gd.chess(r.chessId)).slice(0,7);assert.equal(coreRecords.length,7);
 const deploy=r=>{const u=ps.acquireChess(r.chessId,{fromPool:false,silent:true});assert(u);const tile=legalTiles(ps.deployMap(),positionClass(r)).find(([row,col])=>!ps.board.has(`${row},${col}`));assert(tile);assert(ps.move(u.uid,{area:'board',row:tile[0],col:tile[1]},'RIGHT').ok);return u;};
 for(const r of coreRecords)deploy(r);
 const bridge=gd.visibleChess.map(id=>gd.chess(id)).find(r=>r&&!r.isGolden&&r.tier<=2&&r.position==='RANGED'&&r.attackKind!=='heal'&&!r.bonds.includes('sargonShip')&&!r.bonds.includes('investShip'));assert(bridge);
 const old=deploy(bridge),incoming=ps.acquireChess('chess_char_6_06_a',{fromPool:false,silent:true});assert(incoming);assert.equal(ps._legal(incoming,...ps.find(old.uid).key.split(',').map(Number)),false,'Different deployment classes require a genuine buffer');
 const keys=new Set(ps.allChess().filter(u=>u.uid!==old.uid).map(u=>u.uid));
 const coin=Object.values(m.data.items).find(r=>r.isGolden&&r.name==='盟约之币');assert(coin);for(let n=0;n<7;n++)assert(ps.acquireItem(coin.id,{requirePool:false,silent:true}));
 const spare=gd.visibleChess.map(id=>gd.chess(id)).find(r=>r&&r.chessId!==bridge.chessId&&!r.isGolden&&r.tier===1&&!r.isDiy&&r.attackKind!=='heal'&&!r.bonds.includes('sargonShip')&&!r.bonds.includes('investShip'));assert(spare);for(let n=0;n<2;n++)assert(ps.acquireChess(spare.chessId,{fromPool:false,silent:true}));
 assert.equal(ps.hand.filter(Boolean).length,ps.hand.length);assert.equal(ps.board.size,ps.deployCap);
 const chosen=selectRoster58(gd,ps.privateView());assert(chosen.some(u=>u.uid===incoming.uid));assert(!chosen.some(u=>u.uid===old.uid));
 const actions=[],result=runSargonPrep58(m,ps,{observe:()=>({match:{private:ps.privateView(),public:m.publicView()}}),policy:{...DEFAULT_SARGON58,maxSteps:0},handle:intent=>{const response=m._handle(ps,intent);actions.push({intent,response});return response;}});
 assert.equal(result.completion.ready,true);assert.equal(ps.ready,true);assert(ps.find(incoming.uid)?.area==='board');assert(ps.find(old.uid),'Preserve the outgoing reserve instead of deleting it');
 assert(actions.some(a=>a.intent.t==='g.sell'));assert(!actions.some(a=>a.intent.t==='g.sell'&&keys.has(a.intent.uid)));assert(!actions.some(a=>a.response?.error));
 assert.deepEqual(result.completion.restoration,{pending:[],missingSelected:[]});assert.equal(m.errorCount,0);assert.equal(m.dispatcher.errors,0);
});
