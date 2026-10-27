// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {setupAddon} from '../scripts/setup.mjs';
function fixture(t){
 const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'addon-setup-')),root=path.join(dir,'addon'),target=path.join(dir,'game with spaces');
 fs.mkdirSync(root);fs.mkdirSync(target);fs.mkdirSync(path.join(root,'runtime'));
 const payload='export const ready=true;\n';fs.writeFileSync(path.join(root,'runtime/route.js'),payload);
 fs.writeFileSync(path.join(root,'addon-manifest.json'),JSON.stringify({schema:1,id:'setup-test',version:'0.1.0',host:{packageName:'stronghold-protocol-alliance',versions:['0.3.1'],checks:[]},files:[{source:'runtime/route.js',target:'server/route.js',sha256:createHash('sha256').update(payload).digest('hex')}],patches:[]}));
 fs.writeFileSync(path.join(target,'package.json'),JSON.stringify({name:'stronghold-protocol-alliance',version:'0.3.1'}));
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(dir)),base);fs.rmSync(dir,{recursive:true,force:true});});
 return {root,target};
}
test('guided setup cancels without mutation and accepts a quoted folder with spaces',async t=>{
 const f=fixture(t),answers=['"'+f.target+'"','n'];
 assert.equal((await setupAddon({root:f.root,ask:async()=>answers.shift(),log(){}})).status,'cancelled');assert(!fs.existsSync(path.join(f.target,'server')));
 const ok=['"'+f.target+'"','y'];assert.equal((await setupAddon({root:f.root,ask:async()=>ok.shift(),log(){}})).status,'installed');
 assert.equal((await setupAddon({...f,ask:async()=>{throw Error('Already installed should not prompt again');},log(){}})).status,'already-installed');
 assert.equal((await setupAddon({...f,action:'uninstall',ask:async()=>'yes',log(){}})).status,'uninstalled');assert(!fs.existsSync(path.join(f.target,'server/route.js')));
});
test('guided setup keeps unknown-host refusal and empty input makes no filesystem changes',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.target,'package.json'),'{"name":"other","version":"99"}');
 await assert.rejects(setupAddon({...f,ask:async()=>'y',log(){}}),/Unsupported host/);assert(!fs.existsSync(path.join(f.target,'server')));
 assert.equal((await setupAddon({ask:async()=>'',log(){}})).status,'cancelled');
});
