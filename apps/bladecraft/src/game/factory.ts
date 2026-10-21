// The factory: moves stacks through generators, ducts and machines, a fixed number of ticks per
// second. It works on the world's blocks directly and knows nothing about drawing.
//
// Every machine faces one of four directions and pushes what it makes out of its front into the
// block there. A duct carries one stack at a time, so a packed multivector rides as one crate. What a
// block accepts depends on which side something arrives from:
//   duct        anything, from any side but its front
//   store       anything, from any side, while it has room
//   splitter    from its back; deals out to its front, left and right in turn
//   merger      from its back, left and right, one each; sends them out the front in turn
//   sorter      from its back; matches go out one side, everything else straight on
//   crossing    from any side, one per side; each leaves by the opposite side
//   packer      elements from its back, left and right; once every side that is fed has delivered,
//               it adds them and sends the sum out the front
//   unpacker    an element from its back; sends its blades out the front one at a time
//   mill        an element X at its back, and at a side when its live lever is set; it applies its
//               cards, one lamp of work per pair of blades, and sends the result out the front
//   detector    a qubit state from any side but its front; sends e₃ or −e₃ by the Born rule
//   orrery      anything from any side but its front, passed straight through, recording states
//   charge      a scalar from any side, which adds to its charge (up to 8 either way)
//   wire        a vector from any side, which adds to what it holds (up to 8); its e₃ part is the current
//   antenna     the same, as the size of a current that swings up and down
//   probe       nothing; once a second it records the field where it stands as a reading
// Results of 0, and elements of the wrong kind sent to a machine that wants another, are not taken.
import { Q, type Multivector } from '@codecraft/ga';
import { card, lampCount, millOutput, type Card } from './cards.ts';
import { Field, PROBE_EVERY } from './field.ts';
import { canMerge, merge, num, sameItem, stackOf, valueOf, type Stack } from './items.ts';
import { terms } from './products.ts';
import { E3, isState, probUp, sameState } from './qubit.ts';
import { addTo } from './slots.ts';
import { STEP, opposite, type Block, type Carried, type Dir, type Machine, type SortMode, type World } from './world.ts';

export const TICK = 1 / 20;
export const DUCT_SPEED = 1.5; // blocks per second
export const GENERATE_EVERY = 1.5; // seconds per blade
export const WORK_TIME = 1; // seconds per measurement
export const LAMP_TIME = 0.25; // seconds per pair of blades a Mill multiplies out
export const PACK_TIME = 0.5;
export const SOURCE_LIMIT = 8;
export const ORRERY_MEMORY = 12;

export interface FactoryEvents {
  /** a probe recorded a reading */
  reading?(mv: Multivector): void;
}

let nextId = 1;

/** the cards in a Mill's two decks */
export function decks(m: Extract<Machine, { type: 'mill' }>): [Card[], Card[]] {
  const cardsIn = (i: number[]) => i.map((k) => m.cards[k]?.item).filter((c): c is Card => c?.kind === 'card');
  return [cardsIn([0, 1]), cardsIn([2, 3])];
}

export class Factory {
  private carry = 0;
  private world: World;
  private events: FactoryEvents;
  private rng: () => number;
  readonly field = new Field();

