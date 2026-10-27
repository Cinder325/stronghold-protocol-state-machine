// SPDX-License-Identifier: GPL-3.0-or-later
// Modified 2026-10-25: import adaptation and teammate-only integration; see provenance.json.
// Research controller placement adapter. Every mutation uses the unchanged native g.move
// handler. A full board can replace an unselected body by swapping into its occupied
// tile first: the outgoing piece uses the incoming piece's newly freed hand/temp slot.
import { canPlace, legalTiles, parseKey, placeClass } from "../../board.js";

export function applyPlacement47(ps, chosen, plan, { observe, handle }) {
  const receipt = { applied: [], abstentions: [], unresolved: [] };
  const selected = new Set(chosen.map(u => u.uid));
  const seen = new Set();
  const read = () => observe().match.private;
  const at = (p, uid) => p.board.find(u => u.uid === uid);
  const occupant = (p, row, col) => p.board.find(u => u.row === row && u.col === col);
  const legal = (piece, row, col) => {
    // The native predicate additionally covers summon owner/range restrictions.
    if (typeof ps._legal === 'function') return ps._legal(piece, row, col);
    const rec = piece.kind === 'token' ? ps.gd.token(piece.id) : ps.gd.chess(piece.id);
    return canPlace(ps.deployMap(), placeClass(ps, rec), row, col);
  };
  const direction = uid => plan.dirOf ? plan.dirOf(uid) : plan.dirs?.get(uid) ?? 'RIGHT';
  const stateKey = (p, uid, key, dir) => JSON.stringify([uid, key, dir,
    p.board.map(u => [u.uid, u.row, u.col, u.dir]), p.hand.map(u => u?.uid ?? null),
    p.temp.map(u => u?.uid ?? null)]);
  const abstain = (uid, target, dir, reason, extra = {}) => {
    receipt.abstentions.push({ uid, target, dir, reason, ...extra });
  };
  const move = (intent, source, uid, target, dir) => {
    const result = handle(intent, source);
    // The intent handler returns the native result. Inspect the resulting view too so
    // simple observers that omit the return value retain the former call contract.
    const p = read(), current = at(p, intent.uid);
    const reached = intent.to.area === 'board'
      ? current?.row === intent.to.row && current?.col === intent.to.col && current?.dir === intent.dir
      : p.hand[intent.to.idx]?.uid === intent.uid;
    if (result?.ok === true || !result?.error && reached) {
      receipt.applied.push({ uid: intent.uid, to: { ...intent.to },
        ...(intent.dir ? { dir: intent.dir } : {}), source });
      return true;
    }
    abstain(uid, target, dir, 'native-move-refused', { nativeError: result?.error ?? 'unconfirmed' });
    return false;
  };

  for (let pass = 0; pass < 3; pass++) {
    for (const u of chosen) {
      const key = plan.get(u.uid);
      if (!key) continue;
      const [row, col] = parseKey(key), dir = direction(u.uid);
      let p = read(), current = at(p, u.uid);
      if (current?.row === row && current?.col === col && current?.dir === dir) continue;
      const signature = stateKey(p, u.uid, key, dir);
      if (seen.has(signature)) continue;
      seen.add(signature);
      const owned = current || [...p.hand, ...p.temp].find(piece => piece?.uid === u.uid);
      if (!owned) { abstain(u.uid, key, dir, 'piece-no-longer-owned'); continue; }
      if (!legal(owned, row, col)) { abstain(u.uid, key, dir, 'illegal-target'); continue; }
      let target = occupant(p, row, col);

      const count = p.board.filter(piece => piece.kind === 'chess').length;
      if (!current && (!target || target.kind !== 'chess') && count >= p.deployCap) {
        // An empty tile would be BOARD_FULL even if the final selected roster fits.
        // Keep the outgoing body, including protected reserves: swap or use a free hand slot.
        const replacement = p.board.find(piece => piece.kind === 'chess'
          && !selected.has(piece.uid) && legal(owned, piece.row, piece.col));
        if (!replacement) {
          const idx=p.hand.findIndex(piece=>piece==null);
          const outgoing=p.board.find(piece=>piece.kind==='chess'&&!selected.has(piece.uid));
          if(idx<0||!outgoing){
            abstain(u.uid,key,dir,'no-legal-unchosen-replacement-or-hand-buffer');continue;
          }
          // Different placement classes cannot exchange tiles. Preserve the
          // unchosen body in a real free hand slot, then use the planned legal tile.
          if(!move({t:'g.move',uid:outgoing.uid,to:{area:'hand',idx}},
            'fsm-cross-terrain-hand-buffer100',u.uid,key,dir))continue;
        } else if (!move({ t: 'g.move', uid: u.uid, to: { area: 'board', row: replacement.row, col: replacement.col }, dir },
          'fsm-full-board-replacement', u.uid, key, dir)) continue;
        p = read(); current = at(p, u.uid); target = occupant(p, row, col);
        if (!current && replacement) { abstain(u.uid, key, dir, 'replacement-not-on-board'); continue; }
      }

      if (current && target && target.uid !== u.uid && !legal(target, current.row, current.col)) {
        // A ranged body leaving high ground cannot swap a melee body onto it.
        // Stage the occupant on any legal empty tile, or a genuinely free hand slot.
        const rec = target.kind === 'token' ? ps.gd.token(target.id) : ps.gd.chess(target.id);
        const empty = legalTiles(ps.deployMap(), placeClass(ps, rec)).find(([r, c]) =>
          !occupant(p, r, c) && legal(target, r, c));
        const idx = p.hand.findIndex(piece => piece == null);
        if (!empty && idx < 0) { abstain(u.uid, key, dir, 'no-legal-swap-buffer'); continue; }
        const to = empty ? { area: 'board', row: empty[0], col: empty[1] } : { area: 'hand', idx };
        if (!move({ t: 'g.move', uid: target.uid, to, ...(empty ? { dir: target.dir ?? 'RIGHT' } : {}) },
          'fsm-legal-swap-buffer', u.uid, key, dir)) continue;
        p = read();
        if (occupant(p, row, col)?.uid === target.uid) { abstain(u.uid, key, dir, 'swap-buffer-unavailable'); continue; }
      }
      move({ t: 'g.move', uid: u.uid, to: { area: 'board', row, col }, dir },
        'fsm-kjerag-layout', u.uid, key, dir);
    }
  }
  const final = read();
  for (const u of chosen) {
    const target = plan.get(u.uid);
    if (!target) continue;
    const [row, col] = parseKey(target), dir = direction(u.uid), current = at(final, u.uid);
    if (current?.row !== row || current?.col !== col || current?.dir !== dir) {
      const loc = current ? { area: 'board', row: current.row, col: current.col, dir: current.dir }
        : final.hand.some(piece => piece?.uid === u.uid) ? { area: 'hand' }
          : final.temp.some(piece => piece?.uid === u.uid) ? { area: 'temp' } : null;
      receipt.unresolved.push({ uid: u.uid, target, dir, actual: loc });
    }
  }
  return receipt;
}
