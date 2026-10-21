// The factory: moves elements through extractors, ducts and machines, a fixed number of ticks per
// second. It works on the world's blocks directly and knows nothing about drawing.
//
// Every machine faces one way and pushes what it makes out of its front into the block there. What
// a block accepts depends on which side something arrives from:
//   duct        anything, from any side but its front, one element at a time
//   operation   from its back into input A, from its left or right into input B (unless B is fixed
//               in its panel); when both are full it works for a second and outputs the result
//   one-input   the Bloch projector, detector and orrery take A from any side but the front
//   collector   anything, until full
//   hub         anything; elements matching its order count toward it
// Results of 0, sandwiches whose B has no inverse, and non-states sent to qubit machines vanish
// (the orrery passes anything through, recording only states).
import type { Multivector } from '@codecraft/ga';
import { loadMv, saveMv } from './items.ts';
import { apply, type Op } from './ops.ts';
import { ORDERS, type HubProgress, type Order } from './orders.ts';
import { E3, bloch, isState, probUp, samePoint, sameState } from './qubit.ts';
import { SINGLE_INPUT, STEP, opposite, type Block, type Carried, type Dir, type Machine, type World } from './world.ts';
import { Q } from '@codecraft/ga';

export const TICK = 1 / 20;
export const DUCT_SPEED = 1.5; // blocks per second
export const EXTRACT_EVERY = 1.5; // seconds per element
export const WORK_TIME = 1; // seconds per operation
export const COLLECTOR_CAPACITY = 256;
export const ORRERY_MEMORY = 12;

export const OPS: Record<'adder' | 'wedger' | 'multiplier' | 'sandwich' | 'gate', Op> = {
  adder: 'add',
  wedger: 'wedge',
  multiplier: 'product',
  sandwich: 'sandwich',
  gate: 'product',
};

export interface FactoryEvents {
  /** a machine combined two elements (result may be zero or null) */
  craft?(op: Op, a: Multivector, b: Multivector, result: Multivector | null): void;
  /** an element reached the hub */
  deliver?(mv: Multivector, counted: boolean): void;
  orderDone?(order: Order, next: Order | undefined): void;
  /** a qubit machine acted on a state */
  qubit?(kind: 'project' | 'gate' | 'measure', input: Multivector, result: Multivector): void;
  /** an orrery's record of states changed */
  orrery?(seen: Multivector[]): void;
}

/** does a delivery count toward the order? state and phase orders accept any state on the wanted Bloch point */
export function counts(order: Order, mv: Multivector, hub: HubProgress) {
  if ((order.kind ?? 'exact') === 'exact') return mv.equals(order.want);
  if (!isState(mv) || !samePoint(mv, order.want)) return false;
  if (order.kind === 'state') return true;
  return !(hub.seen ?? []).some((s) => sameState(loadMv(s), mv));
}

let nextId = 1;

export class Factory {
  private carry = 0;
  private world: World;
  hub: HubProgress;
  private events: FactoryEvents;
  private rng: () => number;

  constructor(world: World, hub: HubProgress, events: FactoryEvents = {}, rng: () => number = Math.random) {
    this.world = world;
    this.hub = hub;
    this.events = events;
    this.rng = rng;
  }

  get order(): Order | undefined {
    return ORDERS[this.hub.order];
  }

  /** advance by real time; runs whole ticks */
  step(dt: number) {
    this.carry = Math.min(this.carry + dt, 0.5);
    while (this.carry >= TICK) {
      this.carry -= TICK;
      this.tick(TICK);
    }
  }

  tick(dt: number) {
    for (const [x, y, z] of [...this.world.active.values()]) {
      const b = this.world.get(x, y, z);
      if (b?.kind === 'machine') this.run(b, x, y, z, dt);
    }
  }

