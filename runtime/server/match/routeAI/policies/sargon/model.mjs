// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted 2026-10-27 from sargon.mjs without changing declaration bodies or policy order. See provenance.json.
import {pieceBonds} from "../../../bondsMeta.js";


export const SARGON58='sargonShip';

export const DEFAULT_SARGON58=Object.freeze({name:'v0.12',maxSteps:200,maxRefreshes:20,
 upgradeRounds:[0,0,2,4,6,8,10],survivalHp:10,previewCandidates:5});

export const IDS58=Object.freeze({estelle:'chess_char_1_12_a',sedge:'chess_char_2_06_a',bubble:'chess_char_2_08_a',
 minimal:'chess_char_3_13_a',titi:'chess_char_5_02_a',gavial:'chess_char_5_18_a',passenger:'chess_char_6_05_a',
 pepe:'chess_char_6_06_a',rosmontis:'chess_char_6_12_a',civilight:'chess_char_5_09_a'});

export const own=p=>[...p.board,...p.hand,...p.temp].filter(u=>u?.kind==='chess');

export const loose=p=>[...p.hand,...p.temp].filter(u=>u?.kind==='item');

export const core=(gd,u)=>pieceBonds(gd,u).includes(SARGON58);

export const base=(gd,u)=>gd.baseIdOf(u.id);

export const healer=(gd,u)=>gd.chess(u.id)?.attackKind==='heal';

export const blocker=(gd,u)=>gd.chess(u.id)?.position==='MELEE'&&(gd.chess(u.id)?.stats?.blockCnt||0)>=2;

export const bond=(p,id)=>p.bonds.find(b=>b.bondId===id);

export const tea=(gd,u)=>(u.items||[]).some(i=>gd.item(i.id)?.giveBondId===SARGON58);

export const compass=(gd,u)=>(u.items||[]).some(i=>gd.item(i.id)?.name==='黄沙罗盘');

export const investors=(gd,p)=>new Set([...p.board,...p.hand].filter(u=>u?.kind==='chess'&&pieceBonds(gd,u).includes('investShip')).map(u=>base(gd,u)));
