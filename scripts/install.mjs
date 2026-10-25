#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Offline, hash-pinned source integration. No art, data, dependencies or running services are changed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const STATE_ROOT='.stronghold-state-machine-install';
const TARGET_PREFIXES=['server/','shared/','public/js/','public/i18n/','public/css/'];
const SHA=/^[a-f0-9]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
class InstallerError extends Error { constructor(message){super(message);this.name='InstallerError';} }
const fail=message=>{throw new InstallerError(message);};
const fsCode=error=>typeof error?.code==='string'?error.code:'IO_ERROR';

function relativeName(value){
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes('\0')||value.startsWith('/')||/^[A-Za-z]:/.test(value))fail('Manifest contains an invalid relative path.');
  const bits=value.split('/');
  if(bits.some(part=>!part||part==='.'||part==='..')||bits.some(part=>part==='.git'||part==='node_modules'))fail('Manifest path escapes the allowed source tree.');
  return value;
}
function permittedTarget(value){
  const name=relativeName(value);
  if(!TARGET_PREFIXES.some(prefix=>name.startsWith(prefix)))fail(`Target is outside the permitted source directories: ${name}`);
  return name;
}
function permittedDirectory(value){
  const name=relativeName(value);
  if(!TARGET_PREFIXES.some(prefix=>prefix.startsWith(name+'/')||(name+'/').startsWith(prefix)))fail(`Directory is outside the permitted source directories: ${name}`);
  return name;
}
function safePath(base,name){
  relativeName(name);
  const result=path.resolve(base,...name.split('/'));
  if(!result.startsWith(base+path.sep))fail('Path escapes its intended directory.');
  let current=base;
  for(const part of name.split('/')){
    current=path.join(current,part);
    try{if(fs.lstatSync(current).isSymbolicLink())fail(`Linked files or directories are not supported: ${name}`);}
    catch(error){if(error instanceof InstallerError)throw error;if(error.code==='ENOENT')break;throw new InstallerError(`Cannot inspect ${name} (${fsCode(error)}).`);}
  }
  return result;
}
function readBytes(base,name){
  const file=safePath(base,name);
  try{return fs.readFileSync(file);}catch(error){throw new InstallerError(`Cannot read ${name} (${fsCode(error)}).`);}
}
function jsonBytes(bytes,label){try{return JSON.parse(bytes.toString('utf8'));}catch{fail(`Invalid JSON: ${label}`);}}
function existing(base,name){
  const file=safePath(base,name);
  try{const stat=fs.statSync(file);if(!stat.isFile())fail(`Expected a regular file: ${name}`);return fs.readFileSync(file);}
  catch(error){if(error instanceof InstallerError)throw error;if(error.code==='ENOENT')return null;throw new InstallerError(`Cannot inspect ${name} (${fsCode(error)}).`);}
}
function exactHash(value,label){if(typeof value!=='string'||!SHA.test(value))fail(`A SHA-256 is required for ${label}.`);return value;}
function allowedHashes(value,label){
  const values=Array.isArray(value)?value:[value];
  if(!values.length)fail(`Allowed SHA-256 values are required for ${label}.`);
  return values.map(v=>exactHash(v,label));
}
function loadManifest(root){
  const bytes=readBytes(root,'addon-manifest.json'),m=jsonBytes(bytes,'addon-manifest.json');
  if(m.schema!==1||typeof m.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(m.id)||typeof m.version!=='string'||!m.version)fail('Unsupported addon manifest identity.');
  if(typeof m.host?.packageName!=='string'||!Array.isArray(m.host.versions)||!m.host.versions.length||m.host.versions.some(v=>typeof v!=='string'))fail('Manifest must pin the host package and exact supported versions.');
  if(!Array.isArray(m.files)||!Array.isArray(m.patches))fail('Manifest files and patches must be arrays.');
  const targets=new Set();
  for(const entry of [...m.files,...m.patches]){const name=permittedTarget(entry.target);if(targets.has(name))fail(`Duplicate target: ${name}`);targets.add(name);}
  return {manifest:m,manifestSha256:hash(bytes)};
}
function prepare({target,root=DEFAULT_ROOT}){
  if(typeof target!=='string'||!target)fail('Specify the host with --target.');
  let host;
  try{host=fs.realpathSync(path.resolve(target));if(!fs.statSync(host).isDirectory())fail('The target must be an existing host directory.');}
  catch(error){if(error instanceof InstallerError)throw error;fail(`Cannot open the host directory (${fsCode(error)}).`);}
  const release=fs.realpathSync(path.resolve(root)),loaded=loadManifest(release),m=loaded.manifest;
  const pkg=jsonBytes(readBytes(host,'package.json'),'package.json');
  if(pkg.name!==m.host.packageName||!m.host.versions.includes(pkg.version))fail('Unsupported host package/version; no files were changed.');
  const stateName=`${STATE_ROOT}/${m.id}`,statePath=safePath(host,stateName),receiptName=`${stateName}/receipt.json`;
  return {host,root:release,...loaded,stateName,statePath,receiptName};
}
function validateReceipt(context,receipt){
  if(receipt?.schema!==1||receipt.id!==context.manifest.id||!Array.isArray(receipt.entries)||!Array.isArray(receipt.createdDirs))fail('Invalid installation receipt; no files were changed.');
  const paths=new Set();
  for(const entry of receipt.entries){
    permittedTarget(entry.path);if(paths.has(entry.path))fail('Duplicate path in installation receipt.');paths.add(entry.path);
    if(!['added','patched','kept'].includes(entry.kind))fail('Invalid entry in installation receipt.');
    exactHash(entry.afterSha256,entry.path);
    if(entry.kind==='patched'){
      exactHash(entry.beforeSha256,entry.path);
      if(typeof entry.backup!=='string'||!/^backups\/[0-9]{4,}\.bin$/.test(entry.backup))fail('Invalid backup path in installation receipt.');
      if(hash(readBytes(context.statePath,entry.backup))!==entry.beforeSha256)fail(`Original backup is damaged: ${entry.path}`);
    }
  }
  for(const name of receipt.createdDirs)permittedDirectory(name);
  return receipt;
}
function loadReceipt(context){
  const bytes=existing(context.host,context.receiptName);
  return bytes?validateReceipt(context,jsonBytes(bytes,'installation receipt')):null;
}
function currentMatches(context,entry,expected){
  const bytes=existing(context.host,entry.path);
  if(expected===null?bytes!==null:bytes===null||hash(bytes)!==expected)fail(`Source changed or is missing: ${entry.path}. Nothing may overwrite that edit.`);
}
function makePlan(context){
  const {manifest:m,host,root}=context,plan=[];
  for(const check of m.host.checks||[]){
    const name=check.path==='package.json'?'package.json':permittedTarget(check.path),bytes=readBytes(host,name);
    if(!allowedHashes(check.sha256,name).includes(hash(bytes)))fail(`Unsupported upstream source: ${name}`);
  }
  for(const entry of m.files){
    const source=relativeName(entry.source),bytes=readBytes(root,source);exactHash(entry.sha256,source);
    if(hash(bytes)!==entry.sha256)fail(`Payload hash mismatch: ${source}`);
    const before=existing(host,entry.target);
    if(before&&hash(before)!==entry.sha256)fail(`An unrelated file already exists: ${entry.target}`);
    plan.push({path:entry.target,kind:before?'kept':'added',before,after:bytes});
  }
  for(const entry of m.patches){
    const before=readBytes(host,entry.target);
    if(!allowedHashes(entry.sha256,entry.target).includes(hash(before)))fail(`Unsupported or locally edited upstream source: ${entry.target}`);
    if(!Array.isArray(entry.replacements)||!entry.replacements.length)fail(`Exact patch anchors are required: ${entry.target}`);
    let text=before.toString('utf8');
    for(const replacement of entry.replacements){
      const {find,replace}=replacement;
      if(typeof find!=='string'||!find||typeof replace!=='string'||find===replace)fail(`Invalid patch anchor: ${entry.target}`);
      const first=text.indexOf(find);
      if(first<0||text.indexOf(find,first+find.length)>=0)fail(`Patch anchor must match exactly once: ${entry.target}`);
      text=text.slice(0,first)+replace+text.slice(first+find.length);
    }
    plan.push({path:entry.target,kind:'patched',before,after:Buffer.from(text)});
  }
  return plan;
}
function ensureParents(base,name,created){
  let current=base;const parts=name.split('/').slice(0,-1),relative=[];
  for(const part of parts){relative.push(part);current=path.join(current,part);safePath(base,relative.join('/'));
    if(!fs.existsSync(current)){fs.mkdirSync(current);created.push(relative.join('/'));}
    else if(!fs.statSync(current).isDirectory())fail(`Expected a directory: ${relative.join('/')}`);
  }
}
function writeAtomic(base,name,bytes){
  const dest=safePath(base,name),temp=`${dest}.addon-${randomBytes(6).toString('hex')}.tmp`;
  try{const mode=fs.existsSync(dest)?fs.statSync(dest).mode&0o777:0o666;fs.writeFileSync(temp,bytes,{flag:'wx',mode});fs.renameSync(temp,dest);}
  catch(error){try{fs.unlinkSync(temp);}catch{/* absent */}throw new InstallerError(`Cannot write ${name} (${fsCode(error)}).`);}
}
function removeEmptyDirs(base,names){
  for(const name of [...new Set(names)].sort((a,b)=>b.length-a.length)){
    const dir=safePath(base,name);
    try{fs.rmdirSync(dir);}catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code))throw error;}
  }
}
function removeOwnedState(context,relative){
  if(!relative.startsWith(`${STATE_ROOT}/`))fail('Refusing to remove an unowned state directory.');
  const resolved=safePath(context.host,relative),expected=path.join(context.host,STATE_ROOT)+path.sep;
  if(!resolved.startsWith(expected))fail('State directory escaped the host.');
  // These directories only contain our backups/receipt. Never follow a link introduced afterwards.
  const inspect=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(item.isSymbolicLink())fail('Refusing a linked installation-state entry.');if(item.isDirectory())inspect(path.join(dir,item.name));}};
  if(fs.existsSync(resolved)){inspect(resolved);fs.rmSync(resolved,{recursive:true});}
}
function acquireLock(context){
  const parent=safePath(context.host,STATE_ROOT);if(!fs.existsSync(parent))fs.mkdirSync(parent);
  const name=`${STATE_ROOT}/${context.manifest.id}.lock`,file=safePath(context.host,name);let fd;
  try{fd=fs.openSync(file,'wx');}catch(error){if(error.code==='EEXIST')fail('Another installation is in progress (or an old lock needs review).');throw error;}
  return ()=>{fs.closeSync(fd);fs.unlinkSync(file);try{fs.rmdirSync(parent);}catch{/* other addon state is retained */}};
}
function rollback(context,applied,expectedAfter,restoreTo){
  const conflicts=[];
  for(const entry of [...applied].reverse()){
    try{
      currentMatches(context,entry,expectedAfter(entry));
      const bytes=restoreTo(entry);
      if(bytes===null)fs.unlinkSync(safePath(context.host,entry.path));else writeAtomic(context.host,entry.path,bytes);
    }catch{conflicts.push(entry.path);}
  }
  return conflicts;
}

