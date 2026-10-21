// Items are building blocks, machines (placed to build a factory) or elements of the geometric
// algebra G(3). Elements stack only with exactly equal elements, so coefficients are exact rationals.
import { G3, Multivector, Q, type Rational } from '@codecraft/ga';

/** machines that can be placed; each faces one of four directions */
export type MachineType = 'extractor' | 'duct' | 'collector' | 'adder' | 'wedger' | 'multiplier' | 'sandwich';

export type Item =
  | { kind: 'lattice' }
  | { kind: 'bench' }
  | { kind: 'machine'; type: MachineType }
  | { kind: 'element'; mv: Multivector };

export interface Stack {
  item: Item;
  count: number;
}

export const MAX_STACK = 64;

export const el = (...labels: string[]) => Multivector.e(G3, ...labels);
export const scalar = (n: number) => Multivector.scalar(G3, n);
export const element = (mv: Multivector): Item => ({ kind: 'element', mv });
export const machine = (type: MachineType): Item => ({ kind: 'machine', type });

export const MACHINE_NAMES: Record<MachineType, string> = {
  extractor: 'Extractor',
  duct: 'Duct',
  collector: 'Collector',
  adder: 'Adder',
  wedger: 'Wedger',
  multiplier: 'Multiplier',
  sandwich: 'Sandwich press',
};

export function itemKey(item: Item) {
  if (item.kind === 'element') return item.mv.key();
  if (item.kind === 'machine') return `machine:${item.type}`;
  return item.kind;
}

export function itemName(item: Item) {
  if (item.kind === 'lattice') return 'Lattice';
  if (item.kind === 'bench') return 'Algebra bench';
  if (item.kind === 'machine') return MACHINE_NAMES[item.type];
  return String(item.mv);
}

/** blocks you can put in the world */
export const placeable = (item: Item) => item.kind !== 'element';

/** what kind of element this is, in words */
export function describe(mv: Multivector) {
  if (mv.isZero()) return 'zero';
  const g = mv.grades();
  const names = ['scalar', 'vector', 'bivector', 'trivector'];
  if (g.length === 1) return names[g[0]];
  if (g.every((k) => k % 2 === 0)) return g.includes(0) && g.includes(2) ? 'rotor (scalar + bivector)' : 'even multivector';
  return `multivector (${g.map((k) => names[k]).join(' + ')})`;
}

// --- saving ------------------------------------------------------------------------------------

export type SavedMv = [number, number, number][];
export type SavedItem =
  | { kind: 'lattice' }
  | { kind: 'bench' }
  | { kind: 'machine'; type: MachineType }
  | { kind: 'element'; terms: SavedMv };

export const saveMv = (mv: Multivector): SavedMv => [...mv.terms].map(([b, c]) => [b, c.n, c.d]);
export const loadMv = (s: SavedMv) => Multivector.fromTerms(G3, s.map(([b, n, d]) => [b, Q.q(n, d)] as [number, Rational]));

export function saveItem(item: Item): SavedItem {
  return item.kind === 'element' ? { kind: 'element', terms: saveMv(item.mv) } : item;
}

export function loadItem(s: SavedItem): Item {
  return s.kind === 'element' ? element(loadMv(s.terms)) : s;
}

// --- inventory ---------------------------------------------------------------------------------

export const HOTBAR = 9;
export const SLOTS = 36;

export class Inventory {
  slots: (Stack | null)[] = Array(SLOTS).fill(null);

  /** adds as many as fit, filling matching stacks first, then the hotbar, then storage; returns how many didn't fit */
  add(item: Item, count = 1) {
    const key = itemKey(item);
    for (const s of this.slots) {
      if (!count) break;
      if (s && itemKey(s.item) === key && s.count < MAX_STACK) {
        const n = Math.min(count, MAX_STACK - s.count);
        s.count += n;
        count -= n;
      }
    }
    for (let i = 0; i < SLOTS && count; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(count, MAX_STACK);
      this.slots[i] = { item, count: n };
      count -= n;
    }
    return count;
  }

  take(slot: number, count = 1) {
    const s = this.slots[slot];
    if (!s || s.count < count) return null;
    s.count -= count;
    if (!s.count) this.slots[slot] = null;
    return s.item;
  }

  /** the first slot holding an item that passes the test */
  find(test: (item: Item) => boolean) {
    return this.slots.findIndex((s) => !!s && test(s.item));
  }

  count(test: (item: Item) => boolean) {
    return this.slots.reduce((n, s) => n + (s && test(s.item) ? s.count : 0), 0);
  }

  /** removes n items that pass the test, across stacks; false (and nothing removed) if there aren't enough */
  remove(test: (item: Item) => boolean, n = 1) {
    if (this.count(test) < n) return false;
    for (let i = 0; i < SLOTS && n; i++) {
      const s = this.slots[i];
      if (!s || !test(s.item)) continue;
      const k = Math.min(n, s.count);
      this.take(i, k);
      n -= k;
    }
    return true;
  }

  swap(a: number, b: number) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }

  /** moves a stack between the hotbar and storage: into the first free slot on the other side, else swaps with `fallback` */
  shuttle(slot: number, fallback: number) {
    const toHotbar = slot >= HOTBAR;
    const range = toHotbar ? [0, HOTBAR] : [HOTBAR, SLOTS];
    for (let i = range[0]; i < range[1]; i++) if (!this.slots[i]) return this.swap(slot, i);
    this.swap(slot, fallback);
  }

  elements() {
    return this.slots.flatMap((s) => (s && s.item.kind === 'element' ? [s.item.mv] : []));
  }

  save() {
    return this.slots.map((s) => (s ? { item: saveItem(s.item), count: s.count } : null));
  }

  load(saved: ({ item: SavedItem; count: number } | null)[]) {
    this.slots = Array.from({ length: SLOTS }, (_, i) => {
      const s = saved[i];
      return s ? { item: loadItem(s.item), count: s.count } : null;
    });
  }
}
