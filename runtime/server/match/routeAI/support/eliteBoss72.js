// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Preserve the supplier's selected formation as the control for our optional pair-safe boss repair.
import {LayoutPlan} from "../../bot.js";
import {planBoss47} from "./kjerag-boss57.mjs";
export function repairBossJob72(m,ps,job){
 if(m.opts?.requireCs||m.opts?.modded||m.wave||![m.gd.bossRound,m.gd.hiddenRound].includes(m.round)||!m.bossGroupOf(ps))return job;
 const chosen=job?.chosen||[...ps.board.values()].filter(u=>u.kind==='chess');if(!chosen.length)return job;
 const base=new LayoutPlan(job?.best||[...ps.board].filter(([,u])=>u.kind==='chess').map(([k,u])=>[u.uid,k]));
 base.dirs=new Map(job?.best?.dirs||chosen.map(u=>[u.uid,u.dir||'RIGHT']));
 const result=planBoss47(m,ps,ps.privateView(),chosen,{basePlan:base,maxCandidates:3}),receipt=result?.receipt;
 if(!receipt?.candidates?.length)return job;
 ps._botArturiaBoss72={...receipt,supplierBaseline:true};
 // planBoss57 compares complete native fields and preserves the exact baseline
 // on error/incomplete projection or when no safe improvement is established.
 if(receipt.selected===0||!result?.plan)return job;
 return {chosen,plans:[base,result.plan],best:result.plan,bestIndex:1,done:true,outcomes:[],repair72:ps._botArturiaBoss72};
}
