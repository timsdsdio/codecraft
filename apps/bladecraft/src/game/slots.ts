// Inventory handling, the Minecraft way, as pure functions over arrays of slots. The cursor is the
// stack picked up by the mouse (or finger) and carried between slots:
//   left click     pick up the whole stack; put the whole cursor down; merge onto the same item; or swap
//   right click    pick up the larger half; put one unit down
//   shift click    move the stack straight to the other part of the screen (inventory ↔ container,
//                  or hotbar ↔ storage)
//   drag           with the cursor full, sweep across slots: left spreads it evenly, right puts one in each
//   number key     swap the slot under the pointer with that hotbar slot
// An element put down on one of the opposite sign cancels with it, because stacking adds; nothing
// else ever merges opposites, so picking things up can't wipe out a stack by accident.
import { Q } from '@codecraft/ga';
import { canMerge, half, merge, num, one, type Item, type Stack } from './items.ts';

export type Slots = (Stack | null)[];

export interface SlotRule {
  /** what may be put here (anything, when absent) */
  accepts?: (item: Item) => boolean;
  /** a result slot: things can be taken out but never put in */
  output?: boolean;
}

const fits = (rule: SlotRule | undefined, s: Stack) => !rule?.output && (!rule?.accepts || rule.accepts(s.item));

export function leftClick(slots: Slots, i: number, cursor: Stack | null, rule?: SlotRule): Stack | null {
  const slot = slots[i];
  if (!cursor) {
    slots[i] = null;
    return slot;
  }
  if (rule?.output) {
    // taking a result onto a cursor that already holds the same thing
    if (slot && canMerge(cursor, slot)) {
      const m = merge(cursor, slot);
      if (m.rest) return cursor;
      slots[i] = null;
      return m.target;
    }
    return cursor;
  }
  if (!fits(rule, cursor)) return cursor;
  if (!slot) {
    slots[i] = cursor;
    return null;
  }
  if (canMerge(slot, cursor, true)) {
    const m = merge(slot, cursor);
    slots[i] = m.target;
    return m.rest;
  }
  slots[i] = cursor;
  return slot;
}

export function rightClick(slots: Slots, i: number, cursor: Stack | null, rule?: SlotRule): Stack | null {
  const slot = slots[i];
  if (!cursor) {
    if (!slot) return null;
    if (rule?.output) {
      slots[i] = null;
      return slot;
    }
    const h = half(slot);
    slots[i] = h.rest;
    return h.taken;
  }
  if (rule?.output) return leftClick(slots, i, cursor, rule);
  if (!fits(rule, cursor)) return cursor;
  const o = one(cursor);
  if (!slot) {
    slots[i] = o.taken;
    return o.rest;
  }
  if (canMerge(slot, o.taken, true)) {
    const m = merge(slot, o.taken);
    if (m.rest) return cursor; // full
    slots[i] = m.target;
    return o.rest;
  }
  slots[i] = cursor;
  return slot;
}

/**
 * Puts a stack into `slots` the way a pickup does: onto matching stacks first (same sign only), then
 * into empty slots, in `order`. Returns whatever didn't fit.
 */
export function addTo(slots: Slots, s: Stack | null, order: number[] = slots.map((_, i) => i), rule?: SlotRule): Stack | null {
  let rest = s;
  for (const i of order) {
    if (!rest) break;
    const t = slots[i];
    if (t && canMerge(t, rest)) {
      const m = merge(t, rest);
      slots[i] = m.target;
      rest = m.rest;
    }
  }
  if (rest && rule?.accepts && !rule.accepts(rest.item)) return rest;
  for (const i of order) {
    if (!rest) break;
    if (!slots[i]) {
      slots[i] = rest;
      rest = null;
    }
  }
  return rest;
}

/** shift click: moves slot i of `from` into `to` (in `order`); whatever doesn't fit stays put */
export function quickMove(from: Slots, i: number, to: Slots, order?: number[], rule?: SlotRule) {
  const s = from[i];
  if (!s) return;
  if (rule && !fits(rule, s)) return;
  from[i] = addTo(to, s, order, rule);
}

/**
 * The end of a drag across slots with a full cursor: `even` shares the cursor's whole units equally
 * between the slots (Minecraft's left drag), `one` puts one unit in each (its right drag). Slots that
 * hold something else are skipped. Returns what's left on the cursor.
 */
export function distribute(slots: Slots, targets: number[], cursor: Stack, mode: 'even' | 'one', rule?: SlotRule): Stack | null {
  const open = targets.filter((i) => fits(rule, cursor) && (!slots[i] || canMerge(slots[i]!, cursor)));
  if (!open.length) return cursor;
  const whole = Math.floor(Math.abs(num(cursor.count)));
  const each = mode === 'one' ? 1 : Math.floor(whole / open.length);
  if (each < 1) return cursor;
  const sign = Math.sign(cursor.count.n);
  let left = cursor.count;
  for (const i of open) {
    const piece: Stack = { item: cursor.item, count: Q.q(sign * each) };
    if (Math.abs(num(left)) < each) break;
    const t = slots[i];
    if (!t) {
      slots[i] = piece;
      left = Q.add(left, Q.neg(piece.count));
      continue;
    }
    const m = merge(t, piece);
    slots[i] = m.target;
    const moved = m.rest ? Q.add(piece.count, Q.neg(m.rest.count)) : piece.count;
    left = Q.add(left, Q.neg(moved));
  }
  return Q.isZero(left) ? null : { item: cursor.item, count: left };
}

/** how many units of items passing `test` the slots hold (positive weights only) */
export function countUnits(slots: Slots, test: (item: Item) => boolean) {
  return slots.reduce((n, s) => n + (s && test(s.item) && s.count.n > 0 ? Math.floor(num(s.count)) : 0), 0);
}

/** removes n units of items passing `test`, across stacks; false (and nothing removed) if there aren't enough */
export function removeUnits(slots: Slots, test: (item: Item) => boolean, n: number) {
  if (countUnits(slots, test) < n) return false;
  for (let i = 0; i < slots.length && n > 0; i++) {
    const s = slots[i];
    if (!s || !test(s.item) || s.count.n <= 0) continue;
    const k = Math.min(n, Math.floor(num(s.count)));
    const left = Q.add(s.count, Q.q(-k));
    slots[i] = Q.isZero(left) ? null : { item: s.item, count: left };
    n -= k;
  }
  return true;
}

// --- the player's inventory --------------------------------------------------------------------

export const HOTBAR = 9;
export const SLOTS = 36;
/** pickups fill the hotbar before storage */
export const PICKUP_ORDER = Array.from({ length: SLOTS }, (_, i) => i);
export const HOTBAR_RANGE = Array.from({ length: HOTBAR }, (_, i) => i);
export const STORAGE_RANGE = Array.from({ length: SLOTS - HOTBAR }, (_, i) => i + HOTBAR);
