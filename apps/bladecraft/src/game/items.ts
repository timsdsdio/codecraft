// Items. The atoms of the algebra are blades with weights, and a multivector is a sum of them; in
// storage (the inventory, Stores, ducts, machines) a multivector is one packed item, and only a
// workspace (the Workbench, the Card Press) shows its blades.
//
// One rule decides stacking for everything: two things stack when one is a multiple of the other,
// and stacking adds them. So an element item holds a *primitive* multivector (whole coefficients
// with no common factor, its first term positive) and the stack's count is its weight: a slot
// showing e₁ × 3 holds 3e₁, and one showing (1 + e₁₂) × 2 holds 2 + 2e₁₂. Counts are exact
// rationals, so a weight can be negative (the slot is hatched) or a fraction. Every other item
// stacks the Minecraft way, by count, up to 64.
import { G3, Multivector, Q, type Rational } from '@codecraft/ga';

/** blocks with a facing, placed from the inventory */
export type MachineType =
  | 'extractor'
  | 'duct'
  | 'store'
  | 'splitter'
  | 'merger'
  | 'sorter'
  | 'crossing'
  | 'packer'
  | 'unpacker'
  | 'mill'
  | 'press'
  | 'detector'
  | 'orrery'
  | 'plate'
  | 'charge'
  | 'wire'
  | 'antenna'
  | 'probe';

/**
 * What a card does with the multivector M it was pressed from, to whatever X a Mill feeds it:
 *   join      M ∧ X
 *   meter     M ⌋ X
 *   multiply  M X, or X M when the card is turned end to end
 *   turn      M X M̃ / (M M̃): a rotation, or a reflection when M is a vector
 *   reverse   X̃ (no M)
 *   sieve     keeps the grades M has and drops the rest
 */
export type Verb = 'join' | 'meter' | 'multiply' | 'turn' | 'reverse' | 'sieve';

export type Item =
  | { kind: 'lattice' }
  | { kind: 'workbench' }
  | { kind: 'machine'; type: MachineType }
  | { kind: 'element'; mv: Multivector }
  | { kind: 'card'; verb: Verb; mv: Multivector | null; right: boolean }
  | { kind: 'plate'; verb: Verb }
  | { kind: 'blank' }
  | { kind: 'reading'; mv: Multivector };

export interface Stack {
  item: Item;
  count: Rational;
}

export const MAX_STACK = 64;

export const el = (...labels: string[]) => Multivector.e(G3, ...labels);
export const scalar = (n: number) => Multivector.scalar(G3, n);
export const machine = (type: MachineType): Item => ({ kind: 'machine', type });
export const stack = (item: Item, count = 1): Stack => ({ item, count: Q.q(count) });

export const MACHINE_NAMES: Record<MachineType, string> = {
  extractor: 'Extractor',
  duct: 'Duct',
  store: 'Store',
  splitter: 'Splitter',
  merger: 'Merger',
  sorter: 'Sorter',
  crossing: 'Crossing',
  packer: 'Packer',
  unpacker: 'Unpacker',
  mill: 'Mill',
  press: 'Card Press',
  detector: 'Detector',
  orrery: 'Fibration orrery',
  plate: 'Field plate',
  charge: 'Charge',
  wire: 'Wire',
  antenna: 'Antenna',
  probe: 'Field probe',
};

export const VERB_NAMES: Record<Verb, string> = {
  join: 'Join',
  meter: 'Meter',
  multiply: 'Multiply',
  turn: 'Turn',
  reverse: 'Reverse',
  sieve: 'Sieve',
};

// --- weights -----------------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** M as weight × primitive: whole coefficients with no common factor, the lowest blade's positive */
export function split(mv: Multivector): { base: Multivector; weight: Rational } {
  const terms = [...mv.terms].sort(([a], [b]) => a - b);
  if (!terms.length) return { base: mv, weight: Q.ZERO };
  const den = terms.reduce((l, [, c]) => lcm(l, c.d), 1);
  const nums = terms.map(([, c]) => (c.n * den) / c.d);
  const g = nums.reduce((acc, n) => gcd(acc, n), 0);
  const weight = Q.q(Math.sign(nums[0]) * g, den);
  return { base: mv.scale(Q.div(Q.ONE, weight)), weight };
}

/** the stack holding exactly this multivector, or null for 0 */
export function stackOf(mv: Multivector): Stack | null {
  if (mv.isZero()) return null;
  const { base, weight } = split(mv);
  return { item: { kind: 'element', mv: base }, count: weight };
}

/** the multivector an element stack holds (its base times its weight) */
export const valueOf = (s: Stack) => (s.item.kind === 'element' ? s.item.mv.scale(s.count) : null);

export const num = (q: Rational) => Q.toNumber(q);
export const qsub = (a: Rational, b: Rational) => Q.add(a, Q.neg(b));
const qabs = (a: Rational) => (a.n < 0 ? Q.neg(a) : a);
const qmin = (a: Rational, b: Rational) => (num(a) <= num(b) ? a : b);

/** how many whole units a stack holds (for an element, the whole part of its weight's size) */
export const units = (s: Stack) => Math.floor(Math.abs(num(s.count)));

export function itemKey(item: Item): string {
  switch (item.kind) {
    case 'element':
      return `el:${item.mv.key()}`;
    case 'card':
      return `card:${item.verb}:${item.right ? 'R' : 'L'}:${item.mv?.key() ?? ''}`;
    case 'plate':
      return `plate:${item.verb}`;
    case 'reading':
      return `reading:${item.mv.key()}`;
    case 'machine':
      return `machine:${item.type}`;
    default:
      return item.kind;
  }
}

