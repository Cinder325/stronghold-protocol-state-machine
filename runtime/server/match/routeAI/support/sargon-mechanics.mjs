// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Read-only policy facts from the installed native data. Scores below are
// [ASSUMED] priorities for a first Sargon controller, never simulated outcomes.
import { pieceBonds, computeBonds } from "../../bondsMeta.js";
import { resolveLoadout } from "../../../../shared/protocol.js";
import { dirVec } from "../../../sim/dir.js";

export const SARGON58 = Object.freeze({
  bond: 'sargonShip', precision: 'preciShip', swift: 'swiftShip', harmony: 'maniShip',
  pepeBand: 'band_pepe', titi: 'chess_char_5_02_a', minimalist: 'chess_char_3_13_a',
  philae: 'chess_char_3_06_a', papyrus: 'chess_char_2_06_a', bubble: 'chess_char_2_08_a',
  estelle: 'chess_char_1_12_a', gavial: 'chess_char_4_23_a', passenger: 'chess_char_6_05_a',
  pepe: 'chess_char_6_06_a', theresa: 'chess_char_4_25_a', hiddenTheresa: 'chess_char_5_09_a',
  tea: 'chess_item_2_04_e_a', compass: 'chess_item_6_07_e_a', morph: 'chess_item_6_09_e_a',
});
const sourceKeys = new Set(['act1autochess_gar_event_useskill', 'act2autochess_gar_event_allyenemy_sleepstun_inrange']);
const owned = p => [...(p.board instanceof Map ? p.board.values() : p.board || []), ...(p.hand || []), ...(p.temp || [])].filter(x => x?.kind === 'chess');
const split = value => typeof value === 'string' ? value.split(',').filter(Boolean) : [];
const sum = values => values.reduce((a, b) => a + b, 0);

/** Native garrison facts only. A per-event reward is not a promised battle gain.
 * SERVER_GAIN effects fire on acquisition even from a free offer. Source eligibility
 * and random grants still belong to the native transaction dispatcher. */
export function sargonTraits58(gd, u) {
  const rec = gd.chess(u?.id), baseId = rec ? gd.baseIdOf(u.id) : null;
  const traits = (rec?.garrisonIds || []).map(id => gd.garrison(id)).filter(Boolean);
  const battleSources = traits.filter(t => sourceKeys.has(t.effectKey)).map(t => ({
    garrisonId: t.garrisonId, event: t.effectKey === 'act1autochess_gar_event_useskill' ? 'skillStart' : 'sleepOrStunEntryInRange',
    bonds: split(t.bbStr?.bond_id), perEvent: t.bb?.bond_add_count || 0,
    cap: t.bb?.max_add_count_per_battle ?? null, requireActive: true,
  }));
  const acquisition = traits.filter(t => t.eventType === 'SERVER_GAIN').map(t => ({
    garrisonId: t.garrisonId, effect: t.effectKey, count: t.bb?.count || 0,
    bonds: t.effectKey === 'SERVER_ADD_BOND_CHESS_ALL' ? pieceBonds(gd, u) : split(t.bbStr?.bond),
    itemId: t.bbStr?.chess || null,
  }));
  return {
    baseId, name: rec?.name || null, nativeSargon: !!rec?.bonds?.includes(SARGON58.bond),
    isSargon: !!rec && pieceBonds(gd, u).includes(SARGON58.bond),
    battleSources, acquisition,
    frontTraitBonus: sum(traits.filter(t => t.effectKey === 'act1autochess_gar_event_addition_cnt').map(t => t.bb?.extra_cnt || 0)),
    needsOnBoardForPrepGift: traits.some(t => t.eventType === 'SERVER_PREP_START' && t.bbStr?.conditionkey === 'character_target_inboard'),
  };
}

/** A conditional *cast-frequency* preference, not damage/SP simulation. Honor the
 * user's actual skill selection: Minimalist S1 must not inherit the S2 rating.
 * "requiresAttackTarget" forbids treating zero-duration attack skills as free casts
 * in empty range. Do not replace occupied equipment just because score is high. */
