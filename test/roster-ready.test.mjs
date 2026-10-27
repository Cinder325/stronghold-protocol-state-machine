// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const host=process.env.SP_HOST_ROOT;
async function fixture(){
 const {createRosterGuard69}=await import(pathToFileURL(path.resolve(host,'server/match/routeAI/support/roster-restoration.mjs')));
 const a={uid:1,kind:'chess'},b={uid:2,kind:'chess'},c={uid:3,kind:'chess'};
 let p={board:[a,b],hand:[],temp:[]};
 const guard=createRosterGuard69({observe:()=>({match:{private:p}}),keyOf:u=>u.uid===a.uid});
 return {a,b,c,guard,get:()=>p,set:next=>{p=next;}};
}

test('a withdrawn core retained as a reserve must not block a newer complete roster',{skip:!host},async()=>{
 const f=await fixture(),{a,b,c,guard}=f;
 guard.begin([a,b]);const before=f.get();f.set({board:[b],hand:[a,c],temp:[]});
 guard.observeMove({t:'g.move',uid:a.uid,to:{area:'hand',idx:0}},before,{ok:true});
 assert.deepEqual(guard.status().pending,[a.uid]);
 // A bounded preview deliberately replaces A with C. A remains owned and protected.
 f.set({board:[b,c],hand:[a],temp:[]});guard.begin([b,c]);
 assert.deepEqual(guard.status(),{pending:[],missingSelected:[]});
 assert.equal(guard.canSell(a.uid),false,'Changing the lineup must not release a core sale protection');
 assert.deepEqual(f.get().hand,[a],'Do not discard the reserved core to achieve readiness');
});

test('a body still selected in the current roster continues to block until actually restored',{skip:!host},async()=>{
 const f=await fixture(),{a,b,guard}=f;
 guard.begin([a,b]);const before=f.get();f.set({board:[b],hand:[a],temp:[]});
 guard.observeMove({t:'g.move',uid:a.uid,to:{area:'hand',idx:0}},before,{ok:true});guard.begin([a,b]);
 assert.deepEqual(guard.status(),{pending:[a.uid],missingSelected:[a.uid]});assert.equal(guard.canSell(a.uid),false);
 f.set({board:[a,b],hand:[],temp:[]});assert.deepEqual(guard.status(),{pending:[],missingSelected:[]});
});
