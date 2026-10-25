import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateGames,snapshotBonds,DEFAULT_SEEDS} from '../scripts/benchmark.mjs';

test('published cohort is ten predeclared distinct seeds',()=>{
 assert.equal(DEFAULT_SEEDS.length,10);assert.equal(new Set(DEFAULT_SEEDS).size,10);assert.deepEqual([DEFAULT_SEEDS[0],DEFAULT_SEEDS.at(-1)],[111001,111010]);
});
test('clear rates distinguish never entered hidden round and clear-route sample count',()=>{
 const bonds=n=>({main:{layers:n,active:true},off:{layers:0,active:false}});
 const player=(route,n,aliveAtEntry=true)=>({route,bonds:bonds(n),aliveAtEntry});
 const games=[
  {bossRounds:[{round:14,cleared:true,players:[player('a',100),player('b',400,false)]},{round:15,cleared:true,players:[player('a',150)]}]},
  {bossRounds:[{round:14,cleared:false,players:[player('a',900)]}]},
  {bossRounds:[{round:14,cleared:true,players:[player('a',200)]}]},
 ];
 const r=aggregateGames(games,['main','off'],['a','b']);
 assert.equal(r.round14.cleared,2);assert.equal(r.round14.totalGames,3);assert.equal(r.round14.routes.a.samples,2);
 assert.deepEqual(r.round14.routes.a.meanLayers,{main:150,off:0});assert.equal(r.round14.routes.b.samples,0);assert.equal(r.round14.routes.b.meanLayers.main,null);
 assert.equal(r.round15.entered,1);assert.equal(r.round15.clearRateAllGames,1/3);assert.equal(r.round15.clearRateAmongEntered,1);
});
test('bond snapshots include absent inactive and mode-off layer values without reinterpretation of bans',()=>{
 const m={gd:{bondIds:['off','present','absent'],modeInactiveBonds:new Set(['off'])}};
 const p={layers:{off:7,present:20},bondsView:()=>({present:{count:3,active:true}})};
 assert.deepEqual(snapshotBonds(m,p),{absent:{layers:0,count:0,active:false,modeOff:false},off:{layers:7,count:0,active:false,modeOff:true},present:{layers:20,count:3,active:true,modeOff:false}});
});
test('a native overall victory after R14 must not mislabel a failed Hidden Core as an R15 clear',()=>{
 const player={route:'a',aliveAtEntry:true,bonds:{core:{layers:500,active:true}}};
 const games=[{outcome:{victory:true,hiddenReached:true,hiddenCleared:false},bossRounds:[
  {round:14,cleared:true,players:[player]},{round:15,cleared:false,players:[player]},
 ]}];
 const r=aggregateGames(games,['core'],['a']);
 assert.equal(r.round14.cleared,1);assert.equal(r.round15.entered,1);assert.equal(r.round15.cleared,0);
 assert.equal(r.round15.routes.a.samples,0);assert.equal(r.round15.routes.a.meanLayers.core,null);
});
