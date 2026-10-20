// Achievements: an optional tree of milestones that teaches geometric algebra by doing it. Like
// Minecraft's advancements, nothing is locked behind them; an achievement can be earned at any time,
// and the tree only shows how the ideas build on each other. A node is listed once one of its
// parents is earned, so the next ideas come into view as you go.
import type { Multivector } from '@codecraft/ga';
import type { Block } from './world';

export type Op = 'add' | 'sub' | 'wedge' | 'product' | 'contract' | 'sandwich' | 'reverse';

export type GameEvent =
  | { type: 'break'; block: Block }
  | { type: 'inventory'; elements: Multivector[] }
  | { type: 'craft'; op: Op; a: Multivector; b: Multivector | null; result: Multivector }
  | { type: 'place'; block: Block }
  | { type: 'ride'; effect: 'push' | 'spin' | 'bounce' };

export interface Achievement {
  id: string;
  title: string;
  /** what to do, shown before it's earned */
  goal: string;
  /** the idea it teaches, shown once it's earned (and on request before) */
  lesson: string;
  parents: string[];
  test: (e: GameEvent) => boolean;
}

const isVector = (m: Multivector) => !m.isZero() && m.grades().join() === '1';
const isBivector = (m: Multivector) => !m.isZero() && m.grades().join() === '2';
const isRotor = (m: Multivector) => m.grades().join() === '0,2';
const onAxis = (m: Multivector) => m.terms.size === 1;
const negativeOnly = (m: Multivector) => [...m.terms.values()].every((c) => c.n < 0);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'break-ground',
    title: 'Break ground',
    goal: 'Break any block.',
    lesson:
      'The world is a lattice with deposits in it. Red deposits hold e₁, green e₂, blue e₃, and pale ones the scalar 1. Everything else in the game is made from these with the algebra bench.',
    parents: [],
    test: (e) => e.type === 'break',
  },
  {
    id: 'direction',
    title: 'A sense of direction',
    goal: 'Collect a vector from a deposit.',
    lesson:
      'A vector is a direction with a length. e₁ points east, e₂ north and e₃ up, each one block long. Its arrow is drawn the same way in your hand, in your inventory and in the world.',
    parents: ['break-ground'],
    test: (e) => e.type === 'inventory' && e.elements.some(isVector),
  },
  {
    id: 'three-axes',
    title: 'Three axes',
    goal: 'Hold e₁, e₂ and e₃ at the same time.',
    lesson:
      'e₁, e₂ and e₃ are a basis: every vector in this space is some amount of each, like 2e₁ + e₂ − e₃. Three numbers, one per axis, describe any vector.',
    parents: ['direction'],
    test: (e) => e.type === 'inventory' && ['1', '2', '4'].every((b) => e.elements.some((m) => m.terms.size === 1 && m.terms.has(Number(b)) && m.terms.get(Number(b))!.n === 1 && m.terms.get(Number(b))!.d === 1)),
  },
  {
    id: 'head-to-tail',
    title: 'Head to tail',
    goal: 'Add two vectors into one that lies off the axes.',
    lesson:
      'Adding vectors puts them head to tail: e₁ + e₂ points north-east. Adding works coefficient by coefficient, so it never mixes up which axis is which.',
    parents: ['three-axes'],
    test: (e) => e.type === 'craft' && e.op === 'add' && isVector(e.result) && !onAxis(e.result),
  },
  {
    id: 'squares-to-a-number',
    title: 'Squares to a number',
    goal: 'Multiply a vector by itself with the geometric product (AB).',
    lesson:
      'The geometric product of a vector with itself is its length squared, a plain number: e₁e₁ = 1 and (e₁ + e₂)(e₁ + e₂) = 2. This is the one rule the whole algebra is built from.',
    parents: ['direction'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && isVector(e.a) && e.a.equals(e.b),
  },
  {
    id: 'oriented-area',
    title: 'Oriented area',
    goal: 'Wedge two vectors into a bivector (A ∧ B).',
    lesson:
      'a ∧ b is the piece of plane swept out by a and b: its size is the area of their parallelogram, and its ring of arrows runs from a toward b. e₁ ∧ e₂ = e₁₂ is the floor plane, one block in area, turning east-to-north.',
    parents: ['three-axes'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isBivector(e.result),
  },
  {
    id: 'order-matters',
    title: 'Order matters',
    goal: 'Wedge two vectors in the other order and get a negative bivector.',
    lesson: 'b ∧ a = −(a ∧ b). Swapping the order flips the orientation: e₂ ∧ e₁ = −e₁₂ is the same plane turning the other way.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isBivector(e.result) && negativeOnly(e.result),
  },
  {
    id: 'nothing-at-all',
    title: 'Nothing at all',
    goal: 'Wedge a vector with itself.',
    lesson: 'a ∧ a = 0. A vector with itself sweeps out no area, and neither do any two vectors that point the same or opposite ways.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isVector(e.a) && !!e.b && isVector(e.b) && e.result.isZero(),
  },
  {
    id: 'two-grades',
    title: 'Two grades at once',
    goal: 'Take the geometric product of two different vectors that are neither parallel nor at right angles.',
    lesson:
      'For vectors, ab = a·b + a∧b: a number saying how much they agree plus a bivector saying how much they turn. e₁(e₁ + e₂) = 1 + e₁₂. Things with mixed grades are fine; they add like anything else.',
    parents: ['squares-to-a-number', 'oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'product' && e.result.grades().join() === '0,2',
  },
  {
    id: 'square-root-of-minus-one',
    title: 'A real √−1',
    goal: 'Multiply a bivector like e₁₂ by itself.',
    lesson:
      'e₁₂e₁₂ = e₁e₂e₁e₂ = −e₁e₁e₂e₂ = −1. The unit bivector squares to −1, which is why complex numbers describe rotation: i is the floor plane.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && isBivector(e.a) && e.a.equals(e.b) && e.result.isScalar(),
  },
  {
    id: 'volume',
    title: 'Volume',
    goal: 'Wedge a bivector with a third vector into a trivector.',
    lesson:
      'e₁ ∧ e₂ ∧ e₃ = e₁₂₃ is a unit of oriented volume, the biggest thing in three dimensions. It also squares to −1, and multiplying by it swaps a plane for the direction at right angles to it.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.result.grades().join() === '3',
  },
  {
    id: 'quarter-turn',
    title: 'Quarter turn',
    goal: 'Make a rotor: a scalar plus a bivector, such as 1 + e₁₂.',
    lesson:
      'A scalar plus a bivector is a rotor. The product ba of two vectors is the rotor that turns by twice the angle from a to b, in their plane. 1 + e₁₂ turns a quarter turn.',
    parents: ['two-grades'],
    test: (e) => e.type === 'craft' && isRotor(e.result),
  },
  {
    id: 'sandwich',
    title: 'Sandwich',
    goal: 'Apply a rotor to a vector with A B A⁻¹ (A the rotor, B the vector).',
    lesson:
      'R v R⁻¹ turns v. The same sandwich turns anything, bivectors and trivectors included, so one rule handles every kind of object. Try (1 + e₁₂) on e₁ and on e₂.',
    parents: ['quarter-turn'],
    test: (e) => e.type === 'craft' && e.op === 'sandwich' && isRotor(e.a) && !!e.b && isVector(e.b),
  },
  {
    id: 'mirror',
    title: 'Mirror',
    goal: 'Apply a vector to a vector with A B A⁻¹.',
    lesson:
      'n v n⁻¹ reflects v across the line of n, and −n v n⁻¹ reflects it across the plane at right angles to n. Two reflections make a rotation, which is why a rotor is a product of two vectors.',
    parents: ['squares-to-a-number'],
    test: (e) => e.type === 'craft' && e.op === 'sandwich' && isVector(e.a) && !!e.b && isVector(e.b),
  },
  {
    id: 'machine',
    title: 'Machines from algebra',
    goal: 'Place an element in the world.',
    lesson:
      'A placed element acts on whatever stands on it. Its vector part pushes along the arrow, its scalar part springs you up, and the floor-plane part of its bivector (e₁₂) turns you, counter-clockwise for +e₁₂.',
    parents: ['direction'],
    test: (e) => e.type === 'place' && e.block.kind === 'element',
  },
  {
    id: 'along-for-the-ride',
    title: 'Along for the ride',
    goal: 'Stand on a vector machine.',
    lesson: 'Longer vectors push harder: 2e₁ carries you east twice as fast as e₁. Combine vectors at the bench to steer.',
    parents: ['machine'],
    test: (e) => e.type === 'ride' && e.effect === 'push',
  },
  {
    id: 'turntable',
    title: 'Turntable',
    goal: 'Stand on a machine with an e₁₂ part.',
    lesson:
      'A bivector is a plane of rotation. +e₁₂ turns east toward north, counter-clockwise from above; −e₁₂ turns the other way. Rotors are built from exactly this.',
    parents: ['machine', 'oriented-area'],
    test: (e) => e.type === 'ride' && e.effect === 'spin',
  },
];

export class Achievements {
  earned = new Map<string, number>();

  /** returns the achievements this event newly earned */
  notice(e: GameEvent) {
    const fresh: Achievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id) || !a.test(e)) continue;
      this.earned.set(a.id, Date.now());
      fresh.push(a);
    }
    return fresh;
  }

  /** shown in the tree: earned, or with an earned parent, or a root */
  visible(a: Achievement) {
    return this.earned.has(a.id) || !a.parents.length || a.parents.some((p) => this.earned.has(p));
  }

  save() {
    return [...this.earned];
  }

  load(saved: [string, number][]) {
    this.earned = new Map(saved.filter(([id]) => ACHIEVEMENTS.some((a) => a.id === id)));
  }
}
