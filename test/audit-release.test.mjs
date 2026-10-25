import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditRelease} from '../scripts/audit-release.mjs';
const create=t=>{
  const base=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'release-audit-'));
  t.after(()=>{const rel=path.relative(base,path.resolve(root));assert(!rel.startsWith('..')&&path.basename(root).startsWith('release-audit-'));fs.rmSync(root,{recursive:true,force:true});});
  const put=(file,text)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
  return {root,put};
};
test('compact source, metadata, dotfiles and local Git metadata have a defined publication boundary',t=>{
  const {root,put}=create(t);put('README.md','# AI\n');put('.gitignore','node_modules/\n');put('runtime/route.mjs','export const route = 1;\n');put('benchmarks/summary.json','{"games":10,"difficulty":"ABYSS"}\n');put('.git/config','local metadata');
  const report=auditRelease({root});assert(report.ok);assert.equal(report.files,4);assert.equal(report.failures.length,0);
});
test('private literals, handoff entrypoints and records fail without echoing matched values',t=>{
  const {root,put}=create(t),slash=String.fromCharCode(92),sensitive=['Q',':',slash,'Users',slash,'sample-account',slash,'work'].join('');
  put('runtime/path.js',`export const location = ${JSON.stringify(sensitive)};`);
  put('runtime/secret.js',`export const secret = '${'gh'+'p_'+ 'A'.repeat(30)}';`);
  put('runtime/private.mjs',`export const rpc='${['g','autoplay'].join('.')}';`);
  put('benchmarks/session.json',JSON.stringify({[['match','Key'].join('')]: 'opaque-session'}));
  const report=auditRelease({root}),codes=new Set(report.failures.map(f=>f.code));assert(!report.ok);
  for(const code of ['WINDOWS_ABSOLUTE_PATH','ACCESS_TOKEN','PRIVATE_HANDOFF_RPC','RAW_SESSION_DATA'])assert(codes.has(code));
  assert(!JSON.stringify(report).includes('sample-account'));assert(!JSON.stringify(report).includes('A'.repeat(30)));
});
test('unknown dotfiles, binary content, dependency directories and size overflow are refused',t=>{
  const {root,put}=create(t);put('.unexpected','config');put('runtime/image.js',Buffer.from([1,0,3]));put('runtime/large.json','x'.repeat(100));put(['node','modules'].join('_')+'/entry.js','module');
  const report=auditRelease({root,maxFileBytes:32,maxBytes:16}),codes=new Set(report.failures.map(f=>f.code));
  for(const code of ['ROOT_FILE_NOT_ALLOWLISTED','NON_TEXT_FILE','NONPUBLIC_DIRECTORY','FILE_EXCEEDS_COMPACT_LIMIT','TOTAL_EXCEEDS_COMPACT_LIMIT'])assert(codes.has(code));
});
test('escaped literals are inspected without evaluating source code',t=>{
  const {root,put}=create(t),encoded=['%51','%3A','%5C','Users','%5C','sample-account'].join('');
  put('runtime/escaped.js',`export const value = '${encoded}';`);
  assert(auditRelease({root}).failures.some(f=>f.code==='WINDOWS_ABSOLUTE_PATH'));
});
test('personal extra denylist stays outside the public tree and is not printed',t=>{
  const {root,put}=create(t),privateRoot=fs.mkdtempSync(path.join(path.resolve(os.tmpdir()),'release-audit-deny-'));
  t.after(()=>{assert(path.basename(privateRoot).startsWith('release-audit-deny-'));fs.rmSync(privateRoot,{recursive:true,force:true});});
  put('README.md','unexpected identity marker');const denyFile=path.join(privateRoot,'deny.json');fs.writeFileSync(denyFile,JSON.stringify(['identity '+'marker']));
  const denied=auditRelease({root,privateDenylist:denyFile});assert(denied.failures.some(f=>f.code==='PRIVATE_DENYLIST_MATCH'));assert(!JSON.stringify(denied).includes('identity marker'));
  put('private-deny.json','[]');assert(auditRelease({root,privateDenylist:path.join(root,'private-deny.json')}).failures.some(f=>f.code==='PRIVATE_DENYLIST_INSIDE_PUBLICATION_TREE'));
});
test('permitted licence addresses do not mask later private addresses',t=>{
  const {root,put}=create(t);
  put('LICENSE',['licensing','gnu.org'].join('@')+'\n'+['sample-person','example.test'].join('@'));
  assert(auditRelease({root}).failures.some(f=>f.code==='EMAIL_ADDRESS'));
});
test('private identifiers in filenames are rejected without exposing the name',t=>{
  const {root,put}=create(t),privateRoot=fs.mkdtempSync(path.join(path.resolve(os.tmpdir()),'release-audit-deny-'));
  t.after(()=>{assert(path.basename(privateRoot).startsWith('release-audit-deny-'));fs.rmSync(privateRoot,{recursive:true,force:true});});
  const marker=['identity','marker'].join('-'),denyFile=path.join(privateRoot,'deny.json');
  fs.writeFileSync(denyFile,JSON.stringify([marker]));put('runtime/'+marker+'.js','export const ok=true;');
  const report=auditRelease({root,privateDenylist:denyFile});
  assert(report.failures.some(f=>f.code==='PRIVATE_FILENAME_MATCH'));assert(!JSON.stringify(report).includes(marker));
});
test('links cannot pull outside files into the publication set',t=>{
  const {root,put}=create(t);put('README.md','source');fs.mkdirSync(path.join(root,'runtime'));
  try{fs.symlinkSync(root,path.join(root,'runtime','linked'),'junction');}
  catch(error){if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('symlink creation is unavailable');return;}throw error;}
  assert(auditRelease({root}).failures.some(f=>f.code==='SYMLINK_NOT_PUBLISHABLE'));
});
test('CLI option errors do not print a machine path or stack',()=>{
  const script=fileURLToPath(new URL('../scripts/audit-release.mjs',import.meta.url));
  for(const args of [['--unknown'],['--root'],['--private-denylist','--json']]){
    const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(result.status,1);
    assert(!result.stderr.includes(script));assert(!/\bat .*\(/.test(result.stderr));assert.equal(result.stdout,'');
  }
});
