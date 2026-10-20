// Items are either plain building blocks or elements of the geometric algebra G(3). Elements stack
// only with exactly equal elements, so coefficients are exact rationals.
import { G3, Multivector, Q, type Rational } from '@codecraft/ga';

export type Item = { kind: 'lattice' } | { kind: 'bench' } | { kind: 'element'; mv: Multivector };

export interface Stack {
  item: Item;
  count: number;
}

export const MAX_STACK = 64;

export const el = (...labels: string[]) => Multivector.e(G3, ...labels);
export const scalar = (n: number) => Multivector.scalar(G3, n);
export const element = (mv: Multivector): Item => ({ kind: 'element', mv });

export function itemKey(item: Item) {
  return item.kind === 'element' ? item.mv.key() : item.kind;
}

export function itemName(item: Item) {
  if (item.kind === 'lattice') return 'Lattice';
  if (item.kind === 'bench') return 'Algebra bench';
  return String(item.mv);
}

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

export type SavedItem = { kind: 'lattice' } | { kind: 'bench' } | { kind: 'element'; terms: [number, number, number][] };

export function saveItem(item: Item): SavedItem {
  if (item.kind !== 'element') return item;
  return { kind: 'element', terms: [...item.mv.terms].map(([b, c]) => [b, c.n, c.d]) };
}

export function loadItem(s: SavedItem): Item {
  if (s.kind !== 'element') return s;
  return element(Multivector.fromTerms(G3, s.terms.map(([b, n, d]) => [b, Q.q(n, d)] as [number, Rational])));
}

// --- inventory ---------------------------------------------------------------------------------

export const HOTBAR = 9;
export const SLOTS = 36;

export class Inventory {
  slots: (Stack | null)[] = Array(SLOTS).fill(null);

  /** adds as many as fit; returns how many didn't */
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

  swap(a: number, b: number) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
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