  private run(m: Machine, x: number, y: number, z: number, dt: number) {
    switch (m.type) {
      case 'duct': {
        if (!m.item) return;
        m.item.t = Math.min(1, m.item.t + dt * DUCT_SPEED);
        if (m.item.t >= 1 && this.push(x, y, z, m.facing, m.item.mv)) m.item = null;
        return;
      }
      case 'extractor': {
        const [dx, dz] = STEP[opposite(m.facing)];
        const source = this.world.get(x + dx, y, z + dz);
        if (!m.out && source?.kind === 'deposit') {
          m.timer += dt;
          if (m.timer >= EXTRACT_EVERY) {
            m.timer = 0;
            m.out = { id: nextId++, mv: source.mv, t: 1, from: null };
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out.mv)) m.out = null;
        return;
      }
      case 'collector':
        return;
      default: {
        const single = SINGLE_INPUT.includes(m.type);
        const b = m.fixed ?? m.b;
        if (m.a && (single || b) && !m.out) {
          m.work += dt;
          if (m.work >= WORK_TIME) {
            const result = this.operate(m, m.a, b);
            m.out = result && !result.isZero() ? result : null;
            m.a = null;
            if (!m.fixed) m.b = null;
            m.work = 0;
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
      }
    }
  }

  private operate(m: Extract<Machine, { a: unknown }>, a: Multivector, b: Multivector | null): Multivector | null {
    switch (m.type) {
      case 'bloch': {
        const v = bloch(a);
        if (v) this.events.qubit?.('project', a, v);
        return v;
      }
      case 'detector': {
        const p = probUp(a);
        if (!p) return null;
        const up = this.rng() < Q.toNumber(p);
        const result = up ? E3 : E3.neg();
        this.events.qubit?.('measure', a, result);
        return result;
      }
      case 'orrery': {
        if (isState(a) && !m.seen.some((s) => sameState(s, a))) {
          m.seen = [...m.seen, a].slice(-ORRERY_MEMORY);
          this.events.orrery?.(m.seen);
        }
        return a;
      }
      default: {
        const op = OPS[m.type];
        // the sandwich press applies B to A (B A B⁻¹), and a gate multiplies on the left (B A)
        const [left, right] = op === 'sandwich' || m.type === 'gate' ? [b!, a] : [a, b!];
        const result = apply(op, left, right);
        this.events.craft?.(op, left, right, result);
        if (m.type === 'gate' && result && isState(a) && isState(result)) this.events.qubit?.('gate', a, result);
        return result;
      }
    }
  }

  /** offer an element to the block in front of (x, y, z) facing `dir` */
  private push(x: number, y: number, z: number, dir: Dir, mv: Multivector) {
    const [dx, dz] = STEP[dir];
    return this.accept(x + dx, y, z + dz, mv, opposite(dir));
  }

  /** the block at (x, y, z) is offered mv arriving from its side `from`; true if it took it */
  accept(x: number, y: number, z: number, mv: Multivector, from: Dir): boolean {
    const b: Block | undefined = this.world.get(x, y, z);
    if (!b) return false;
    if (b.kind === 'hub') {
      const want = this.order;
      const counted = !!want && counts(want, mv, this.hub);
      if (counted) {
        this.hub.delivered++;
        if (want.kind === 'phases') this.hub.seen = [...(this.hub.seen ?? []), saveMv(mv)];
        if (this.hub.delivered >= want.count) {
          this.hub.order++;
          this.hub.delivered = 0;
          this.hub.seen = [];
          this.events.orderDone?.(want, this.order);
        }
      }
      this.events.deliver?.(mv, counted);
      return true;
    }
    if (b.kind !== 'machine') return false;
    switch (b.type) {
      case 'duct':
        if (b.item || b.facing === from) return false;
        b.item = { id: nextId++, mv, t: 0, from } satisfies Carried;
        return true;
      case 'extractor':
        return false;
      case 'collector': {
        const total = b.stored.reduce((n, s) => n + s.count, 0);
        if (total >= COLLECTOR_CAPACITY) return false;
        const s = b.stored.find((s) => s.mv.equals(mv));
        if (s) s.count++;
        else b.stored.push({ mv, count: 1 });
        return true;
      }
      default: {
        const side = SINGLE_INPUT.includes(b.type) ? (from === b.facing ? null : 'a') : inputSide(b.facing, from);
        if (side === 'a' && !b.a) return (b.a = mv), true;
        if (side === 'b' && !b.b && !b.fixed) return (b.b = mv), true;
        return false;
      }
    }
  }
}

/** which input of an operation machine facing `facing` an arrival from side `from` feeds */
export function inputSide(facing: Dir, from: Dir): 'a' | 'b' | null {
  const rel = (from - facing + 4) % 4;
  return rel === 2 ? 'a' : rel === 0 ? null : 'b';
}
