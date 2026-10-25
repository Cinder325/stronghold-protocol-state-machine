// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Research-only roster repair before actual withdrawals/sales. Preview battles are
// detached native current-wave estimates, never actual recorded battles or settlement.
import { computeBonds, pieceBonds } from "../../bondsMeta.js";
import { canPlace, legalTiles, parseKey, placeClass } from "../../board.js";
import { createRehearsal, LayoutPlan, LAYOUT_PARAMS, planLayout } from "../../bot.js";
import assert from 'node:assert/strict';
import {forecastLayerGains} from "./layerForecast.js";
import {rotateOffset} from "../../../sim/dir.js";
import {normalPreviewOptions48} from "./kjerag-preview48.mjs";

const K = 'kjeragShip', SKILL = 'skillfulShip';
const WHITE = 'chess_char_4_21_a', ARCHE = 'chess_char_3_21_a', HALO = 'chess_char_6_16_a';
const STREAMS = ['rngSetup', 'rngShop', 'rngWaves', 'rngDraft', 'rngBots', 'rngMeta'];
const dirs = ['RIGHT', 'UP', 'DOWN', 'LEFT'];
const opposite={RIGHT:'LEFT',LEFT:'RIGHT',UP:'DOWN',DOWN:'UP'};
const weights={kjeragShip:1,skillfulShip:1.5,arcaneShip:2};
const weighted=gains=>Object.entries(gains||{}).reduce((n,[id,gain])=>n+gain*(weights[id]||0),0);
const base = (gd, u) => gd.baseIdOf(u.id);
const healer = (gd, u) => gd.chess(u.id)?.attackKind === 'heal'||['塞雷娅','古米','黍','瑕光'].includes(gd.chess(u.id)?.name);
const core = (gd, u) => pieceBonds(gd, u).includes(K);
const strength = (gd, u) => {
  const r = gd.chess(u.id), s = r?.stats || {};
  return (r?.tier || 1) * 5 + (gd.isGolden(u.id) ? 35 : 0) + (u.items?.length || 0) * 5
    + (s.atk || 0) / 50 + (s.def || 0) / 100;
};
const rosterKey = units => units.map(u => u.uid).sort((a, b) => a - b).join(',');

function rosterValue(gd, units) {
  const k = new Set(units.filter(u => core(gd, u)).map(u => base(gd, u))).size;
  const whites = units.filter(u => base(gd, u) === WHITE).length;
  const heals = units.filter(u => healer(gd, u));
  return Math.min(6, k) * 45 + (k >= 6 ? 300 : k >= 3 ? 80 : 0)
    + (heals.length ? 80 + Math.max(...heals.map(u => strength(gd, u))) : 0)
    + (units.some(u => base(gd, u) === ARCHE) ? 110 : 0)
    + (whites ? 80 : 0) - Math.max(0, whites - 1) * 180
    + units.reduce((sum, u) => sum + strength(gd, u), 0);
}

// Reconstruct only the containers a real roster swap would leave. Preserve every
// owned asset, including old board bodies no longer selected; temp never activates
// BOARD_AND_DECK bonds. No live player or native rules are changed.
function rosterPlayer(ps, units) {
  const copy = Object.create(ps), selected = new Set(units.map(u => u.uid));
  copy._botRangeRecs=new Map(ps._botRangeRecs||[]);
  copy.hand = structuredClone(ps.hand.map(u => u && selected.has(u.uid) ? null : u));
  copy.temp = structuredClone(ps.temp.map(u => u && selected.has(u.uid) ? null : u));
  for (const u of ps.board.values()) if (u.kind === 'chess' && !selected.has(u.uid)) {
    let idx = copy.hand.findLastIndex(v => v == null);
    if (idx >= 0) copy.hand[idx] = structuredClone(u);
    else {
      idx = copy.temp.findIndex(v => v == null);
      if (idx < 0) copy.temp.push(structuredClone(u)); else copy.temp[idx] = structuredClone(u);
    }
  }
  return copy;
}

