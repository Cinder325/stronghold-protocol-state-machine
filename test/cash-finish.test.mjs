// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cashFinish102,passiveCarrier102} from '../runtime/server/match/routeAI/support/cash-finish.js';
import {blockedRecruitmentTool} from '../runtime/server/match/routeAI/support/sargon-cash.js';

const host=process.env.SP_HOST_ROOT;
async function fixture(t){
 const load=file=>import(pathToFileURL(path.resolve(host,file)));
 const [{Match},{VirtualScheduler},{getData},{legalTiles,positionClass}]=await Promise.all([load('server/match/Match.js'),load('server/match/scheduler.js'),load('server/data.js'),load('server/match/board.js')]);
 const quiet={info(){},warn(){},error(){}};
 const m=new Match({roomCode:'TEST',mode:'coop',difficulty:'ABYSS',seed:111000,data:getData({log:quiet}),scheduler:new VirtualScheduler(),
  seats:[{seat:0,playerId:'ai_fixture',name:'AI',isBot:true,connected:true}],send:()=>true,broadcast(){},onEnd(){},log:quiet});
 t.after(()=>m.dispose());m.phase='PREP';m.round=14;
 const p=m.order[0];p.bandId='band_pepe';p.lp=28;p.shop.level=6;
 const chess=name=>m.gd.visibleChess.find(id=>m.gd.chess(id)?.name===name&&!m.gd.isGolden(id));
 for(const name of ['溯光星源','至简','深靛']){
  const id=chess(name);assert(id,`Native fixture operator missing: ${name}`);const u=p.acquireChess(id,{fromPool:false,silent:true});
  const tile=legalTiles(p.deployMap(),positionClass(m.gd.chess(id))).find(([r,c])=>!p.board.has(`${r},${c}`));
  assert(tile);assert.equal(p.move(u.uid,{area:'board',row:tile[0],col:tile[1]},'RIGHT').ok,true);
 }
 for(const name of ['锡人','琳琅诗怀雅','凛御银灰','迷迭香','佩佩','异客','百炼嘉维尔','泡泡','艾丝黛尔']){
  const id=chess(name);assert(id,`Native fixture operator missing: ${name}`);assert(p.acquireChess(id,{fromPool:false,silent:true}));
 }
 const signal=Object.values(m.data.items).find(r=>r.name==='信标'&&!r.isGolden),tool=p.acquireItem(signal.id,{requirePool:false,silent:true});assert(tool);
 assert.equal(p.hand.filter(Boolean).length,10);assert.equal(p.temp.filter(Boolean).length,0);
 p.funds=13;p.round.spent=0;p.round.refreshes=0;p.shop.freeRefreshes=0;
 const gear=Object.values(m.data.items).find(r=>r.kind==='passive'&&r.itemType==='EQUIP'&&r.category==='STAT'&&!r.isGolden&&!r.canGiveBond&&r.price>0&&!r.hideInShop);
 const quote={kind:'item',id:gear.id,basePrice:gear.price,sold:false};p.shop.slots=[quote];p.recompute();
 const before={board:[...p.board].map(([key,u])=>[key,u.uid,u.id]),chess:p.allChess().map(u=>[u.uid,u.id]).sort((a,b)=>a[0]-b[0]),investors:p.bonds.investShip.count};
 const targetFor=(_item,view)=>view.board.find(u=>u?.kind==='chess'&&(u.items?.length||0)<m.gd.equipPerChess)?.uid||null;
 return {m,p,tool,gear,quote,before,targetFor};
}
function preserved(f){
 assert.deepEqual([...f.p.board].map(([key,u])=>[key,u.uid,u.id]),f.before.board);
 assert.deepEqual(f.p.allChess().map(u=>[u.uid,u.id]).sort((a,b)=>a[0]-b[0]),f.before.chess);
 assert.equal(f.p.bonds.investShip.count,f.before.investors);assert.equal(f.p.bonds.investShip.active,true);
 assert.equal(f.p.temp.filter(Boolean).length,0);
}
test('original rules reject item purchases from a full real hand despite free temp slots',{skip:!host},async t=>{
 const f=await fixture(t);assert.equal(f.p.buy(0).error,'HAND_FULL');assert.equal(f.p.funds,13);assert.equal(f.quote.sold,false);preserved(f);
});
test('explicit unusable-tool release creates a native hand slot, equips a useful purchase and preserves the complete roster',{skip:!host},async t=>{
 const f=await fixture(t);
 assert(f.p.bonds.skillfulShip.active&&f.p.bonds.arcaneShip.active);
 const receipt=cashFinish102(f.m,f.p,{minimumChessRoom:1,maxActions:64,targetFor:f.targetFor,
  capacityAction:view=>blockedRecruitmentTool(f.m.gd,view,{canSpendOn:s=>s.kind==='item'&&s.id===f.gear.id,canUseOn:()=>false})});
 assert.equal(f.p.funds,0,JSON.stringify({receipt,shop:f.p.privateView().shop.slots,hand:f.p.privateView().hand.map(i=>i&&[i.uid,i.kind,i.id])}));assert(receipt.actions.every(a=>a.accepted));
 assert.equal(receipt.actions[0].intent.t,'g.destroy');assert.equal(receipt.actions[0].intent.uid,f.tool.uid);
 assert(receipt.actions.some(a=>a.intent.t==='g.buy'&&a.reason==='useful-passive-before-expiry'));
 assert(receipt.actions.some(a=>a.intent.t==='g.equip'));assert(!receipt.actions.some(a=>a.intent.t==='g.sell'));
 assert.equal(f.p.find(f.tool.uid),null);assert([...f.p.board.values()].some(u=>u.items?.some(i=>i.id===f.gear.id)));
 preserved(f);
 // Real prep-end trait: 13 native spent coins yield at least 8 layers of both active attributes.
 const beforeDex=f.p.layers.skillfulShip||0,beforeArcane=f.p.layers.arcaneShip||0;
 f.m.dispatch(f.p,'onPrepEnd',{round:f.m.round});
 assert((f.p.layers.skillfulShip||0)>=beforeDex+8);assert((f.p.layers.arcaneShip||0)>=beforeArcane+8);
 assert.equal(f.m.errorCount,0);assert.equal(f.m.dispatcher.errors,0);
});
test('without explicit safe capacity permission a full protected hand abstains without destroying or selling keys',{skip:!host},async t=>{
 const f=await fixture(t),shopRng=f.m.rngShop.state();
 const receipt=cashFinish102(f.m,f.p,{minimumChessRoom:1,targetFor:f.targetFor});
 assert.equal(receipt.stop,'capacity-abstention-no-key-sale');assert.equal(receipt.actions.length,0);assert.equal(f.p.funds,13);
 assert.equal(f.m.rngShop.state(),shopRng);assert(f.p.find(f.tool.uid));preserved(f);
});
test('a tail action bound never buys an item it cannot immediately equip',{skip:!host},async t=>{
 const f=await fixture(t);
 const receipt=cashFinish102(f.m,f.p,{minimumChessRoom:1,maxActions:2,targetFor:f.targetFor,
  capacityAction:view=>blockedRecruitmentTool(f.m.gd,view,{canSpendOn:s=>s.kind==='item'&&s.id===f.gear.id,canUseOn:()=>false})});
 assert(!receipt.actions.some(a=>a.intent.t==='g.buy'));assert(!f.p.hand.some(i=>i?.kind==='item'&&i.id===f.gear.id));
 assert(f.p.find(f.tool.uid),'Do not discard even an expendable tool when the action bound cannot finish release, purchase and equip');
 assert.equal(f.p.temp.filter(Boolean).length,0);preserved(f);
});
test('recruitment release rejects usable tools, absent projects, zero funds and core equipment',{skip:!host},async t=>{
 const f=await fixture(t),p=f.p.privateView(),positive={canSpendOn:s=>s.kind==='item'&&s.id===f.gear.id,canUseOn:()=>false};
 assert.equal(blockedRecruitmentTool(f.m.gd,p,positive)?.uid,f.tool.uid);
 assert.equal(blockedRecruitmentTool(f.m.gd,p,{...positive,canUseOn:()=>true}),null);
 assert.equal(blockedRecruitmentTool(f.m.gd,{...p,funds:0},positive),null);
 assert.equal(blockedRecruitmentTool(f.m.gd,{...p,shop:{...p.shop,slots:[]}},positive),null);
 const protectedItems=Object.values(f.m.data.items).filter(r=>r.canGiveBond||r.giveBondId==='sargonShip'||/罗盘|博士投影/.test(r.name));
 assert(protectedItems.length>0);
 for(const item of protectedItems){const view={...p,hand:p.hand.map(u=>u?.uid===f.tool.uid?{...u,id:item.id}:u)};assert.equal(blockedRecruitmentTool(f.m.gd,view,positive),null,item.name);}
 preserved(f);
});
test('an incompatible penetration carrier cannot justify discarding the blocked recruitment tool',{skip:!host},async t=>{
 const f=await fixture(t),view=f.p.privateView(),gd=f.m.gd;
 const pen=Object.values(f.m.data.items).find(r=>r.params?.magic_resist_penetrate>0&&!r.isGolden);
 const conversion=Object.values(f.m.data.items).find(r=>r.canGiveBond);
 const arts=view.board.find(u=>gd.chess(u.id).dmgType==='arts');
 const physicalHand=view.hand.find(u=>u?.kind==='chess'&&gd.chess(u.id).dmgType==='phys'&&!/法术伤害/.test(gd.chess(u.id).skill?.desc||''));
 assert(pen&&conversion&&arts&&physicalHand);
 const physical={...physicalHand,row:9,col:2};
 assert.equal(passiveCarrier102(gd,pen,physical),false);
 assert.equal(passiveCarrier102(gd,pen,arts),true);
 assert.equal(passiveCarrier102(gd,pen,{...arts,row:null,col:null}),false);
 assert.equal(passiveCarrier102(gd,pen,{...arts,items:Array.from({length:gd.equipPerChess},(_,i)=>({uid:-i-1,id:f.gear.id}))}),false);
 assert.equal(passiveCarrier102(gd,pen,{...arts,items:[{uid:-1,id:conversion.id}]}),false);
 const blocked={...view,board:[physical],shop:{...view.shop,slots:[{kind:'item',id:pen.id,price:pen.price,sold:false}]}};
 assert.equal(blockedRecruitmentTool(gd,blocked,{canSpendOn:s=>s.id===pen.id&&blocked.board.some(u=>passiveCarrier102(gd,pen,u)),canUseOn:()=>false}),null);
 assert(f.p.find(f.tool.uid));preserved(f);
});
