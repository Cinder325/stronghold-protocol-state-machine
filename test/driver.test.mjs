import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Installed-host imports deliberately exercise the same wire validator as the game.
test('teammate worker boundary accepts only native prep intents and clamps pacing',{skip:!process.env.SP_HOST_ROOT},async()=>{
 const {actionAllowed,interval}=await import(pathToFileURL(path.resolve(process.env.SP_HOST_ROOT,'server/match/routeAI/driver.js')));
 assert.equal(actionAllowed({t:'g.buy',slot:0}),true);assert.equal(actionAllowed({t:'g.buy',slot:-1}),false);
 for(const t of ['g.test','g.leave','g.watch','room.setRouteInterval'])assert.equal(actionAllowed({t,on:true}),false);
 assert.equal(interval(-1),0);assert.equal(interval(6000),5000);assert.equal(interval(NaN),0);assert.equal(interval(1200),1200);
});