export const sameItem = (a: Item, b: Item) => itemKey(a) === itemKey(b);

/**
 * Can `incoming` be added onto `target`? The same item always can, except that putting one element
 * stack on another of the opposite sign (which cancels them) is allowed only when asked for: a click
 * that drops it there on purpose, never a pickup or a duct.
 */
export function canMerge(target: Stack, incoming: Stack, opposite = false) {
  if (!sameItem(target.item, incoming.item)) return false;
  if (target.item.kind === 'element' && Math.sign(target.count.n) !== Math.sign(incoming.count.n)) return opposite;
  return true;
}

/** adds as much of `incoming` onto `target` as fits; returns what's left of each (null when used up) */
export function merge(target: Stack, incoming: Stack): { target: Stack | null; rest: Stack | null } {
  const sameSign = Math.sign(target.count.n) === Math.sign(incoming.count.n);
  if (!sameSign) {
    // opposites cancel, and the result always fits
    const sum = Q.add(target.count, incoming.count);
    return { target: Q.isZero(sum) ? null : { item: target.item, count: sum }, rest: null };
  }
  const room = Math.max(0, MAX_STACK - Math.abs(num(target.count)));
  const moved = qmin(qabs(incoming.count), Q.q(room));
  const signed = incoming.count.n < 0 ? Q.neg(moved) : moved;
  const left = qsub(incoming.count, signed);
  return {
    target: { item: target.item, count: Q.add(target.count, signed) },
    rest: Q.isZero(left) ? null : { item: incoming.item, count: left },
  };
}

/** splits off `n` whole units (keeping the sign); everything, if the stack holds less than one unit */
export function takeUnits(s: Stack, n: number): { taken: Stack; rest: Stack | null } {
  if (units(s) < 1 || n >= Math.abs(num(s.count))) return { taken: s, rest: null };
  const signed = Q.q(Math.sign(s.count.n) * n);
  return { taken: { item: s.item, count: signed }, rest: { item: s.item, count: qsub(s.count, signed) } };
}

/** the larger half, in whole units, the way a right click picks up a Minecraft stack */
export const half = (s: Stack) => takeUnits(s, Math.ceil(units(s) / 2));
export const one = (s: Stack) => takeUnits(s, 1);

// --- names -------------------------------------------------------------------------------------

/** what kind of element this is, in words */
export function describe(mv: Multivector) {
  if (mv.isZero()) return 'zero';
  const g = mv.grades();
  const names = ['scalar', 'vector', 'bivector', 'trivector'];
  if (g.length === 1) return names[g[0]];
  if (g.join() === '0,2') return 'rotor (scalar + bivector)';
  return `multivector (${g.map((k) => names[k]).join(' + ')})`;
}

export function itemName(item: Item): string {
  switch (item.kind) {
    case 'lattice':
      return 'Lattice';
    case 'workbench':
      return 'Workbench';
    case 'machine':
      return MACHINE_NAMES[item.type];
    case 'element':
      return String(item.mv);
    case 'card':
      return `${VERB_NAMES[item.verb]} card${item.mv ? ` · ${item.mv}` : ''}${item.right ? ' (from the right)' : ''}`;
    case 'plate':
      return `${VERB_NAMES[item.verb]} plate`;
    case 'blank':
      return 'Blank card';
    case 'reading':
      return `Field reading · ${item.mv}`;
  }
}

/** a stack in words: an element shows the multivector it holds, anything else its count */
export function stackName(s: Stack) {
  if (s.item.kind === 'element') return String(valueOf(s));
  return num(s.count) > 1 ? `${itemName(s.item)} × ${Q.show(s.count)}` : itemName(s.item);
}

/** blocks you can put in the world */
export const placeable = (item: Item) => item.kind === 'machine' || item.kind === 'lattice' || item.kind === 'workbench';

// --- saving ------------------------------------------------------------------------------------

export type SavedMv = [number, number, number][];
export type SavedStack = { item: Record<string, unknown>; count: [number, number] };

export const saveMv = (mv: Multivector): SavedMv => [...mv.terms].map(([b, c]) => [b, c.n, c.d]);
export const loadMv = (s: SavedMv) => Multivector.fromTerms(G3, s.map(([b, n, d]) => [b, Q.q(n, d)] as [number, Rational]));

export function saveStack(s: Stack): SavedStack {
  const it = s.item;
  const item =
    it.kind === 'element' || it.kind === 'reading'
      ? { ...it, mv: saveMv(it.mv) }
      : it.kind === 'card'
        ? { ...it, mv: it.mv ? saveMv(it.mv) : null }
        : { ...it };
  return { item, count: [s.count.n, s.count.d] };
}

export function loadStack(s: SavedStack): Stack {
  const raw = s.item as Record<string, unknown> & { kind: Item['kind'] };
  const item = (
    raw.kind === 'element' || raw.kind === 'reading'
      ? { ...raw, mv: loadMv(raw.mv as SavedMv) }
      : raw.kind === 'card'
        ? { ...raw, mv: raw.mv ? loadMv(raw.mv as SavedMv) : null }
        : raw
  ) as Item;
  return { item, count: Q.q(s.count[0], s.count[1]) };
}

export const saveSlots = (slots: (Stack | null)[]) => slots.map((s) => (s ? saveStack(s) : null));
export const loadSlots = (saved: (SavedStack | null)[] | undefined, n: number) =>
  Array.from({ length: n }, (_, i) => (saved?.[i] ? loadStack(saved[i]!) : null));
