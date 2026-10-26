// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installAddon,uninstallAddon} from '../scripts/install.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const put=(root,name,bytes)=>{const file=path.join(root,...name.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
const read=(root,name)=>fs.readFileSync(path.join(root,...name.split('/')),'utf8');
function fixture(t){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'route-ai-install-')),root=path.join(temp,'release'),target=path.join(temp,'host');
  fs.mkdirSync(root);fs.mkdirSync(target);
  const original='export const bots = ["legacy"];\n',payload='export const run = () => true;\n';
  put(target,'package.json',JSON.stringify({name:'stronghold-protocol-alliance',version:'0.3.1'}));put(target,'server/lobby.js',original);
  put(target,'data/keep.json','{"native":true}\n');put(target,'public/assets/keep.bin','art');put(target,'node_modules/keep.txt','dependency');put(root,'runtime/route.mjs',payload);
  const manifest={schema:1,id:'stronghold-state-machine',version:'0.1.0',host:{packageName:'stronghold-protocol-alliance',versions:['0.3.1'],checks:[]},files:[{source:'runtime/route.mjs',target:'server/match/routeAI/runtime.mjs',sha256:sha(payload)}],patches:[{target:'server/lobby.js',sha256:[sha(original)],replacements:[{find:'["legacy"]',replace:'["route-ai", "legacy"]'}]}]};
  const save=()=>put(root,'addon-manifest.json',JSON.stringify(manifest,null,2)+'\n');save();
  t.after(()=>{const resolved=fs.realpathSync(temp),expected=path.resolve(os.tmpdir())+path.sep;if(!resolved.startsWith(expected)||!path.basename(resolved).startsWith('route-ai-install-'))throw Error('Temporary test path escaped cleanup boundary.');fs.rmSync(resolved,{recursive:true,force:true});});
  return {temp,root,target,original,payload,manifest,save};
}

test('dry run validates without writing; install is idempotent; uninstall restores source and preserves unrelated data',t=>{
  const f=fixture(t),plan=installAddon({...f,dryRun:true});assert.equal(plan.status,'ready');assert.equal(read(f.target,'server/lobby.js'),f.original);assert(!fs.existsSync(path.join(f.target,'.stronghold-state-machine-install')));
  assert.equal(installAddon(f).status,'installed');assert(read(f.target,'server/lobby.js').includes('route-ai'));assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),f.payload);
  assert.equal(installAddon(f).status,'already-installed');put(f.target,'server/match/unrelated.js','user edit');
  assert.equal(uninstallAddon({...f,dryRun:true}).status,'ready-to-uninstall');assert.equal(uninstallAddon(f).status,'uninstalled');assert.equal(read(f.target,'server/lobby.js'),f.original);assert(!fs.existsSync(path.join(f.target,'server/match/routeAI/runtime.mjs')));
  for(const [name,value]of [['data/keep.json','{"native":true}\n'],['public/assets/keep.bin','art'],['node_modules/keep.txt','dependency'],['server/match/unrelated.js','user edit']])assert.equal(read(f.target,name),value);
  assert.equal(uninstallAddon(f).status,'not-installed');assert(!fs.existsSync(path.join(f.target,'.stronghold-state-machine-install')));
});

test('a same-version new revision can safely uninstall the old receipt before installing its changed payload',t=>{
  const f=fixture(t);assert.equal(installAddon(f).status,'installed');
  const next='export const run = () => false;\n';put(f.root,'runtime/route.mjs',next);f.manifest.files[0].sha256=sha(next);f.save();
  assert.throws(()=>installAddon(f),/different addon revision/);
  assert.equal(uninstallAddon({...f,dryRun:true}).status,'ready-to-uninstall');
  assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),f.payload);
  assert.equal(uninstallAddon(f).status,'uninstalled');assert.equal(read(f.target,'server/lobby.js'),f.original);
  assert.equal(read(f.target,'data/keep.json'),'{"native":true}\n');
  assert.equal(installAddon(f).status,'installed');assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),next);
});

test('unknown upstream, duplicate anchors, unsupported versions and corrupted payload refuse before mutation',t=>{
  const f=fixture(t);put(f.target,'server/lobby.js',f.original+'// local');assert.throws(()=>installAddon(f),/locally edited upstream/);assert(!fs.existsSync(path.join(f.target,'server/match/routeAI/runtime.mjs')));
  put(f.target,'server/lobby.js',f.original);f.manifest.patches[0].replacements[0].find='export';f.manifest.patches[0].replacements[0].replace='// export';put(f.target,'server/lobby.js',f.original+f.original);f.manifest.patches[0].sha256=[sha(f.original+f.original)];f.save();assert.throws(()=>installAddon(f),/exactly once/);
  put(f.target,'package.json',JSON.stringify({name:'stronghold-protocol-alliance',version:'9.9.9'}));assert.throws(()=>installAddon(f),/Unsupported host package/);
  put(f.target,'package.json',JSON.stringify({name:'stronghold-protocol-alliance',version:'0.3.1'}));put(f.root,'runtime/route.mjs','tampered');assert.throws(()=>installAddon(f),/Payload hash mismatch/);
});