export function sargonChargeHost58(gd, u, { loadout = null } = {}) {
  const rec = gd.chess(u?.id);
  if (!rec || u.kind !== 'chess') return { eligible: false, score: 0, reason: 'not-an-operator' };
  const selection = resolveLoadout(loadout, rec, id => gd.chess(id));
  const skill = rec.skills?.find(s => s.index === selection.skillIndex) || rec.skill;
  const cost = skill?.spCost, duration = Math.max(0, skill?.duration || 0);
  const isSargon = pieceBonds(gd, u).includes(SARGON58.bond);
  const usable = isSargon && Number.isFinite(cost) && cost > 0 && skill?.spType === 'INCREASE_WITH_TIME';
  const teaItems = (u.items || []).map(it => gd.item(it.id)).filter(it => it?.baseId === SARGON58.tea);
  const tea = teaItems.length > 0;
  const compass = (u.items || []).some(it => gd.item(it.id)?.baseId === SARGON58.compass);
  const recovery = (rec.stats?.spRecovery || 1) + sum(teaItems.map(it => it.params?.sp_recovery_per_sec || 0));
  const cycle = usable ? duration + Math.max(0, cost - (tea && compass ? 3 : 0)) / recovery : null;
  return {
    eligible: usable, score: usable ? 100 / Math.max(1, cycle) + (tea ? 3 : 0) + (compass ? 3 : 0) : 0,
    reason: usable ? 'conditional-cast-frequency-only' : 'requires-sargon-and-time-recovery-skill',
    skillId: skill?.skillId || null, spCost: cost ?? null, duration, recovery,
    requiresAttackTarget: skill?.skillType === 'AUTO' && duration === 0,
    tea, compass, comboReady: tea && compass && isSargon,
    freeSlots: Math.max(0, (gd.equipPerChess || 2) - (u.items || []).length),
  };
}

/** True only for same-owner pieces one legal board tile along Theresa's facing.
 * Native UP increases row. Called after legal-placement checks, not instead of them. */
export function sargonFrontPair58(gd, holder, source) {
  if (!holder || !source || holder.uid === source.uid || !sargonTraits58(gd, holder).frontTraitBonus) return false;
  if (holder.ownerId != null && source.ownerId != null && holder.ownerId !== source.ownerId) return false;
  const [dr, dc] = dirVec(holder.dir);
  return Number.isInteger(holder.row) && Number.isInteger(source.row)
    && source.row === holder.row + dr && source.col === holder.col + dc;
}

/** Read current state. For a real private view use its authoritative bond list;
 * a hypothetical lineup should be evaluated by native computeBonds on its clone. */
export function sargonMechanics58(gd, p) {
  const all = owned(p), board = p.board instanceof Map ? [...p.board.values()] : p.board || [];
  const bonds = Array.isArray(p.bonds) ? Object.fromEntries(p.bonds.map(b => [b.bondId, b])) : p.bonds;
  const native = bonds || computeBonds(gd, {
    board: new Map(board.map((u, i) => [String(i), u])), hand: p.hand || [], layers: p.layers || {}, m: p.m,
  });
  const state = native[SARGON58.bond] || { count: 0, active: false, tier: 0, layers: 0 };
  const roles = all.map(u => ({ uid: u.uid, id: u.id, ...sargonTraits58(gd, u), charge: sargonChargeHost58(gd, u, { loadout: p.loadout }) }));
  return { state, roles, onBoardSargon: board.filter(u => u.kind === 'chess' && pieceBonds(gd, u).includes(SARGON58.bond)).map(u => u.uid),
    chargeHosts: roles.filter(r => r.charge.eligible).sort((a, b) => b.charge.score - a.charge.score),
    layerSources: roles.filter(r => r.battleSources.some(s => s.bonds.includes(SARGON58.bond))),
    frontPairs: board.flatMap(holder => board.filter(source => sargonFrontPair58(gd, holder, source)
      && sargonTraits58(gd, source).battleSources.length).map(source => ({ holderUid: holder.uid, sourceUid: source.uid }))),
    // Private view intentionally has no internal band counter. Never guess pending
    // special-refresh credits from shop tier alone; a stateful controller tracks the
    // acknowledged level-ups/manual refreshes, or trusted server code reads counters.
    specialRefreshCredits: Number.isInteger(p.counters?.['band:pepe:special']) ? p.counters['band:pepe:special'] : null,
  };
}