export function installAddon({target,root=DEFAULT_ROOT,dryRun=false,hooks={}}={}){
  const context=prepare({target,root}),receipt=loadReceipt(context);
  if(receipt){
    if(receipt.manifestSha256!==context.manifestSha256)fail('A different addon revision is installed; uninstall it before installing this revision.');
    for(const entry of receipt.entries)currentMatches(context,entry,entry.afterSha256);
    return {status:'already-installed',id:receipt.id,version:receipt.version,changes:[]};
  }
  if(fs.existsSync(context.statePath))fail('An incomplete installation state exists; review it before proceeding.');
  const plan=makePlan(context),summary={status:dryRun?'ready':'installed',id:context.manifest.id,version:context.manifest.version,changes:plan.map(e=>({path:e.path,action:e.kind}))};
  if(dryRun)return summary;
  const unlock=acquireLock(context),createdDirs=[],applied=[],stageName=`${STATE_ROOT}/.${context.manifest.id}-stage-${randomBytes(6).toString('hex')}`;
  const stage=safePath(context.host,stageName);let recovery=false;
  try{
    if(fs.existsSync(context.statePath))fail('Installation state appeared after preflight.');
    fs.mkdirSync(stage);fs.mkdirSync(path.join(stage,'backups'));
    const entries=plan.map((entry,i)=>{const record={path:entry.path,kind:entry.kind,beforeSha256:entry.before?hash(entry.before):null,afterSha256:hash(entry.after)};
      if(entry.kind==='patched'){record.backup=`backups/${String(i).padStart(4,'0')}.bin`;fs.writeFileSync(safePath(stage,record.backup),entry.before,{flag:'wx'});}return record;});
    for(const [index,entry]of plan.entries()){
      currentMatches(context,entry,entry.before?hash(entry.before):null);
      if(entry.kind==='kept')continue;
      hooks.beforeWrite?.({index,path:entry.path,action:'install'});
      currentMatches(context,entry,entry.before?hash(entry.before):null);
      ensureParents(context.host,entry.path,createdDirs);writeAtomic(context.host,entry.path,entry.after);applied.push(entry);
    }
    const next={schema:1,id:context.manifest.id,version:context.manifest.version,manifestSha256:context.manifestSha256,entries,createdDirs};
    fs.writeFileSync(path.join(stage,'receipt.json'),JSON.stringify(next,null,2)+'\n',{flag:'wx'});fs.renameSync(stage,context.statePath);
    return summary;
  }catch(error){
    const conflicts=rollback(context,applied,e=>hash(e.after),e=>e.before);
    if(conflicts.length){recovery=true;fs.writeFileSync(path.join(stage,'RECOVERY.json'),JSON.stringify({schema:1,conflicts},null,2)+'\n');throw new InstallerError(`Install stopped; concurrent edits were retained. Recovery backups remain in ${stageName}.`);}
    removeEmptyDirs(context.host,createdDirs);throw error;
  }finally{if(!recovery)removeOwnedState(context,stageName);unlock();}
}

