// The three products, as one sort with three rules. Multiplying two basis blades means laying their
// factors in a row (e₁₂ × e₂₃ is e₁ e₂ e₂ e₃), then swapping neighbours, each swap flipping the
// sign, and cancelling neighbours that match (e₂ e₂ = 1) until the row is in order. The rules differ
// only in what may cancel:
//   wedge      nothing may cancel; if a pair has to, the result is 0        (the outer product, ∧)
//   dot        every factor of the left blade must cancel, or the result is 0 (the inner product: the
//              left contraction, ⌋, which is the dot product for two vectors)
//   geometric  anything may cancel                                          (the geometric product)
// For an orthonormal basis these are exact: ∧ is the geometric product when the blades share no
// direction, ⌋ is the geometric product when the left blade lies inside the right one, and both are 0
// otherwise. The Workbench grid extends each rule to whole multivectors term by term, which is the
// distributive law.
import { G3, Multivector } from '@codecraft/ga';

export type Rule = 'wedge' | 'dot' | 'geometric';
export const RULES: Rule[] = ['wedge', 'dot', 'geometric'];
export const RULE_NAMES: Record<Rule, string> = { wedge: 'Wedge', dot: 'Dot', geometric: 'Geometric' };
export const RULE_SYMBOLS: Record<Rule, string> = { wedge: '∧', dot: '⌋', geometric: '' };

/** A ∘ B under a rule, for whole multivectors */
export function product(rule: Rule, a: Multivector, b: Multivector) {
  return rule === 'wedge' ? a.op(b) : rule === 'dot' ? a.lc(b) : a.gp(b);
}

/** a multivector's terms, one single-blade multivector each, in blade order */
export function terms(mv: Multivector) {
  return [...mv.terms].sort(([x], [y]) => x - y).map(([b, c]) => Multivector.blade(G3, b, c));
}

/** the blade number of a single-term multivector */
export const bladeOf = (mv: Multivector) => [...mv.terms.keys()][0] ?? 0;

// --- the rail: one cell, sorted by hand --------------------------------------------------------

export interface Tile {
  /** 0, 1, 2 for e₁, e₂, e₃ */
  axis: number;
  /** which factor it came from */
  from: 'left' | 'right';
}

export interface Rail {
  tiles: Tile[];
  sign: 1 | -1;
  /** pairs cancelled so far, and how many of those took a tile from the left factor */
  cancelled: number;
  leftTotal: number;
  moves: number;
}

const axesOf = (blade: number) => [0, 1, 2].filter((i) => (blade >> i) & 1);

export function newRail(left: number, right: number): Rail {
  const l = axesOf(left).map((axis) => ({ axis, from: 'left' as const }));
  const r = axesOf(right).map((axis) => ({ axis, from: 'right' as const }));
  return { tiles: [...l, ...r], sign: 1, cancelled: 0, leftTotal: l.length, moves: 0 };
}

/** what tapping the pair at i, i + 1 would do */
export function pairAction(rail: Rail, i: number): 'swap' | 'cancel' | null {
  const a = rail.tiles[i];
  const b = rail.tiles[i + 1];
  if (!a || !b) return null;
  return a.axis === b.axis ? 'cancel' : 'swap';
}

/** taps the pair at i, i + 1: swaps different tiles (flipping the sign) or cancels matching ones */
export function tap(rail: Rail, i: number): Rail {
  const action = pairAction(rail, i);
  if (!action) return rail;
  const tiles = [...rail.tiles];
  if (action === 'swap') {
    [tiles[i], tiles[i + 1]] = [tiles[i + 1], tiles[i]];
    return { ...rail, tiles, sign: (rail.sign * -1) as 1 | -1, moves: rail.moves + 1 };
  }
  tiles.splice(i, 2);
  return { ...rail, tiles, cancelled: rail.cancelled + 1, moves: rail.moves + 1 };
}

/** sorted: strictly increasing, so nothing left to swap or cancel */
export const sorted = (rail: Rail) => rail.tiles.every((t, i) => i === 0 || rail.tiles[i - 1].axis < t.axis);

/** what's left once sorted: the blade and its sign, or 0 when the rule rejects the sort */
export function railResult(rail: Rail, rule: Rule): { blade: number; sign: 1 | -1 } | null {
  if (rule === 'wedge' && rail.cancelled > 0) return null;
  if (rule === 'dot' && rail.tiles.some((t) => t.from === 'left')) return null;
  return { blade: rail.tiles.reduce((b, t) => b | (1 << t.axis), 0), sign: rail.sign };
}

/** why a rule gives 0 for this sort, in words, or null when it doesn't */
export function railWhyZero(rail: Rail, rule: Rule): string | null {
  if (rule === 'wedge' && rail.cancelled > 0) return 'a pair had to cancel, and the wedge allows none';
  if (rule === 'dot' && rail.tiles.some((t) => t.from === 'left'))
    return 'an A tile never cancelled, and the dot needs all of them to';
  return null;
}

/** the moves an automatic sort makes, for the rail to animate once a rule is learned */
export function autoSort(rail: Rail): number[] {
  const moves: number[] = [];
  let r = rail;
  for (let guard = 0; guard < 32 && !sorted(r); guard++) {
    const i = r.tiles.findIndex((t, k) => k + 1 < r.tiles.length && t.axis >= r.tiles[k + 1].axis);
    moves.push(i);
    r = tap(r, i);
  }
  return moves;
}
