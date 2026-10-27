// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from kjerag.mjs without changing declaration bodies or policy order. See provenance.json.
import {pieceBonds} from "../../../bondsMeta.js";

export const CORE47='kjeragShip';

export const IDS47=Object.freeze({tank:'chess_char_1_02_a',medic:'chess_char_2_05_a',pram:'chess_char_3_14_a',
  gnosis:'chess_char_4_13_a',silver:'chess_char_4_22_a',arc:'chess_char_3_21_a',sa:'chess_char_5_14_a',
  halo:'chess_char_6_16_a',bell:'chess_char_6_02_a',degen:'chess_char_6_19_a',
  tin:'chess_char_2_19_a',swire:'chess_char_3_04_a',mountain:'chess_char_5_17_a',
  flame:'chess_char_4_19_a',minimal:'chess_char_3_13_a',mumu:'chess_char_6_11_a',dusk:'chess_char_5_12_a',
  ptil:'chess_char_4_21_a',cliff:'chess_char_3_02_a'});

export const DIRS=['RIGHT','UP','DOWN','LEFT'];

export const own=p=>[...p.board,...p.hand,...p.temp].filter(x=>x?.kind==='chess');

export const loose=p=>[...p.hand,...p.temp].filter(x=>x?.kind==='item');

export const base=(gd,p)=>gd.baseIdOf(p.id);

export const is=(gd,p,id)=>base(gd,p)===id;

export const hasCore=(gd,p)=>pieceBonds(gd,p).includes(CORE47);

export const heal=(gd,p)=>gd.chess(p.id)?.attackKind==='heal'||['塞雷娅','古米','黍','瑕光'].includes(gd.chess(p.id)?.name);

export const block=(gd,p)=>gd.chess(p.id)?.position==='MELEE'&&(gd.chess(p.id)?.stats?.blockCnt||0)>=2;

export const rangedDamage=(gd,u)=>gd.chess(u.id)?.position==='RANGED'&&!heal(gd,u)&&gd.chess(u.id)?.attackKind!=='none';

export const coreOf=p=>(p.bonds||[]).find(b=>b.bondId===CORE47);

export const DEFAULT_POLICY47=Object.freeze({name:'v8.9',upgradeRounds:[0,0,2,4,5,6,10],maxSteps:300,
  maxRefreshes:24,layerWeight:0.7,layoutPasses:2,mergeHunt:true,reachableUpgradeBudget:true,maxUpgradeSales:2,
  narrowBridge:true,visibleProjectBeforeUpgrade:true,rehearsalCandidates:3,survivalHp:10,
  previewLpBudget:true,plannedPreviewTrade:2,localRankerGuard:true,
  investorProject:true,acquisitionCycles:true,maxCycles:24,freezeExposureWeight:12,
  targetKjerag:300,targetSkillful:100,conversionReserve:true,retainArchetto:true});