export function uninstallAddon({target,root=DEFAULT_ROOT,dryRun=false,hooks={}}={}){
  const context=prepare({target,root}),receipt=loadReceipt(context);
  if(!receipt)return {status:'not-installed',id:context.manifest.id,changes:[]};
  const plan=receipt.entries.filter(e=>e.kind!=='kept').map(entry=>{
    currentMatches(context,entry,entry.afterSha256);
    return {...entry,before:existing(context.host,entry.path),after:entry.kind==='patched'?readBytes(context.statePath,entry.backup):null};
  });
  const summary={status:dryRun?'ready-to-uninstall':'uninstalled',id:receipt.id,changes:plan.map(e=>({path:e.path,action:e.kind==='added'?'remove':'restore'}))};
  if(dryRun)return summary;
  const unlock=acquireLock(context),applied=[];
  try{
    for(const [index,entry]of plan.entries()){
      hooks.beforeWrite?.({index,path:entry.path,action:'uninstall'});currentMatches(context,entry,entry.afterSha256);
      if(entry.after===null)fs.unlinkSync(safePath(context.host,entry.path));else writeAtomic(context.host,entry.path,entry.after);
      applied.push(entry);
    }
    removeEmptyDirs(context.host,receipt.createdDirs);removeOwnedState(context,context.stateName);return summary;
  }catch(error){
    // Preserve a user edit if an external writer changed a file during this transaction.
    const conflicts=rollback(context,applied,e=>e.after?hash(e.after):null,e=>e.before);
    if(conflicts.length)throw new InstallerError('Uninstall stopped; concurrent edits were retained. Installation backups are still present.');
    throw error;
  }finally{unlock();}
}

export function runInstallerCli(action,args=process.argv.slice(2)){
  let target=null,dryRun=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--target')target=args[++i];
    else if(args[i]==='--dry-run')dryRun=true;
    else if(args[i]==='--help'){console.log(`Usage: node scripts/${action==='uninstall'?'uninstall':'install'}.mjs --target <host-directory> [--dry-run]`);return;}
    else fail('Unknown command argument; use --help.');
  }
  const result=action==='uninstall'?uninstallAddon({target,dryRun}):installAddon({target,dryRun});console.log(JSON.stringify(result,null,2));
}
export function installerCliFailure(error){console.error(`[addon] ${error instanceof InstallerError?error.message:`Operation failed (${fsCode(error)}).`}`);process.exitCode=1;}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{runInstallerCli('install');}catch(error){installerCliFailure(error);}}
