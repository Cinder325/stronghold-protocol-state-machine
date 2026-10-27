#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Friendly frontend to the unchanged hash-checked installer. No downloads or host checkout changes.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {installAddon,uninstallAddon,installerCliFailure} from './install.mjs';

export async function setupAddon({action='install',target=null,root,ask,log=console.log}={}){
 if(!['install','uninstall'].includes(action))throw Error('Unknown setup action.');
 log('Stronghold Protocol: coordinated teammate AI / 卫戍协议协同队友AI');
 log('Close the game server first. / 请先关闭游戏服务器。');
 let folder=target??await ask('Game folder (empty = cancel) / 游戏文件夹（留空取消）: ');
 folder=String(folder).trim();
 // Folder drops/pastes commonly arrive quoted; never turn user input into a shell command.
 if(folder.length>1&&['"',"'"].includes(folder[0])&&folder.at(-1)===folder[0])folder=folder.slice(1,-1);
 if(!folder){log('Cancelled / 已取消');return {status:'cancelled'};}
 const run=action==='install'?installAddon:uninstallAddon,options={target:folder,...(root?{root}:{})};
 const plan=run({...options,dryRun:true});
 log(JSON.stringify(plan,null,2));
 if(['already-installed','not-installed'].includes(plan.status))return plan;
 const answer=await ask('Apply this plan? [y/N] / 执行以上变更？[y/N]: ');
 if(!/^(?:y|yes)$/i.test(String(answer).trim())){log('Cancelled / 已取消');return {status:'cancelled'};}
 const result=run(options);log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 let rl;
 try{
  const args=process.argv.slice(2);let action='install';
  if(args.length){if(args.length!==2||args[0]!=='--action'||!['install','uninstall'].includes(args[1]))throw Error('Use --action install or --action uninstall.');action=args[1];}
  rl=createInterface({input:process.stdin,output:process.stdout});await setupAddon({action,ask:q=>rl.question(q)});
 }catch(error){installerCliFailure(error);}finally{rl?.close();}
}