function preservedPlan(ps, p, units, fallback) {
  const out = new LayoutPlan(), used = new Set(), remaining = [];
  for (const u of units) {
    const current = p.board.find(v => v.uid === u.uid);
    if (!current) { remaining.push(u); continue; }
    const key = `${current.row},${current.col}`;
    out.set(u.uid, key); out.dirs.set(u.uid, current.dir || 'RIGHT'); used.add(key);
  }
  const old = p.board.filter(u => u.kind === 'chess' && !units.some(v => v.uid === u.uid));
  for (const u of remaining) {
    const cls = placeClass(ps, ps.gd.chess(u.id));
    const fromOld = old.find(v => !used.has(`${v.row},${v.col}`) && canPlace(ps.deployMap(), cls, v.row, v.col));
    const preferred = fromOld ? [fromOld.row, fromOld.col] : fallback.has(u.uid) ? parseKey(fallback.get(u.uid)) : null;
    const tile = preferred && !used.has(preferred.join(',')) && canPlace(ps.deployMap(), cls, ...preferred)
      ? preferred : legalTiles(ps.deployMap(), cls).find(t => !used.has(t.join(',')));
    if (!tile) continue;
    const key = tile.join(','); out.set(u.uid, key); used.add(key);
    out.dirs.set(u.uid, fromOld?.dir || fallback.dirOf(u.uid));
  }
  return out;
}

function projectedGrowth(m,ps,units,plan){
  const copy=rosterPlayer(ps,units),views=new Map(units.filter(u=>plan.has(u.uid)).map(u=>{
    const [row,col]=parseKey(plan.get(u.uid));return [u.uid,{...u,row,col,dir:plan.dirOf(u.uid)}];
  }));
  const board=new Map([...views.values()].map(u=>[`${u.row},${u.col}`,u]));
  const bonds=computeBonds(ps.gd,{board,hand:copy.hand,layers:ps.layers,m});
  return forecastLayerGains(m,copy,{board,hand:copy.hand,views,bonds},{bondWeights:weights,nextStartWeight:1});
}

// Both copied-forward and face-to-face relations are candidates; their real
// current-wave cost is measured below, never assumed harmless from geometry.
function growthLayout(m,ps,units,seed){
  const whites=units.filter(u=>base(ps.gd,u)===WHITE),arches=units.filter(u=>base(ps.gd,u)===ARCHE);
  let best=null,score=-Infinity;
  for(const white of whites)for(const arc of arches){
    if(!seed.has(white.uid)||!seed.has(arc.uid))continue;
    const [ar,ac]=parseKey(seed.get(arc.uid));
    for(const dir of dirs){
      const [dr,dc]=rotateOffset(0,1,dir),r=ar-dr,c=ac-dc,key=`${r},${c}`,old=seed.get(white.uid);
      if(!canPlace(ps.deployMap(),placeClass(ps,ps.gd.chess(white.id)),r,c))continue;
      const other=units.find(u=>u.uid!==white.uid&&seed.get(u.uid)===key);
      if(other&&!canPlace(ps.deployMap(),placeClass(ps,ps.gd.chess(other.id)),...parseKey(old)))continue;
      for(const arcDir of [seed.dirOf(arc.uid),opposite[dir]]){
        const trial=new LayoutPlan(seed);trial.dirs=new Map(seed.dirs);
        trial.set(white.uid,key);trial.dirs.set(white.uid,dir);trial.dirs.set(arc.uid,arcDir);
        if(other)trial.set(other.uid,old);
        const n=projectedGrowth(m,ps,units,trial).forecasts.reduce((sum,f)=>sum+weighted(f.gains),0);
        if(n>score){best=trial;score=n;}
      }
    }
  }
  return best;
}

