// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('policy implementation modules do not import their public facade or form a dependency cycle',()=>{
 for(const route of ['kjerag','sargon']){
  const folder=path.join(root,'runtime/server/match/routeAI/policies',route),graph=new Map();
  for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.mjs'))){
   const full=path.join(folder,file),text=fs.readFileSync(full,'utf8'),edges=[];
   for(const [,source]of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)){
    const target=path.resolve(folder,source);assert.notEqual(target,folder+'.mjs','Implementation must not depend on its facade');
    if(path.dirname(target)===folder){assert(fs.existsSync(target),'Missing local policy dependency');edges.push(path.basename(target));}
   }
   graph.set(file,edges);
  }
  const done=new Set(),active=new Set();function visit(file){assert(!active.has(file),'Circular policy dependency: '+route+'/'+file);if(done.has(file))return;active.add(file);for(const next of graph.get(file)||[])visit(next);active.delete(file);done.add(file);}
  for(const file of graph.keys())visit(file);
 }
});
test('every runtime file has exactly one installation entry and matching provenance',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'addon-manifest.json'))),p=JSON.parse(fs.readFileSync(path.join(root,'provenance.json'))),sources=m.files.map(e=>e.source);
 assert.equal(new Set(sources).size,sources.length);
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else{const name=path.relative(root,f).replaceAll('\\','/');assert(sources.includes(name),'Uninstalled runtime file: '+name);const source=[...p.files,...p.projectFiles].find(e=>e.file===name);assert(source,'Missing provenance: '+name);assert.equal(source.sha256,m.files.find(e=>e.source===name).sha256,'Provenance/installation mismatch: '+name);}}}
 walk(path.join(root,'runtime'));for(const source of sources)assert(fs.existsSync(path.join(root,source)),'Missing installation source: '+source);
});