test('target allowlist and traversal validation exclude data, game art and external paths',t=>{
  const f=fixture(t);
  for(const target of ['../outside.js','server/../../outside.js','data/chess.json','public/assets/image.png','node_modules/module.js','server\\lobby.js']){f.manifest.files[0].target=target;f.save();assert.throws(()=>installAddon(f));}
  assert.equal(read(f.target,'server/lobby.js'),f.original);
});

test('a failed write rolls all previous changes back and removes newly created empty directories',t=>{
  const f=fixture(t);assert.throws(()=>installAddon({...f,hooks:{beforeWrite:({index})=>{if(index===1)throw Error('simulated disk failure');}}}),/simulated disk failure/);
  assert.equal(read(f.target,'server/lobby.js'),f.original);assert(!fs.existsSync(path.join(f.target,'server/match/routeAI')));assert(!fs.existsSync(path.join(f.target,'.stronghold-state-machine-install')));
});

test('uninstall refuses edited owned files atomically and leaves backups for review',t=>{
  const f=fixture(t);installAddon(f);put(f.target,'server/lobby.js',read(f.target,'server/lobby.js')+'// post-install user edit\n');
  assert.throws(()=>uninstallAddon(f),/Nothing may overwrite/);assert(read(f.target,'server/lobby.js').endsWith('// post-install user edit\n'));assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),f.payload);
  assert(fs.existsSync(path.join(f.target,'.stronghold-state-machine-install/stronghold-state-machine/receipt.json')));
});

test('identical pre-existing payload files are retained after uninstall, and uninstall failure restores the installed state',t=>{
  const f=fixture(t);put(f.target,'server/match/routeAI/runtime.mjs',f.payload);installAddon(f);
  assert.throws(()=>uninstallAddon({...f,hooks:{beforeWrite:()=>{throw Error('simulated uninstall failure');}}}),/simulated uninstall failure/);assert(read(f.target,'server/lobby.js').includes('route-ai'));
  uninstallAddon(f);assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),f.payload);assert.equal(read(f.target,'server/lobby.js'),f.original);
});

test('an interrupted uninstall restores earlier removals before returning failure',t=>{
  const f=fixture(t);installAddon(f);assert.throws(()=>uninstallAddon({...f,hooks:{beforeWrite:({index})=>{if(index===1)throw Error('later uninstall failure');}}}),/later uninstall failure/);
  assert.equal(read(f.target,'server/match/routeAI/runtime.mjs'),f.payload);assert(read(f.target,'server/lobby.js').includes('route-ai'));assert.equal(uninstallAddon(f).status,'uninstalled');
});

test('a newly created public source directory validates and restores cleanly',t=>{
  const f=fixture(t);f.manifest.files[0].target='public/js/routeAI.mjs';f.save();installAddon(f);assert.equal(installAddon(f).status,'already-installed');uninstallAddon(f);assert(!fs.existsSync(path.join(f.target,'public/js')));assert.equal(read(f.target,'public/assets/keep.bin'),'art');
});

test('manifest revision changes are not silently installed over an existing revision',t=>{
  const f=fixture(t);installAddon(f);f.manifest.version='0.2.0';f.save();assert.throws(()=>installAddon(f),/different addon revision/);assert.equal(uninstallAddon(f).status,'uninstalled');
});

test('symlinked target ancestors are refused without touching their destination',t=>{
  const f=fixture(t),outside=path.join(f.temp,'external');fs.mkdirSync(outside);fs.mkdirSync(path.join(f.target,'public/js'),{recursive:true});
  try{fs.symlinkSync(outside,path.join(f.target,'public/js/linked'),process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Creating a local test symlink is not permitted.');return;}throw error;}
  f.manifest.files[0].target='public/js/linked/payload.mjs';f.save();assert.throws(()=>installAddon(f),/Linked files/);assert.deepEqual(fs.readdirSync(outside),[]);
  // The fixture owns this link; remove it before the test's recursive cleanup.
  fs.unlinkSync(path.join(f.target,'public/js/linked'));
});