  constructor(world: World, events: FactoryEvents = {}, rng: () => number = Math.random) {
    this.world = world;
    this.events = events;
    this.rng = rng;
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
    this.field.step(this.world, dt);
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
        if (m.item.t >= 1 && this.push(x, y, z, m.facing, m.item.stack)) m.item = null;
        return;
      }
      case 'generator': {
        // a copy of the blade in its sample slot, weight ±1; the sample stays
        const sample = m.sample?.item.kind === 'element' && m.sample.item.mv.terms.size === 1 ? m.sample : null;
        if (!m.out && sample) {
          m.timer += dt;
          if (m.timer >= GENERATE_EVERY) {
            m.timer = 0;
            m.out = { item: sample.item, count: Q.q(Math.sign(sample.count.n)) };
          }
        } else if (!sample) m.timer = 0;
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
        return;
      }
      case 'splitter': {
        // deal out to the front, left and right in turn, skipping any that are full
        if (!m.item) return;
        for (let k = 0; k < 3; k++) {
          const i = (m.next + k) % 3;
          if (this.push(x, y, z, rel(m.facing, SPLIT_ORDER[i]), m.item)) {
            m.item = null;
            m.next = (i + 1) % 3;
            return;
          }
        }
        return;
      }
      case 'merger': {
        // take from the back, left and right in turn, so no input starves the others
        for (let k = 0; k < 3; k++) {
          const i = (m.next + k) % 3;
          const side = MERGE_ORDER[i];
          const s = m.slots[side];
          if (!s) continue;
          if (this.push(x, y, z, m.facing, s)) {
            m.slots[side] = null;
            m.next = (i + 1) % 3;
          }
          return;
        }
        return;
      }
      case 'sorter': {
        if (!m.item) return;
        const dir = sortMatches(m.mode, m.filter, m.item) ? rel(m.facing, m.side) : m.facing;
        if (this.push(x, y, z, dir, m.item)) m.item = null;
        return;
      }
      case 'crossing': {
        for (const from of [0, 1, 2, 3] as Dir[]) {
          const s = m.slots[from];
          if (s && this.push(x, y, z, opposite(from), s)) m.slots[from] = null;
        }
        return;
      }
      case 'packer': {
        if (!m.out) {
          const fed = this.fedSides(m, x, y, z);
          const ready = fed.length > 0 && fed.every((r) => m.slots[r]);
          if (ready) {
            const sum = fed.reduce((acc, r) => acc.add(valueOf(m.slots[r]!)!), E3.scale(0));
            fed.forEach((r) => (m.slots[r] = null));
            m.out = stackOf(sum);
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
        return;
      }
      case 'unpacker': {
        if (!m.queue.length && m.item) {
          m.queue = terms(valueOf(m.item)!).map((t) => stackOf(t)!);
          m.item = null;
        }
        if (m.queue.length && this.push(x, y, z, m.facing, m.queue[0])) m.queue.shift();
        return;
      }
      case 'mill': {
        if (!m.out && m.x && (!m.live || m.side)) {
          const x0 = valueOf(m.x)!;
          const [d1, d2] = decks(m);
          if (m.live && m.side) d1.push(card(m.live, valueOf(m.side)));
          m.lamps = lampCount(d1, d2, x0);
          m.work += dt;
          if (m.work >= m.lamps * LAMP_TIME) {
            m.out = stackOf(millOutput(d1, d2, x0));
            m.x = null;
            m.side = null;
            m.work = 0;
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
        return;
      }
      case 'detector':
      case 'orrery': {
        if (m.a && !m.out) {
          m.work += dt;
          if (m.work >= WORK_TIME) {
            m.out = m.type === 'detector' ? this.measure(m.a) : this.watch(m, m.a);
            m.a = null;
            m.work = 0;
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
        return;
      }
      case 'probe': {
        if (!m.out && this.field.regionAt(x, y, z)) {
          m.timer += dt;
          if (m.timer >= PROBE_EVERY) {
            m.timer = 0;
            const r = this.field.read(x, y, z);
            m.reading = r;
            // a zero field records nothing
            if (!r.isZero()) {
              m.out = { item: { kind: 'reading', mv: r }, count: Q.ONE };
              this.events.reading?.(r);
            }
          }
        }
        if (m.out && this.push(x, y, z, m.facing, m.out)) m.out = null;
        return;
      }
      default:
        return;
    }
  }

  /** a detector finds the state up with probability (1 + z)/2 and sends e₃ or −e₃ */
  private measure(s: Stack): Stack | null {
    const p = probUp(valueOf(s)!);
    if (!p) return null;
    return stackOf(this.rng() < Q.toNumber(p) ? E3 : E3.neg());
  }

  /** an orrery records each distinct state that passes and lets everything through */
  private watch(m: Extract<Machine, { type: 'orrery' }>, s: Stack) {
    const mv = valueOf(s);
    if (mv && isState(mv) && !m.seen.some((r) => sameState(r, mv))) m.seen = [...m.seen, mv].slice(-ORRERY_MEMORY);
    return s;
  }

  /** the sides of a packer that something feeds into */
  private fedSides(m: Machine, x: number, y: number, z: number) {
    return [1, 2, 3].filter((r) => {
      const d = rel(m.facing, r);
      const [dx, dz] = STEP[d];
      const n = this.world.get(x + dx, y, z + dz);
      return n?.kind === 'machine' && outputs(n).includes(opposite(d));
    });
  }

  /** offer a stack to the block in front of (x, y, z) facing `dir` */
  private push(x: number, y: number, z: number, dir: Dir, s: Stack) {
    const [dx, dz] = STEP[dir];
    return this.accept(x + dx, y, z + dz, s, opposite(dir));
  }

  /** the block at (x, y, z) is offered a stack arriving from its side `from`; true if it took all of it */
  accept(x: number, y: number, z: number, s: Stack, from: Dir): boolean {
    const b: Block | undefined = this.world.get(x, y, z);
    if (b?.kind !== 'machine') return false;
    const isElement = s.item.kind === 'element';
    const side = relative(b.facing, from);
    switch (b.type) {
      case 'duct':
        if (b.item || b.facing === from) return false;
        b.item = { id: nextId++, stack: s, t: 0, from } satisfies Carried;
        return true;
      case 'store': {
        const copy = [...b.slots];
        if (addTo(copy, s)) return false;
        b.slots = copy;
        return true;
      }
      case 'splitter':
      case 'sorter':
        if (b.item || side !== 2) return false;
        return (b.item = s), true;
      case 'merger':
        if (side === 0 || b.slots[side]) return false;
        return (b.slots[side] = s), true;
      case 'crossing':
        if (b.slots[from]) return false;
        return (b.slots[from] = s), true;
      case 'packer':
        if (!isElement || side === 0 || b.slots[side]) return false;
        return (b.slots[side] = s), true;
      case 'unpacker':
        if (!isElement || side !== 2 || b.item || b.queue.length) return false;
        return (b.item = s), true;
      case 'mill':
        if (!isElement) return false;
        if (side === 2 && !b.x) return (b.x = s), true;
        if ((side === 1 || side === 3) && b.live && !b.side) return (b.side = s), true;
        return false;
      case 'detector':
        if (!isElement || side === 0 || b.a || !isState(valueOf(s)!)) return false;
        return (b.a = s), true;
      case 'orrery':
        if (side === 0 || b.a) return false;
        return (b.a = s), true;
      case 'charge':
      case 'wire':
      case 'antenna': {
        const grade = b.type === 'charge' ? '0' : '1';
        if (!isElement || valueOf(s)!.grades().join() !== grade) return false;
        if (!b.slot) return Math.abs(num(s.count)) <= SOURCE_LIMIT && ((b.slot = s), true);
        if (!canMerge(b.slot, s, true)) return false;
        const m = merge(b.slot, s);
        if (m.rest || (m.target && Math.abs(num(m.target.count)) > SOURCE_LIMIT)) return false;
        b.slot = m.target;
        return true;
      }
      default:
        return false;
    }
  }
}

/** a side relative to a facing: 0 front, 1 left, 2 back, 3 right */
export const relative = (facing: Dir, side: Dir) => (side - facing + 4) % 4;
/** the absolute side at a relative position to a facing */
export const rel = (facing: Dir, r: number) => ((facing + r) % 4) as Dir;
export const SPLIT_ORDER = [0, 1, 3];
export const MERGE_ORDER = [2, 1, 3];

/** the sides a machine can push things out of */
export function outputs(m: Machine): Dir[] {
  switch (m.type) {
    case 'store':
    case 'press':
    case 'plate':
    case 'charge':
    case 'wire':
    case 'antenna':
      return [];
    case 'splitter':
      return SPLIT_ORDER.map((r) => rel(m.facing, r));
    case 'sorter':
      return [m.facing, rel(m.facing, m.side)];
    case 'crossing':
      return [0, 1, 2, 3];
    default:
      return [m.facing];
  }
}

/** does a sorter in this mode, with this sample, send a stack to its side? Only elements ever match. */
export function sortMatches(mode: SortMode, filter: Multivector | null, s: Stack) {
  const mv = valueOf(s);
  if (!mv) return false;
  if (mode === 'same') return !!filter && sameItem(s.item, stackOf(filter)!.item);
  if (mode === 'state') return isState(mv);
  const g = mv.grades();
  const want = { scalar: 0, vector: 1, bivector: 2, trivector: 3 }[mode];
  return g.length === 1 && g[0] === want;
}
