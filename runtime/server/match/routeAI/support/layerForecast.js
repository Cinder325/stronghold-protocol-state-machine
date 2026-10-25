// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Read-only, conditional forecasts of deterministic prep-side garrisons.
// Reuse inspected canonical handlers; never dispatch on the real PlayerState or consume RNG.
// Bands, bonds, items, recruitment/merges and future combat are not simulated here.
import { BOND_LAYER_CAP } from "../../../../shared/constants.js";
import { HANDLERS } from "../../../sim/content/garrisons/meta.js";
import { boardOrder } from "../../board.js";

const SAFE = new Set([
  'SERVER_ADD_BOND', 'SERVER_ADD_BOND_CHESS_ALL', 'SERVER_ADD_BOND_METHOD',
  'SERVER_ADD_MULTIPLE_BOND', 'SERVER_ADD_BOND_ACTIVATED_MOST_LAYER',
  'SERVER_ADD_ACT_BOND_DIFF_LV_MOST_LAYER', 'SERVER_ADD_BOND_IN_HAND',
  'SERVER_ADD_BOND_POSITION', 'SERVER_ADD_BOND_ROUND_COIN_COST',
  'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER', 'SERVER_GAIN_FREE_REFRESH_COUNT',
  'SERVER_FRONT_SAME_EFFECT_PREP_START', 'SERVER_FRONT_SAME_EFFECT_PREP_FIN',
  'SERVER_TRIGGER_ANOTHER', 'SERVER_TRIGGER_FRONT_COUNT',
]);

/** Each event is an independent fixed-roster projection, not a saved-state continuation. */
export function forecastLayerGains(m, ps, { board, hand, views, bonds }, options = {}) {
  const gd = ps.gd || m.gd;
  const events = options.events || ['SERVER_PREP_FIN', 'SERVER_PREP_START'];
  const owned = new Map(views);
  for (const p of hand) if (p?.kind === 'chess') owned.set(p.uid, { ...p, area: 'hand' });
  const boardViews = [...views.values()].map((p) => ({ ...p, area: 'board' }));
  for (const p of boardViews) owned.set(p.uid, p);
  const forecasts = [];
  for (const event of events) {
    const layers = { ...ps.layers }, gains = {}, contributions = [], unmodeled = [];
    const seenUnknown = new Set(), stack = new Set();
    const stats = event === 'SERVER_PREP_START' ? {} : { ...ps.round };
    let freeRefreshes = 0;
    const unknown = (piece, g, reason) => {
      const key = `${piece?.uid}:${g?.garrisonId}:${reason}`;
      if (!seenUnknown.has(key)) {
        seenUnknown.add(key); unmodeled.push({ uid: piece?.uid, garrisonId: g?.garrisonId, reason });
      }
    };
    const run = (target, type, executor = target, depth = 0) => {
      const key = `${target.uid}:${type}:${executor.uid}`;
      if (depth >= 5 || stack.has(key)) { unknown(executor, null, 'cycle_or_dispatch_depth'); return 0; }
      stack.add(key);
      let calls = 0;
      try {
        for (const gid of gd.chess(target.id)?.garrisonIds || []) {
          const g = gd.garrison(gid);
          if (!g || g.eventType !== type) continue;
          if (executor.area === 'hand' && g.bbStr?.conditionkey === 'character_target_inboard') continue;
          const h = HANDLERS[g.effectKey];
          if (!SAFE.has(g.effectKey) || !h || m.dispatcher.registry.get(`garrison:${g.effectKey}`) !== h) {
            unknown(executor, g, 'handler_not_projected'); continue;
          }
          const repeat = type === 'SERVER_GAIN' && bonds.investShip?.active ? ((layers.investShip || 0) >= 100 ? 3 : 2) : 1;
          const ctx = {
            gd, data: m.data, round: event === 'SERVER_PREP_START' ? m.round + 1 : m.round,
            source: { piece: executor, copiedFrom: executor.uid !== target.uid ? target : null,
              garrisonId: gid, garrison: g, bb: g.bb || {}, bbStr: g.bbStr || {}, where: executor.area },
            piece: (uid) => owned.get(uid) || null,
            chessRecord: (id) => gd.chess(id),
            board: () => boardViews,
            hand: () => hand,
            shopLevel: () => ps.shop.level,
            roundStats: () => stats,
            layers: (id) => layers[id] || 0,
            bondActive: (id) => !!bonds[id]?.active,
            grantFreeRefresh: (n) => { freeRefreshes += n; },
            addLayers: (id, n, { requireActive = true } = {}) => {
              if (!gd.bond(id) || gd.modeInactiveBonds.has(id) || (requireActive && !bonds[id]?.active)) return 0;
              const actual = Math.max(0, Math.min(BOND_LAYER_CAP - (layers[id] || 0), Math.floor(n)));
              if (!Number.isFinite(actual) || !actual) return 0;
              layers[id] = (layers[id] || 0) + actual;
              gains[id] = (gains[id] || 0) + actual;
              contributions.push({ uid: executor.uid, sourceUid: target.uid, garrisonId: gid, bondId: id, amount: actual });
              return actual;
            },
            triggerGarrisons: (uid, triggerEvent, { asUid } = {}) => {
              const p = owned.get(uid), as = asUid == null ? p : owned.get(asUid);
              return p && as ? run(p, triggerEvent, as, depth + 1) : 0;
            },
          };
          for (let n = 0; n < repeat; n++) h.run(ctx);
          calls++;
        }
      } finally { stack.delete(key); }
      return calls;
    };
    for (const { piece } of boardOrder(board)) if (piece.kind === 'chess') run(owned.get(piece.uid), event);
    for (const p of hand) if (p?.kind === 'chess') run(owned.get(p.uid), event);
    // [ASSUMED] Policy valuation, not an official equivalence or guaranteed future reward.
    const weightedLayers = Object.entries(gains).reduce((sum, [id, n]) => {
      if ((options.targetBond && id !== options.targetBond) || gd.bond(id)?.noStack) return sum;
      return sum + n * (options.bondWeights?.[id] ?? 1);
    }, 0);
    forecasts.push({ event, gains, weightedLayers, freeRefreshes, contributions, unmodeled,
      conditional: event === 'SERVER_PREP_START' ? 'next_round_if_roster_terrain_survival_unchanged' : 'garrisons_only_before_other_unmodeled_effects' });
  }
  const nextStartWeight = options.nextStartWeight ?? 0.5;
  return { forecasts, score: forecasts.reduce((sum, f) => sum + f.weightedLayers * (f.event === 'SERVER_PREP_START' ? nextStartWeight : 1), 0),
    scope: 'conditional_fixed_roster_garrison_projection', writesRealState: false, consumesRng: false };
}
