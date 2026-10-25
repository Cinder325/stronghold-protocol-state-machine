// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ROUTE_BONDS,ROUTE_BAN_MEMORY_KEY,readRouteBonds,rememberRouteBonds,availableRouteBonds,legalRouteBonds} from '../runtime/public/js/routeBanMemory.js';
import {REQUIRED_BONDS} from '../runtime/server/match/routeAI/routes.js';

function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};}
test('first selection covers four routes and does not store or restore an enabled switch',()=>{
 const store=storage();assert.deepEqual([...readRouteBonds(store)].sort(),[...REQUIRED_BONDS].sort());assert.equal(store.values.size,0);
 store.setItem(ROUTE_BAN_MEMORY_KEY,JSON.stringify({on:true,requiredBonds:['kjeragShip','arcaneShip']}));
 assert.deepEqual(readRouteBonds(store),['kjeragShip','arcaneShip']);
 assert.equal(rememberRouteBonds(['sargonShip'],store),true);
 assert.deepEqual(JSON.parse(store.getItem(ROUTE_BAN_MEMORY_KEY)),{requiredBonds:['sargonShip']});
});
test('saved selection survives repeated reads, empty selection, and independent future room defaults',()=>{
 const store=storage();rememberRouteBonds(['kjeragShip','skillfulShip','kjeragShip'],store);
 assert.deepEqual(readRouteBonds(store),['kjeragShip','skillfulShip']);
 const copied=readRouteBonds(store);copied.push('sargonShip');
 assert.deepEqual(readRouteBonds(store),['kjeragShip','skillfulShip']);
 assert.deepEqual(readRouteBonds(storage()),DEFAULT_ROUTE_BONDS);
 assert.deepEqual(readRouteBonds(store),['kjeragShip','skillfulShip']);
 rememberRouteBonds([],store);assert.deepEqual(readRouteBonds(store),[]);
});
test('blocked, corrupt, and unavailable browser storage degrade without erasing saved state',()=>{
 for(const value of ['{',JSON.stringify({requiredBonds:null}),JSON.stringify({requiredBonds:['unexpected private text']})]){
  const store=storage();store.setItem(ROUTE_BAN_MEMORY_KEY,value);assert.deepEqual(readRouteBonds(store),DEFAULT_ROUTE_BONDS);assert.equal(store.getItem(ROUTE_BAN_MEMORY_KEY),value);
 }
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
 assert.deepEqual(readRouteBonds(blocked),DEFAULT_ROUTE_BONDS);assert.equal(rememberRouteBonds(['kjeragShip'],blocked),false);
 assert.deepEqual(readRouteBonds(null),DEFAULT_ROUTE_BONDS);assert.equal(rememberRouteBonds([],null),false);
});
test('ruleset filtering never rewrites memory; capacity respects separate native ban categories',()=>{
 const store=storage();rememberRouteBonds(['kjeragShip','sargonShip','skillfulShip'],store);
 const available=[{id:'kjeragShip',isCore:true},{id:'lateranoShip',isCore:true},{id:'skillfulShip',isCore:false},{id:'arcaneShip',isCore:false}];
 assert.deepEqual(availableRouteBonds(readRouteBonds(store),available),['kjeragShip','skillfulShip']);
 assert.deepEqual(readRouteBonds(store),['kjeragShip','sargonShip','skillfulShip']);
 assert.equal(legalRouteBonds(['kjeragShip','skillfulShip'],available,{core:1,addon:1}),true);
 assert.equal(legalRouteBonds(['kjeragShip','lateranoShip'],available,{core:1,addon:1}),false);
 assert.equal(legalRouteBonds(['skillfulShip','arcaneShip'],available,{core:1,addon:1}),false);
 assert.equal(legalRouteBonds([],available,{core:1,addon:1}),true);
});
