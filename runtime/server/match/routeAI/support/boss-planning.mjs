// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Conditional boss-field planning only. Detached native combat uses the actual current
// pair/wave and frozen teammate board; other fields and later teammate edits are unknown.
import { GEO } from "../../../../shared/constants.js";
import assert from 'node:assert/strict';
import { computeBonds, pieceBonds } from "../../bondsMeta.js";
import { canPlace, legalTiles, parseKey, placeClass } from "../../board.js";
import { LayoutPlan, LAYOUT_PARAMS, fieldModel, layoutValue, planLayout, rangeRec, rangeTiles } from "../../bot.js";
import { previewPlayer } from "../../preview.js";
import {projectPrepEnd48} from "./kjerag-preparation.mjs";
import { bossFieldPlacement, bossPoolHp, SharedBossPool } from "../../finalAssault.js";
import { bountySpawns } from "../../waves.js";
import { deriveSeed } from "../../../sim/rng.js";
import { bodyInRange } from "../../../sim/body.js";
import { SELF_BOUND } from "../../../sim/content/bosses.js";
import {bossFormationProposals57,healingCoverage57,chooseBossCandidate57} from "./healing-coverage.mjs";

const STREAMS = ['rngSetup', 'rngShop', 'rngWaves', 'rngDraft', 'rngBots', 'rngMeta'];
const DIRECTIONS = ['RIGHT', 'UP', 'DOWN', 'LEFT'];
const copyPlan = p => { const q = new LayoutPlan(p); q.dirs = new Map(p.dirs || []); return q; };
const damageWeight = (gd, u) => {
  const r = gd.chess(u.id), s = r?.stats || {};
  return r?.attackKind === 'heal' ? 0.3 * (s.atk || 0) / (s.bat || 1) : (s.atk || 0) / (s.bat || 1);
};

/** Native Skillful membership, same-owner aura union: diagonals start at the actual threshold. */
export function bossAura47(gd, p, chosen, plan) {
  const bond = (p.bonds || []).find(b => b.bondId === 'skillfulShip');
  if (!bond?.active) return { active: false, wide: false, coveredUIDs: [], weightedCoverage: 0 };
  const wide = bond.layers >= (gd.bond('skillfulShip')?.bb?.power_bond_stack_cnt ?? 40);
  const members = chosen.filter(u => pieceBonds(gd, u).includes('skillfulShip') && plan.has(u.uid));
  const covered = chosen.filter(u => plan.has(u.uid) && members.some(v => {
    const [r, c] = parseKey(plan.get(u.uid)), [vr, vc] = parseKey(plan.get(v.uid));
    return wide ? Math.max(Math.abs(r - vr), Math.abs(c - vc)) <= 1 : Math.abs(r - vr) + Math.abs(c - vc) <= 1;
  }));
  return { active: true, wide, layers: bond.layers, coveredUIDs: covered.map(u => u.uid),
    weightedCoverage: covered.reduce((sum, u) => sum + damageWeight(gd, u), 0) };
}

function legalPlan(ps, chosen, plan) {
  const used = new Set();
  return chosen.every(u => {
    const k = plan.get(u.uid); if (!k || used.has(k)) return false; used.add(k);
    return canPlace(ps.deployMap(), placeClass(ps, ps.gd.chess(u.id)), ...parseKey(k));
  });
}

function detachedPlayer(m, ps, board) {
  const copy = previewPlayer(ps, board), deployed = new Set([...board.values()].map(u => u.uid));
  for (const u of ps.board.values()) if (u.kind === 'chess' && !deployed.has(u.uid)) {
    const i = copy.hand.findLastIndex(v => v == null);
    if (i >= 0) copy.hand[i] = structuredClone(u); else copy.temp.push(structuredClone(u));
  }
  copy.layers = { ...ps.layers };
  copy.bonds = computeBonds(ps.gd, copy);
  const projected=projectPrepEnd48(m,copy,{board:copy.board});
  return {copy:projected.player,forecast:projected.receipt};
}