export function chooseTacticalRoster47(m, ps, p, initial, { note = () => {}, maxCandidates = 8 } = {}) {
  const gd = ps.gd || m.gd, owned = ps.allChess(), byUid = new Map(owned.map(u => [u.uid, u]));
  const first = [...new Set(initial.map(u => u.uid))].map(uid => byUid.get(uid)).filter(Boolean).slice(0, ps.deployCap);
  const receipt = { kind: 'isolated-current-wave-native-roster-preview', settled: false,
    contract: 'Actually owned bodies; at most two substitutions. Independent current-wave estimates before unknown teammate rescue; no future draws, grants or item assumptions.',
    candidates: [], selected: 0, realPrivateUnchanged: false, sixRngStreamsUnchanged: false };
  const before = JSON.stringify(ps.privateView()), rngBefore = STREAMS.map(k => m[k]?.state?.());
  const lm = Object.create(m); lm.rngBots = () => 0.5; lm._botPath = null;
  const layoutPs=Object.create(ps);layoutPs._botRangeRecs=new Map(ps._botRangeRecs||[]);
  let winner = { chosen: first, plan: planLayout(lm, layoutPs, first), receipt };
  try {
    if (!m.wave || m.round >= gd.bossRound || first.length === 0) {
      receipt.abstention = 'No current normal wave available'; return winner;
    }
    const bench = owned.filter(u => !first.some(v => v.uid === u.uid));
    const pool = new Map(), add = (name, units) => {
      if (units.length !== first.length || new Set(units.map(u => u.uid)).size !== units.length) return;
      const key = rosterKey(units);
      if (!pool.has(key)) pool.set(key, { name, units, value: rosterValue(gd, units) });
    };
    add('initial', first);
    for (let i = 0; i < first.length; i++) for (const incoming of bench) {
      if (!healer(gd, incoming) && !core(gd, incoming)) continue;
      const trial = first.slice(); trial[i] = incoming; add('single-role-or-core-repair', trial);
    }
    for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) {
      for (let a = 0; a < bench.length; a++) for (let b = a + 1; b < bench.length; b++) {
        if (![bench[a], bench[b]].every(u => core(gd, u) || healer(gd, u))) continue;
        const trial = first.slice(); trial[i] = bench[a]; trial[j] = bench[b];
        // Preserve an existing Archetto engine unless it is itself part of a
        // surplus pair. Actual battle evaluation still decides survival.
        if (first.some(u => base(gd, u) === ARCHE) && !trial.some(u => base(gd, u) === ARCHE)) continue;
        add('two-body-defensive-core-repair', trial);
      }
    }
    const candidates = [pool.get(rosterKey(first))], ordered = [...pool.values()]
      .filter(c => rosterKey(c.units) !== rosterKey(first)).sort((a, b) => b.value - a.value || rosterKey(a.units).localeCompare(rosterKey(b.units)));
    const push = c => { if (c && !candidates.includes(c) && candidates.length < Math.max(1, maxCandidates)) candidates.push(c); };
    // Ensure the single elite-healer repair is tested even if an attractive
    // six-core combination would otherwise occupy every search slot.
    const extraWhite = first.filter(u => base(gd, u) === WHITE).length > 1;
    if (extraWhite) {
      const strongest = bench.filter(u => healer(gd, u)).sort((a, b) => strength(gd, b) - strength(gd, a))[0];
      push(ordered.find(c => c.name === 'single-role-or-core-repair' && strongest
        && c.units.some(u => u.uid === strongest.uid) && c.units.filter(u => base(gd, u) === WHITE).length === 1));
      push(ordered.find(c => c.units.filter(u => base(gd, u) === WHITE).length === 1 && !c.units.some(u => base(gd, u) === HALO)));
      push(ordered.find(c => c.units.filter(u => base(gd, u) === WHITE).length === 0));
    }
    for (const c of ordered) push(c);
    const evaluated = [];
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index], previewPs = rosterPlayer(ps, candidate.units);
      const normal = planLayout(lm, layoutPs, candidate.units);
      const growth=growthLayout(m,layoutPs,candidate.units,normal);
      const plans = [preservedPlan(ps, p, candidate.units, normal),...(growth?[growth]:[]),normal,
        planLayout(lm, layoutPs, candidate.units, { ...LAYOUT_PARAMS, hold: 8, healHold: 1 })];
      // Native createRehearsal needs two distinct plans. Rotate a legal unit in
      // place when all planner variants happen to be identical.
      const alternate = new LayoutPlan(plans[0]); alternate.dirs = new Map(plans[0].dirs);
      if (candidate.units[0]) alternate.dirs.set(candidate.units[0].uid,
        dirs[(dirs.indexOf(alternate.dirOf(candidate.units[0].uid)) + 1) % dirs.length]);
      plans.push(alternate);
      const built = [],preparations=[];
      lm.botRehearsal = 5;
      lm._normalOpts=(copy,options)=>{const projected=normalPreviewOptions48(m,copy,options);
        preparations.push(projected.receipt);return projected.opts;};
      lm.newBattle = (opts, flags) => { const b = m.newBattle(opts, { ...flags, preview: true }); built.push(b); return b; };
      const row = { index, name: candidate.name, rosterUIDs: candidate.units.map(u => u.uid),
        rosterNames: candidate.units.map(u => gd.chess(u.id)?.name), results: [] };
      receipt.candidates.push(row);
      let job;
      try { job = createRehearsal(lm, previewPs, candidate.units, plans); }
      catch (error) { row.error = String(error.message || error); continue; }
      if (!job) { row.error = 'No two distinct legal native layouts'; continue; }
      for (let pi = 0; pi < built.length; pi++) {
        const battle = built[pi]; let ticks = 0;
        while (!battle.finished && ticks++ < job.cap) battle.step();
        const finished = battle.finished;
        if (!finished) battle.forceEnd('timeout');
        const result = battle.result(), own = result.perPlayer?.[ps.playerId], gains = own?.layerGains || {};
        const leaks = own?.leaked?.filter(l => l.counted !== false).length;
        const cappedLoss = Number.isFinite(leaks) ? Math.min(gd.lpCapPerRound, leaks) : null;
        const board = new Map([...job.plans[pi]].map(([uid, key]) => [key, byUid.get(uid)]));
        const bonds = computeBonds(gd, { board, hand: previewPs.hand, layers: ps.layers, m });
        const forecast=projectedGrowth(m,layoutPs,candidate.units,job.plans[pi]);
        const finishGrowth=forecast.forecasts.find(f=>f.event==='SERVER_PREP_FIN')?.gains||{};
        const nextGrowth=forecast.forecasts.find(f=>f.event==='SERVER_PREP_START')?.gains||{};
        const survives=Number.isFinite(cappedLoss)&&p.lp>cappedLoss;
        const futureWeight=p.lp>gd.lpCapPerRound+2?Math.min(3,gd.bossRound-m.round):1;
        const record = { layoutIndex: pi, finished, errors: result.errors,
          plan: [...job.plans[pi]].map(([uid, key]) => ({ uid, key, dir: job.plans[pi].dirOf(uid) })),
          nativeResult: own || null, countedLeaks: leaks ?? null, cappedLoss,
          preparationProjection:preparations[pi],
          ownLossSurvives: survives,
          conditionalPrepGrowth:forecast,
          futureWeight,futureWeightMeaning:'Value multiplier of one conditional next-start projection; repeated future rosters not guaranteed',
          growthScore:weighted(gains)+weighted(finishGrowth)+(survives?weighted(nextGrowth)*futureWeight:0),
          core: bonds[K], skillful: bonds[SKILL] };
        row.results.push(record);
        if (finished && result.errors === 0 && Number.isFinite(leaks)) evaluated.push({
          ...record, candidateIndex: index, chosen: candidate.units, plan: job.plans[pi], value: candidate.value });
      }
    }
    if (!evaluated.length) { receipt.abstention = 'No finished error-free native preview'; return winner; }
    const survivors = evaluated.filter(c => c.ownLossSurvives), safe = survivors.length ? survivors : evaluated;
    const minimum = Math.min(...safe.map(c => c.cappedLoss));
    const budget = survivors.length && minimum <= 2 && p.lp > gd.lpCapPerRound + 2 ? 2 : 0;
    const eligible = safe.filter(c => c.cappedLoss <= minimum + budget);
    eligible.sort((a, b) => survivors.length
      ? b.growthScore - a.growthScore || a.cappedLoss - b.cappedLoss || a.countedLeaks - b.countedLeaks
        || b.value - a.value || a.candidateIndex - b.candidateIndex || a.layoutIndex - b.layoutIndex
      : a.cappedLoss - b.cappedLoss || a.countedLeaks - b.countedLeaks || b.growthScore - a.growthScore
        || b.value - a.value || a.candidateIndex - b.candidateIndex || a.layoutIndex - b.layoutIndex);
    const best = eligible[0];
    receipt.selected = best.candidateIndex; receipt.selectedLayout = best.layoutIndex;
    receipt.selection = { ownLossSurvives: best.ownLossSurvives, countedLeaks: best.countedLeaks,
      cappedLoss: best.cappedLoss, growthScore: best.growthScore, minimumCappedLoss: minimum, plannedTradeBudget: budget };
    winner = { chosen: best.chosen, plan: best.plan, receipt };
    return winner;
  } finally {
    receipt.realPrivateUnchanged = JSON.stringify(ps.privateView()) === before;
    receipt.sixRngStreamsUnchanged = JSON.stringify(STREAMS.map(k => m[k]?.state?.())) === JSON.stringify(rngBefore);
    assert(receipt.realPrivateUnchanged&&receipt.sixRngStreamsUnchanged,'Tactical roster preview changed live state or RNG');
    note('fsm-tactical-roster-preview47', receipt);
  }
}
