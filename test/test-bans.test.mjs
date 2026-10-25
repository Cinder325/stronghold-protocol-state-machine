import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
test('test bans preserve native category counts and ordinary native RNG behaviour',{skip:!process.env.SP_HOST_ROOT},async()=>{
 const load=file=>import(pathToFileURL(path.resolve(process.env.SP_HOST_ROOT,file)));
 const [{getData},{GameData},{createRng},{drawDisabledBonds},{selectTestBans},{REQUIRED_BONDS}]=await Promise.all([
  load('server/data.js'),load('server/match/gamedata.js'),load('server/sim/rng.js'),load('server/match/pool.js'),load('server/match/routeAI/testBans.js'),load('server/match/routeAI/routes.js')]);
 // Obtain the exact mode through the host's public mode selection.
 const {modeIdFor}=await load('shared/constants.js');const actual=new GameData(getData({log:{info(){},warn(){},error(){}}}),modeIdFor('coop','ABYSS'));
 const {publicRouteRoom}=await load('server/routeLobby.js'),cfg=publicRouteRoom({mode:'coop',difficulty:'ABYSS'}).routeAI;
 assert.deepEqual(new Set(cfg.requiredBonds),new Set(REQUIRED_BONDS));assert.equal(cfg.banProtection,false);
 for(const id of REQUIRED_BONDS)assert.equal(cfg.availableBonds.find(b=>b.id===id)?.name,actual.bond(id).name,'Displayed ban requirements must match the native bond names');
 for(let seed=1;seed<=32;seed++){
  const a=createRng(seed),b=createRng(seed);assert.deepEqual(selectTestBans(actual,a,{}),drawDisabledBonds(actual,b));assert.equal(a.state(),b.state());
  const c=createRng(seed),d=createRng(seed);assert.deepEqual(selectTestBans(actual,c,{routeAITest:true,routeAIBanProtection:false,routeAIRequiredBonds:REQUIRED_BONDS}),drawDisabledBonds(actual,d));assert.equal(c.state(),d.state());
  const bans=selectTestBans(actual,createRng(seed),{routeAITest:true}),counts=actual.bans(actual.difficulty);
  const legacyRng=createRng(seed),selectedRng=createRng(seed);
  assert.deepEqual(selectTestBans(actual,selectedRng,{routeAITest:true,routeAIBanProtection:true,routeAIRequiredBonds:REQUIRED_BONDS}),selectTestBans(actual,legacyRng,{routeAITest:true}));
  assert.equal(selectedRng.state(),legacyRng.state());
  assert.equal(bans.drawn.filter(id=>actual.bond(id).isCore).length,counts.core);
  assert.equal(bans.drawn.filter(id=>!actual.bond(id).isCore).length,counts.addon);
  assert(!REQUIRED_BONDS.some(id=>bans.drawn.includes(id)));
  const off=new Set([...bans.drawn,...bans.staticOff]);assert.deepEqual(bans.banned,actual.visibleChess.filter(id=>actual.chess(id).bonds.length&&actual.chess(id).bonds.every(bond=>off.has(bond))));
 }
 const impossible=Object.create(actual);impossible.modeInactiveBonds=new Set([...actual.modeInactiveBonds,REQUIRED_BONDS[0]]);
 assert.throws(()=>selectTestBans(impossible,createRng(1),{routeAITest:true}),/unavailable/);
});
test('selected no-ban bonds use native eligibility and category limits without consuming invalid RNG',{skip:!process.env.SP_HOST_ROOT},async()=>{
 const load=file=>import(pathToFileURL(path.resolve(process.env.SP_HOST_ROOT,file)));
 const [{getData},{GameData},{createRng},{drawDisabledBonds},{selectTestBans,nativeBanChoices,validateProtectedBonds},{modeIdFor}]=await Promise.all([
  load('server/data.js'),load('server/match/gamedata.js'),load('server/sim/rng.js'),load('server/match/pool.js'),load('server/match/routeAI/testBans.js'),load('shared/constants.js')]);
 const gd=new GameData(getData({log:{info(){},warn(){},error(){}}}),modeIdFor('coop','ABYSS')),choices=nativeBanChoices(gd);
 assert(choices.length>10);assert(choices.every(b=>gd.bond(b.id).weight>0&&!gd.modeInactiveBonds.has(b.id)&&b.name===gd.bond(b.id).name));
 for(const bad of [null,'kjeragShip',['unknown'],['kjeragShip','kjeragShip'],choices.map(b=>b.id),[3]]){
  const rng=createRng(1),before=rng.state();assert.throws(()=>selectTestBans(gd,rng,{routeAIBanProtection:true,routeAIRequiredBonds:bad}),/Invalid|unavailable|legal/);assert.equal(rng.state(),before);
 }
 const inactive=Object.create(gd);inactive.modeInactiveBonds=new Set([...gd.modeInactiveBonds,'kjeragShip']);
 assert.throws(()=>validateProtectedBonds(inactive,['kjeragShip']),/unavailable/);
 for(let seed=1;seed<=32;seed++){
  const a=createRng(seed),b=createRng(seed);assert.deepEqual(selectTestBans(gd,a,{routeAIBanProtection:true,routeAIRequiredBonds:[]}),drawDisabledBonds(gd,b));assert.equal(a.state(),b.state());
  const bans=selectTestBans(gd,createRng(seed),{routeAIBanProtection:true,routeAIRequiredBonds:['kjeragShip','skillfulShip']});
  assert(!bans.drawn.includes('kjeragShip'));assert(!bans.drawn.includes('skillfulShip'));
  const counts=gd.bans(gd.difficulty);assert.equal(bans.drawn.filter(id=>gd.bond(id).isCore).length,counts.core);assert.equal(bans.drawn.filter(id=>!gd.bond(id).isCore).length,counts.addon);
 }
});