export function planBoss47(m, ps, p, chosen, { basePlan = null, note = () => {}, maxCandidates = 8 } = {}) {
  if (m.round !== m.gd.bossRound && m.round !== m.gd.hiddenRound) return null;
  const group = m.bossGroupOf(ps); if (!group?.wave) return null;
  const gd = ps.gd || m.gd, before = JSON.stringify(m.order.map(s => s.privateView()));
  const rngBefore = STREAMS.map(k => m[k]?.state?.());
  const stockBefore = JSON.stringify([[...m.pool.entries], [...m.itemPool.debt]]);
  const lm = Object.create(m); lm.rngBots = () => 0.5; lm._botPath = null; lm.wave = null;
  const initial = basePlan && legalPlan(ps, chosen, basePlan) ? copyPlan(basePlan) : planLayout(lm, ps, chosen);
  const receipt = { kind: 'conditional-native-paired-boss-preview', settled: false, round: m.round,
    bossId: m.round === gd.hiddenRound ? m.hiddenBossId : m.bossId, pair: [...group.players], side: group.side,
    battleLayersValued: false, candidates: [], selected: 0,
    limitations: ['Teammate board/loadout frozen at this call; later teammate decisions are unknown.',
      'Independent boss pool: other fields damage and LP loss are excluded; this is not the final team outcome.',
      'Only supported deterministic PREP_FIN handlers are projected; preparation unsupported effects remain explicit. No future gains, shops or items assumed.'] };
  let result = { plan: initial, receipt };
  try {
    const model = fieldModel(lm, ps), norm = Math.max(1, model.routes.reduce((s, r) => s + r.n, 0));
    const staticSpawns = group.wave.spawns.filter(s => s.tag === 'boss' && SELF_BOUND.includes(s.enemyKey));
    const staticContact = plan => chosen.reduce((sum, u) => {
      if (!plan.has(u.uid)) return sum;
      const [row, col] = parseKey(plan.get(u.uid)), rec = rangeRec(ps, gd.chess(u.id));
      const field = bossFieldPlacement(group.side, row, col, plan.dirOf(u.uid));
      const keys = rangeTiles(rec, field.row, field.col, field.dir).map(k => { const [r, c] = parseKey(k); return r * 21 + c; });
      const hits = staticSpawns.some(s => {
        const route = group.wave.routes[s.routeIndex], start = route?.start; if (!start) return false;
        const enemy = m.ds.getEnemy(s.enemyKey), x = group.side === 'R' ? 20 - start[1] : start[1];
        return bodyInRange({ x, y: start[0], hitArea: enemy?.hitArea || null }, keys);
      });
      return sum + (hits ? damageWeight(gd, u) : 0);
    }, 0);
    const objective = (plan, auraWeight = 1, contactWeight = 1) => layoutValue(lm, ps, chosen, plan) / norm * 100
      + bossAura47(gd, p, chosen, plan).weightedCoverage * 0.035 * auraWeight
      + staticContact(plan) * 0.05 * contactWeight;
    const improve = (seed, auraWeight, contactWeight) => {
      let best = copyPlan(seed), score = objective(best, auraWeight, contactWeight);
      for (const u of chosen) {
        let winner = best, high = score;
        for (const [r, c] of legalTiles(ps.deployMap(), placeClass(ps, gd.chess(u.id)))) {
          const key = `${r},${c}`, old = best.get(u.uid), other = chosen.find(v => v.uid !== u.uid && best.get(v.uid) === key);
          if (other && (!old || !canPlace(ps.deployMap(), placeClass(ps, gd.chess(other.id)), ...parseKey(old)))) continue;
          for (const dir of DIRECTIONS) {
            const trial = copyPlan(best); trial.set(u.uid, key); trial.dirs.set(u.uid, dir);
            if (other) trial.set(other.uid, old);
            const n = objective(trial, auraWeight, contactWeight);
            if (n > high + 0.001) { winner = trial; high = n; }
          }
        }
        best = winner; score = high;
      }
      return best;
    };
    const structural=bossFormationProposals57(m,ps,chosen,initial,{maxCandidates:4});
    receipt.structuralCandidates=structural.map(r=>({kind:r.kind,healing:r.healing}));
    const raw = [initial,...structural.map(r=>r.plan), planLayout(lm, ps, chosen),
      planLayout(lm, ps, chosen, { ...LAYOUT_PARAMS, hold: 8, healHold: 1 }),
      improve(initial, 1, 3), improve(initial, 3, 1), improve(initial, 2, 2)];
    for (const u of chosen.slice().sort((a, b) => damageWeight(gd, b) - damageWeight(gd, a)).slice(0, 2)) {
      for (const dir of DIRECTIONS) {
        const facing = copyPlan(initial); facing.dirs.set(u.uid, dir); raw.push(facing);
      }
    }
    const seen = new Set(), plans = raw.filter(plan => {
      const sig = JSON.stringify([...plan].map(([uid, key]) => [uid, key, plan.dirOf(uid)]).sort((a, b) => a[0] - b[0]));
      if (!legalPlan(ps, chosen, plan) || seen.has(sig)) return false; seen.add(sig); return true;
    }).slice(0, Math.max(1, maxCandidates));
    const groupIndex = m.bossWaves.findIndex(g => g.players.join() === group.players.join());
    const fieldId = `b${groupIndex + 1}`, bossId = receipt.bossId;
    const alive = m.alivePlayers(), teamLp = m.teamLp ?? alive.reduce((sum, s) => sum + s.lp, 0);
    const hp = bossPoolHp(gd, bossId, alive.length);
    const overtime = m.order.some(s => s.isBot && !s.left) && m.order.filter(s => !s.left).length > 1
      ? gd.bossOvertimeAfterReal : gd.bossLevelTime(m.round) || gd.bossOvertimeAfterReal;
    const cap = Math.ceil((overtime + teamLp / Math.max(0.01, gd.bossOvertimeDrainReal) + 5) * gd.combatTimeScale * 30);
    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index], pool = new SharedBossPool(hp), wave = structuredClone(group.wave);
      const prepForecasts = [], spawns = wave.spawns.map(s => ({ ...s }));
      // Native bossRounds collects every player's bounties before either player's hook.
      for(const [sideIndex,id] of group.players.entries()){
        const real=m.players.get(id),side=sideIndex===0?'L':'R';
        spawns.push(...bountySpawns(gd,m.round,wave,real.bounties,id,{solo:m.isSolo,side:group.players.length>1?side:null}));
      }
      const inputs = group.players.map((id, sideIndex) => {
        const real = m.players.get(id), board = id === ps.playerId
          ? new Map([...plan].map(([uid, key]) => [key, { ...chosen.find(u => u.uid === uid), dir: plan.dirOf(uid) }])) : real.board;
        const { copy, forecast } = detachedPlayer(m, real, board); prepForecasts.push({ playerId: id, forecast });
        const side = sideIndex === 0 ? 'L' : 'R';
        const input = copy.battleInput({ side, colOffset: sideIndex === 0 ? 0 : 8 }); input.lpForBoss = teamLp;
        const ev = { input, kind: m.round === gd.hiddenRound ? 'hidden' : 'boss', round: m.round,
          spawns, routes: wave.routes, side: group.players.length > 1 ? side : null, preview: true };
        m.dispatcher.dispatch(copy, 'onBattleStart', ev);
        // The isolated dispatcher clones its event; retain its detached spawn
        // edits for the next player's hook, as the live paired field does.
        if (ev.spawns !== spawns) spawns.splice(0, spawns.length, ...ev.spawns);
        return ev.input;
      });
      const battle = m.newBattle({ seed: deriveSeed(m.seed, `${fieldId}:${m.round}`),
        kind: m.round === gd.hiddenRound ? 'hidden' : 'boss', modeId: m.modeId, round: m.round,
        stageId: m.stageId, rect: { ...GEO.BOSS_RECT }, timeLimit: Infinity, players: inputs,
        spawns: m._sanitizeSpawns(spawns), routes: wave.routes, sharedBoss: pool,
        flags: { layerGainsEnabled: false, ...gd.dp, enemyScale: gd.enemyScale(m.round) },
        fieldId: `boss-preview47:${fieldId}`, enemyOverrides: wave.overrides, waveId: wave.templateId, bossId }, { preview: true });
      let lost = 0, ticks = 0;
      battle.on('enemyLeak', ({ enemy }) => { lost += Math.max(0, enemy?.lpr ?? 1); });
      battle.on('lpLoss', ({ amount }) => { lost += Math.max(0, Number(amount) || 0); });
      while (!battle.finished && ticks++ < cap) {
        battle.step();
        if (pool.hp <= 0 || teamLp - lost - gd.bossOvertimeDue(battle.time, overtime) <= 0) { battle.forceEnd('forced'); break; }
      }
      const budgetExhausted = !battle.finished;
      if (budgetExhausted) battle.forceEnd('timeout');
      const native = battle.result(), own = native.perPlayer?.[ps.playerId];
      const testedBonds = inputs.find(input => input.playerId === ps.playerId)?.bonds || {};
      const testedView = { ...p, bonds: Object.entries(testedBonds).map(([bondId, b]) => ({ bondId, ...b })) };
      receipt.candidates.push({ index, plan: [...plan].map(([uid, key]) => ({ uid, key, dir: plan.dirOf(uid) })),
        aura: bossAura47(gd, testedView, chosen, plan), auraBeforePrepFin: bossAura47(gd, p, chosen, plan),
        healing:healingCoverage57(ps,chosen,plan),
        prepForecasts, budgetExhausted, errors: native.errors,
        duration: battle.time, poolHpLeft: pool.hp, pairRemainingLp: teamLp - lost - gd.bossOvertimeDue(battle.time, overtime),
        ownBossDamage: own?.bossDamage || 0, ownDeaths: own?.deaths || 0, nativeResult: own,
        unitSurvivors: own?.unitsEnd?.filter(u => u.alive).length || 0,
        nativeAggroStartupRule: 'Geometry deployment order; highest-DEF/special boss targeting remains native, never overridden.' });
    }
    const selected=chooseBossCandidate57(receipt.candidates);
    receipt.selectionRule='Completed same-pair previews: preserve baseline conditional LP, minimize paired boss HP, then LP/survivors/healing. Own damage is diagnostic only.';
    if (selected!==null) { receipt.selected = selected; result = { plan: plans[receipt.selected], receipt }; }
    else receipt.abstention = 'No completed error-free conditional boss preview';
    return result;
  } finally {
    receipt.realPrivateUnchanged = JSON.stringify(m.order.map(s => s.privateView())) === before;
    receipt.sixRngStreamsUnchanged = JSON.stringify(STREAMS.map(k => m[k]?.state?.())) === JSON.stringify(rngBefore);
    receipt.stockUnchanged = JSON.stringify([[...m.pool.entries], [...m.itemPool.debt]]) === stockBefore;
    assert(receipt.realPrivateUnchanged && receipt.sixRngStreamsUnchanged && receipt.stockUnchanged,
      'Boss preview changed real state, stock or RNG');
    note('fsm-boss-preview47', receipt);
  }
}
