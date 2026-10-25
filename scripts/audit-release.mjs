// Publication audit: source allowlist, compact distribution, and no personal/runtime material.
// An optional private denylist is read only from outside this tree and is never echoed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RELEASE_LIMIT_BYTES = 20 * 1024 * 1024;
export const RELEASE_FILE_LIMIT_BYTES = 2 * 1024 * 1024;
const ROOT_FILES = new Set([
  'README.md','LICENSE','NOTICE','NOTICE.md','THIRD-PARTY-NOTICES.md','CONTRIBUTING.md',
  'SECURITY.md','CHANGELOG.md','.gitignore','.gitattributes','package.json','package-lock.json',
  'addon-manifest.json','provenance.json','RELEASE-MANIFEST.json','RELEASE-READY.json',
]);
const ROOT_DIRS = new Set(['runtime','shared','scripts','test','benchmarks','docs','.github']);
const EXTENSIONS = new Set(['.js','.mjs','.cjs','.json','.md','.txt','.yml','.yaml','.css','.html','.patch','.diff']);
const PRIVATE_PATH_PART = /(?:^|\/)(?:\.env(?:\..*)?|\.cache|\.vscode|\.idea|node_modules|reports?|training|datasets?|replays?|recordings?|captures?|profiles?|browser[^/]*|autoplay[^/]*|.*\.(?:pem|key|pfx|p12|sqlite|db|log|onnx|safetensors|pt|pth|ckpt))(?:\/|$)/i;
// Match values, not regex source text. Audit errors report rule/line, never the matched value.
const CONTENT_RULES = [
  ['WINDOWS_ABSOLUTE_PATH', /\b[A-Za-z]:[\\/]/],
  ['USER_HOME_PATH', /\/(?:Users|home)\/[A-Za-z0-9_.-]+|\/mnt\/[a-z]\/|\/private\/var\/|\/var\/folders\/|\/run\/user\//],
  ['NETWORK_SHARE', /\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]+/],
  ['PRIVATE_NETWORK_ADDRESS', /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/],
  ['PRIVATE_HOSTNAME', /\b[A-Za-z0-9][A-Za-z0-9-]*\.(?:local|lan|home|internal)\b/i],
  ['DEVICE_FINGERPRINT', /\b(?:RTX\s*\d{3,4}|GTX\s*\d{3,4}|AMD\s+Ryzen|Intel\s+Core|PROC[E]SSOR_IDENTIFIER|COMPUT[E]RNAME|USERPROFIL[E])\b|\bos\.(?:hostname|cpus|homedir)\s*\(/i],
  ['EMAIL_ADDRESS', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['ACCESS_TOKEN', /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['CREDENTIAL_LITERAL', /\b(?:password|client_secret|access_token|api_key|authorization)\s*[:=]\s*["'`][A-Za-z0-9_+\/-]{8,}["'`]/i],
  ['PRIVATE_HANDOFF_RPC', /["'`]g\.autoplay["'`]|\b(?:startAutoplayWork[e]r\d*|installAutoplayR[p]c\d*|AutoplaySettin[g]s\d*)\b/],
  ['NONCORE_RECORDING_ENTRY', /\b(?:MediaRecord[e]r|captureLiveBatt[l]e|createTrainingTra[c]e|installReplayRecord[i]ng)\b/],
  ['PRIVATE_IMPORT', /(?:\bfrom\s*|\bimport\s*\(?)['"][^'"\n]*(?:\/replay\/|autoplayWorker|autoplayDriver|demo-record|demo-publish|\/training\/)/i],
];
const normalize = s => s.normalize('NFKC').replaceAll('\\','/').toLowerCase();
const expandedText = s => s.replace(/\\u([\da-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
  .replace(/\\x([\da-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
  .replace(/(?:%[\da-f]{2})+/gi,value=>{try{return decodeURIComponent(value);}catch{return value;}});
const within = (root, file) => {const rel=path.relative(root,file);return rel!==''&&!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel);};

export function auditRelease({root=path.resolve(import.meta.dirname,'..'),privateDenylist=null,maxBytes=RELEASE_LIMIT_BYTES,maxFileBytes=RELEASE_FILE_LIMIT_BYTES}={}){
  root=path.resolve(root);
  const failures=[],files=[];
  const fail=(file,code,line=null)=>failures.push({file,code,...(line?{line}:{})});
  let deny=[];
  if(privateDenylist){
    const denyFile=path.resolve(privateDenylist);
    if(denyFile===root||within(root,denyFile))fail('.', 'PRIVATE_DENYLIST_INSIDE_PUBLICATION_TREE');
    else {
      try {
        const raw=fs.readFileSync(denyFile,'utf8');if(Buffer.byteLength(raw)>1024*1024)throw Error('size');
        const input=JSON.parse(raw);if(!Array.isArray(input)||input.some(v=>typeof v!=='string'||!v.trim()))throw Error('format');
        deny=input.map(normalize);
      }catch {fail('.', 'PRIVATE_DENYLIST_UNREADABLE');}
    }
  }
  if(!fs.existsSync(root)||!fs.lstatSync(root).isDirectory())return {ok:false,files:0,bytes:0,limitBytes:maxBytes,failures:[{file:'.',code:'INVALID_PUBLICATION_ROOT'}]};
  function inspect(rel){
    const file=path.join(root,rel),stat=fs.lstatSync(file),norm=rel.split(path.sep).join('/');
    // A private identifier can leak through a filename as readily as through its contents.
    // Do not echo that filename in an audit failure.
    if(deny.some(value=>normalize(norm).includes(value)||normalize(expandedText(norm)).includes(value))){
      fail('[redacted]', 'PRIVATE_FILENAME_MATCH');return;
    }
    if(stat.isSymbolicLink()){fail(norm,'SYMLINK_NOT_PUBLISHABLE');return;}
    if(stat.isDirectory()){
      if(norm==='.git')return; // Git's local metadata is never part of a commit or source package.
      if(PRIVATE_PATH_PART.test(norm)){fail(norm,'NONPUBLIC_DIRECTORY');return;}
      if(!ROOT_DIRS.has(norm.split('/')[0])){fail(norm,'DIRECTORY_NOT_ALLOWLISTED');return;}
      for(const name of fs.readdirSync(file).sort())inspect(path.join(rel,name));
      return;
    }
    if(!stat.isFile()){fail(norm,'SPECIAL_FILE_NOT_PUBLISHABLE');return;}
    files.push({file:norm,bytes:stat.size});
    if(PRIVATE_PATH_PART.test(norm))fail(norm,'NONPUBLIC_FILE');
    if(!norm.includes('/')&&!ROOT_FILES.has(norm))fail(norm,'ROOT_FILE_NOT_ALLOWLISTED');
    const base=path.posix.basename(norm),ext=path.posix.extname(norm).toLowerCase();
    if(!EXTENSIONS.has(ext)&&!/^LICENSE(?:[-_.][A-Za-z0-9.-]+)?$|^NOTICE(?:[-_.][A-Za-z0-9.-]+)?$/.test(base)&&!ROOT_FILES.has(norm))fail(norm,'FILE_TYPE_NOT_ALLOWLISTED');
    if(stat.size>maxFileBytes){fail(norm,'FILE_EXCEEDS_COMPACT_LIMIT');return;}
    const bytes=fs.readFileSync(file);let text;
    try {text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(bytes.includes(0))throw Error('binary');}
    catch {fail(norm,'NON_TEXT_FILE');return;}
    const expanded=expandedText(text);
    for(const [code,rule]of CONTENT_RULES){
      const candidates=[...text.matchAll(new RegExp(rule.source,rule.flags+'g')),
        ...expanded.matchAll(new RegExp(rule.source,rule.flags+'g'))];
      // Check each match. A permitted licence address must not hide a later personal address.
      const match=candidates.find(m=>!(code==='EMAIL_ADDRESS'&&/^LICENSE/.test(base)&&/@(?:gnu|fsf)\.org$/i.test(m[0])));
      if(!match)continue;
      fail(norm,code,text.slice(0,match.index).split('\n').length);
    }
    if(ext==='.json'&&/"(?:trainingByPlayer|matchKey|segmentId)"\s*:|"frames"\s*:\s*\[\s*\{[^]{0,200}"snap"\s*:/.test(text))fail(norm,'RAW_SESSION_DATA');
    const normText=normalize(text),normExpanded=normalize(expanded);
    if(deny.some(value=>normText.includes(value)||normExpanded.includes(value)))fail(norm,'PRIVATE_DENYLIST_MATCH');
  }
  for(const name of fs.readdirSync(root).sort())inspect(name);
  const bytes=files.reduce((total,file)=>total+file.bytes,0);
  if(bytes>maxBytes)fail('.','TOTAL_EXCEEDS_COMPACT_LIMIT');
  return {ok:failures.length===0,files:files.length,bytes,limitBytes:maxBytes,failures};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const args=process.argv.slice(2),options={};let json=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--root'||args[i]==='--private-denylist'){
        const option=args[i],value=args[++i];if(!value||value.startsWith('--'))throw Error('option');
        options[option==='--root'?'root':'privateDenylist']=value;
      }else if(args[i]==='--json')json=true;
      else throw Error('option');
    }
    const result=auditRelease(options);
    if(json)process.stdout.write(JSON.stringify(result,null,2)+'\n');
    else {
      process.stdout.write(`Release audit: ${result.ok?'PASS':'FAIL'}; ${result.files} files; ${result.bytes}/${result.limitBytes} bytes\n`);
      for(const issue of result.failures)process.stdout.write(`${issue.code}: ${issue.file}${issue.line?`:${issue.line}`:''}\n`);
    }
    process.exitCode=result.ok?0:1;
  }catch {
    // Error objects/stacks may contain the caller's machine path. Keep CLI failure output generic.
    process.stderr.write('Release audit could not complete; check options and file access.\n');process.exitCode=1;
  }
}
