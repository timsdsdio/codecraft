// Achievements: an optional tree of goals that teaches geometric algebra by doing it. Like a tech
// mod's quest book, a goal is met when the thing it names exists somewhere: in your inventory, in a
// Store, in a machine, or placed in the world. Nothing is delivered or used up, so a factory can be
// rebuilt and extended without losing progress, and nothing is locked behind a goal. Learning a rule
// on the Workbench's rail counts too: that knowledge is yours to keep.
//
// The tree is drawn in four branches (the algebra, the factory, qubits and the field), each read left
// to right. A goal is named once one of its parents is met, so the next ideas come into view as you go.
import { G3, Multivector } from '@codecraft/ga';
import { applyCard, type Card } from './cards.ts';
import { num, valueOf, type Stack } from './items.ts';
import type { Rule } from './products.ts';
import { bloch, isState, sameState, samePoint } from './qubit.ts';
import type { Machine } from './world.ts';

/** everything a goal can look at */
export interface Holdings {
  /** stacks in the inventory, in Stores and inside machines */
  stacks: Stack[];
  /** placed machines */
  machines: Machine[];
  workbenchPlaced: boolean;
  learned: Record<Rule, boolean>;
}

/** the bands the tree is drawn in */
export type Branch = 'algebra' | 'factory' | 'qubits' | 'field';
export const BRANCHES: { id: Branch; title: string }[] = [
  { id: 'algebra', title: 'The algebra' },
  { id: 'factory', title: 'The factory' },
  { id: 'qubits', title: 'Qubits' },
  { id: 'field', title: 'The field' },
];

export interface Achievement {
  id: string;
  branch: Branch;
  title: string;
  /** what to do, shown before it's met */
  goal: string;
  /** the idea it teaches, shown once it's met (and on request before) */
  lesson: string;
  parents: string[];
  test: (h: Holdings) => boolean;
}

const e = (...l: string[]) => Multivector.e(G3, ...l);
const E1 = e('1');
const E2 = e('2');
const E3 = e('3');
const grades = (m: Multivector) => m.grades().join();

/** every element held, as the multivector each stack holds */
const elements = (h: Holdings) => h.stacks.flatMap((s) => (s.item.kind === 'element' ? [valueOf(s)!] : []));
/** element stacks with their weight */
const elementStacks = (h: Holdings) => h.stacks.filter((s) => s.item.kind === 'element');
const readings = (h: Holdings) => h.stacks.flatMap((s) => (s.item.kind === 'reading' ? [s.item.mv] : []));
const cards = (h: Holdings): Card[] => h.stacks.flatMap((s) => (s.item.kind === 'card' ? [s.item] : []));
const has = (h: Holdings, test: (m: Multivector) => boolean) => elements(h).some(test);
const placed = (h: Holdings, type: Machine['type']) => h.machines.some((m) => m.type === type);
const owned = (h: Holdings, type: Machine['type']) =>
  placed(h, type) || h.stacks.some((s) => s.item.kind === 'machine' && s.item.type === type);
/** a stack of this base weighing at least n */
const heavy = (h: Holdings, test: (base: Multivector) => boolean, n: number) =>
  elementStacks(h).some((s) => s.item.kind === 'element' && test(s.item.mv) && num(s.count) >= n);
/** a state whose Bloch vector points the same way as v */
const pointsAlong = (v: Multivector) => (m: Multivector) => {
  const b = isState(m) ? bloch(m) : null;
  return !!b && !b.isZero() && b.op(v).isZero() && b.lc(v).scalarPart().n > 0;
};
const turnsTo = (c: Card, from: Multivector, to: Multivector) => applyCard(c, from)?.equals(to) ?? false;

export const ACHIEVEMENTS: Achievement[] = [
  // --- the algebra ---------------------------------------------------------------------------
  {
    id: 'direction',
    branch: 'algebra',
    title: 'A sense of direction',
    goal: 'Take a vector from a deposit.',
    lesson:
      'A vector is a direction with a length. e₁ points east, e₂ north and e₃ up, each one block long. Its arrow is drawn the same way in your hand, in your inventory and in the world. Deposits never run out: breaking one gives you one blade and leaves it standing.',
    parents: [],
    test: (h) => has(h, (m) => grades(m) === '1'),
  },
  {
    id: 'three-axes',
    branch: 'algebra',
    title: 'Three axes',
    goal: 'Have e₁, e₂ and e₃.',
    lesson: 'e₁, e₂ and e₃ are a basis: every vector in this space is some amount of each, like 2e₁ + e₂ − e₃. Three numbers, one per axis, describe any vector.',
    parents: ['direction'],
    test: (h) => [E1, E2, E3].every((v) => elementStacks(h).some((s) => s.item.kind === 'element' && s.item.mv.equals(v) && s.count.n > 0)),
  },
  {
    id: 'count-up',
    branch: 'algebra',
    title: 'Count up',
    goal: 'Have 8e₁ or more in one stack.',
    lesson:
      'Things stack when one is a multiple of the other, and stacking adds them. Eight unit e₁s stacked are 8e₁: the number on a slot is the weight of what it holds. A stack of rotors is a bigger rotor, and putting −e₁ on e₁ cancels them.',
    parents: ['direction'],
    test: (h) => heavy(h, (b) => b.equals(E1), 8),
  },
  {
    id: 'head-to-tail',
    branch: 'algebra',
    title: 'Head to tail',
    goal: 'Have a vector off the axes, such as e₁ + e₂. Add them on the Workbench tray.',
    lesson: 'Adding vectors puts them head to tail: e₁ + e₂ points north-east. Adding works blade by blade, so it never mixes up which axis is which. A sum of blades is one multivector, carried as one item.',
    parents: ['three-axes'],
    test: (h) => has(h, (m) => grades(m) === '1' && m.terms.size > 1),
  },
  {
    id: 'learn-join',
    branch: 'algebra',
    title: 'Learn to join',
    goal: 'On the Workbench, sort three cells by hand under the Join rule.',
    lesson:
      'Multiplying two blades means laying their factors in a row and sorting them: swapping two neighbours flips the sign, so e₂e₁ = −e₁e₂. Join (∧) allows no cancelling: if two factors match, the result is 0, so e₁ ∧ e₁ = 0.',
    parents: ['three-axes'],
    test: (h) => h.learned.join,
  },
  {
    id: 'oriented-area',
    branch: 'algebra',
    title: 'Oriented area',
    goal: 'Have a bivector, such as e₁ ∧ e₂.',
    lesson:
      'a ∧ b is the piece of plane swept out by a and b: its size is the area of their parallelogram, and its ring of arrows runs from a toward b. e₁ ∧ e₂ = e₁₂ is the floor plane, one block in area, turning east-to-north.',
    parents: ['learn-join'],
    test: (h) => has(h, (m) => grades(m) === '2'),
  },
  {
    id: 'order-matters',
    branch: 'algebra',
    title: 'Order matters',
    goal: 'Have a negative bivector, such as −e₁₂.',
    lesson: 'b ∧ a = −(a ∧ b). Swapping the order flips the orientation: e₂ ∧ e₁ = −e₁₂ is the same plane turning the other way. On the grid, the Join cells mirror across the diagonal with their signs flipped.',
    parents: ['oriented-area'],
    test: (h) => has(h, (m) => grades(m) === '2' && [...m.terms.values()].every((c) => c.n < 0)),
  },
  {
    id: 'volume',
    branch: 'algebra',
    title: 'Volume',
    goal: 'Have a trivector.',
    lesson:
      'e₁ ∧ e₂ ∧ e₃ = e₁₂₃ is a unit of oriented volume, the biggest thing in three dimensions. Call it I. It squares to −1, and multiplying by it swaps a direction for the plane at right angles to it.',
    parents: ['oriented-area'],
    test: (h) => has(h, (m) => grades(m) === '3'),
  },
  {
    id: 'learn-meter',
    branch: 'algebra',
    title: 'Learn to measure',
    goal: 'Sort three cells by hand under the Meter rule.',
    lesson:
      'Meter (⌋) needs every factor of the left blade to cancel: e₁ ⌋ e₁₂ = e₂, what is left of the plane once e₁ is taken out. For two vectors it is the dot product, a number saying how much they agree: e₁ ⌋ (e₁ + e₂) = 1.',
    parents: ['learn-join'],
    test: (h) => h.learned.meter,
  },
  {
    id: 'minus-one',
    branch: 'algebra',
    title: 'A real √−1',
    goal: 'Have a negative scalar, such as −1.',
    lesson:
      'e₁₂ e₁₂ = e₁e₂e₁e₂ = −e₁e₁e₂e₂ = −1: one swap, then two cancels. The unit bivector squares to −1, which is why complex numbers describe rotation: i is the floor plane. Meter gives it too: e₁₂ ⌋ e₁₂ = −1.',
    parents: ['learn-meter'],
    test: (h) => has(h, (m) => grades(m) === '0' && m.scalarPart().n < 0),
  },
  {
    id: 'quarter-turn',
    branch: 'algebra',
    title: 'Both halves',
    goal: 'Have a rotor: a scalar plus a bivector, such as 1 + e₁₂.',
    lesson:
      'Put e₁ + e₂ against e₁ on the grid under Meter, then under Join, and add the results on the tray: 1 and e₁₂. For vectors that sum is the geometric product, ab = a · b + a ∧ b: the diagonal of the grid from Meter, the rest from Join. A scalar plus a bivector is a rotor, and 1 + e₁₂ turns things a quarter turn.',
    parents: ['learn-meter', 'oriented-area'],
    test: (h) => has(h, (m) => grades(m) === '0,2'),
  },
  {
    id: 'learn-multiply',
    branch: 'algebra',
    title: 'The middle grade',
    goal: 'Sort three cells by hand under the Multiply rule.',
    lesson:
      'Join and Meter make the whole product only for vectors. Sort e₁₂ against e₂₃: the e₂ pair cancels, so Join gives 0; e₁ never cancels, so Meter gives 0; yet e₁₂ e₂₃ = e₁₃. Multiply lets anything cancel, and that middle grade is what the two halves miss.',
    parents: ['quarter-turn'],
    test: (h) => h.learned.multiply,
  },
  {
    id: 'right-angles',
    branch: 'algebra',
    title: 'At right angles',
    goal: 'Have a Multiply card pressed from a trivector.',
    lesson:
      'An I card turns every vector into the plane at right angles to it: e₁ becomes e₂₃. Duality is nothing more than using I as an operation. It is how the magnetic field B, a direction, becomes the plane IB in the field F = E + IB.',
    parents: ['volume', 'learn-multiply'],
    test: (h) => cards(h).some((c) => c.verb === 'multiply' && !!c.mv && grades(c.mv) === '3'),
  },
  {
    id: 'backwards',
    branch: 'algebra',
    title: 'Backwards',
    goal: 'Have a Reverse card.',
    lesson:
      'The reverse writes every product backwards: e₁e₂ becomes e₂e₁ = −e₁₂. Scalars and vectors stay as they are; bivectors and trivectors change sign. A rotor times its reverse is a plain number, so the reverse undoes a turn.',
    parents: ['learn-multiply'],
    test: (h) => cards(h).some((c) => c.verb === 'reverse'),
  },

  // --- the factory ---------------------------------------------------------------------------
  {
    id: 'workbench',
    branch: 'factory',
    title: 'A place to work',
    goal: 'Place the Workbench.',
    lesson:
      'The Workbench is where hand work happens: the tray adds and splits multivectors, the grid multiplies them, and the rail shows how any cell of the grid is worked out. Its Build tab makes everything else.',
    parents: [],
    test: (h) => h.workbenchPlaced,
  },
  {
    id: 'built',
    branch: 'factory',
    title: 'Somewhere to keep it',
    goal: 'Build a Store.',
    lesson: 'A Store holds 27 stacks, put in by hand or by duct. Ducts carry one stack at a time the way they point, and wait when the next block is full, so nothing is lost.',
    parents: ['workbench'],
    test: (h) => owned(h, 'store'),
  },
  {
    id: 'generator',
    branch: 'factory',
    title: 'Never run dry',
    goal: 'Place a Generator.',
    lesson:
      'Deposits break into a few blades and are gone. A Generator makes the blade in its sample slot every 1.5 seconds, forever, and keeps the sample: one e₁ in, endless e₁ out. It costs a rotor and a trivector, so it comes once you can make both by hand.',
    parents: ['built', 'quarter-turn'],
    test: (h) => placed(h, 'generator'),
  },
  {
    id: 'stockpile',
    branch: 'factory',
    title: 'Stockpile',
    goal: 'Have a stack of 64e₁ (or any other unit blade).',
    lesson: 'Duct a Generator into a Store and the stack grows by itself: the Store adds every blade that arrives onto the stack it already holds, because multiples stack.',
    parents: ['generator'],
    test: (h) => heavy(h, (b) => b.terms.size === 1, 64),
  },
  {
    id: 'packed',
    branch: 'factory',
    title: 'Two lines into one',
    goal: 'Have 16(e₁ + e₂) or more in one stack.',
    lesson: 'A Packer adds whatever arrives at its back and sides into one multivector. Feed it e₁ and e₂ and it sends out e₁ + e₂; send those into a Store and they stack into 16(e₁ + e₂) and beyond.',
    parents: ['stockpile'],
    test: (h) => heavy(h, (b) => grades(b) === '1' && b.terms.size > 1, 16),
  },
  {
    id: 'logistics',
    branch: 'factory',
    title: 'Fork in the road',
    goal: 'Have a Splitter, a Merger, a Sorter and a Crossing.',
    lesson:
      'A splitter deals out to three sides in turn, a merger takes three inputs in turn, a sorter sends matches to one side (multiples of a sample, or one grade, or qubit states), and a crossing lets two lines pass through one block.',
    parents: ['built'],
    test: (h) => (['splitter', 'merger', 'sorter', 'crossing'] as const).every((t) => owned(h, t)),
  },
  {
    id: 'press',
    branch: 'factory',
    title: 'Item into action',
    goal: 'Press a card.',
    lesson:
      'Every multivector is also an operation. On the Card Press it unfolds into its grade card, and a verb plate says what it will do: Join, Meter, Multiply, Turn, Reverse or Sieve. The card is punched where the multivector has blades, so you can read it off the holes.',
    parents: ['built', 'learn-join'],
    test: (h) => cards(h).length > 0,
  },
  {
    id: 'mill',
    branch: 'factory',
    title: 'The Mill',
    goal: 'Place a Mill.',
    lesson:
      'A Mill applies its cards to what arrives at its back. Cards side by side add their outputs; the second deck works on what the first one made. Its face lights one lamp per pair of blades it multiplies, the Workbench grid made of brass.',
    parents: ['press'],
    test: (h) => placed(h, 'mill'),
  },
  {
    id: 'halves-automated',
    branch: 'factory',
    title: 'Both halves, automated',
    goal: 'Have 16 rotors or more in one stack.',
    lesson: 'A Join card and a Meter card pressed from the same vector, side by side in one Mill, make the geometric product: aX = a ⌋ X + a ∧ X for any vector a. Feed it e₁ + e₂ with e₁ cards and out comes 1 + e₁₂.',
    parents: ['mill', 'quarter-turn'],
    test: (h) => heavy(h, (b) => grades(b) === '0,2', 16),
  },
  {
    id: 'turn',
    branch: 'factory',
    title: 'Quarter turn',
    goal: 'Have a card that turns e₁ into e₂ and e₂ into −e₁.',
    lesson:
      'A Turn card pressed from 1 − e₁₂ does R X R̃ / (R R̃): a quarter turn about e₃. So does one pressed from 2 − 2e₁₂, because a turn forgets the size of its rotor. Two decks of Multiply cards, 1 − e₁₂ then 1 + e₁₂ from the right, turn too, at twice the size.',
    parents: ['mill', 'learn-multiply'],
    test: (h) => cards(h).some((c) => turnsTo(c, E1, E2) && turnsTo(c, E2, E1.neg())),
  },
  {
    id: 'mirror',
    branch: 'factory',
    title: 'Mirror',
    goal: 'Have a card that swaps e₁ and e₂.',
    lesson:
      'A Turn card pressed from a vector reflects: n X n⁻¹ mirrors across the line of n, so e₁ + e₂ swaps e₁ and e₂. It agrees with the quarter turn on e₁ and disagrees on e₂: an operation is pinned down by what it does to more than one thing. Two mirrors make a turn, which is why a rotor is a product of two vectors.',
    parents: ['turn'],
    test: (h) => cards(h).some((c) => turnsTo(c, E1, E2) && turnsTo(c, E2, E1)),
  },

  // --- qubits --------------------------------------------------------------------------------
  {
    id: 'qubit',
    branch: 'qubits',
    title: 'A qubit',
    goal: 'Have |1⟩: a state pointing down.',
    lesson:
      'A rotor is a qubit state. R e₃ R̃ is where it points, its Bloch vector: the scalar 1 points up (|0⟩) and e₂₃ points down (|1⟩). Its size never matters, so states stay exact. A Mill with a live Turn card at its side and e₃ at its back shows where each state points.',
    parents: ['quarter-turn'],
    test: (h) => has(h, pointsAlong(E3.neg())),
  },
  {
    id: 'plus',
    branch: 'qubits',
    title: 'Superposition',
    goal: 'Have |+⟩: a state pointing along e₁.',
    lesson: 'A gate is a rotor multiplied on the left. A Multiply card pressed from H = e₂₃ + e₁₂ is a half turn about the e₁ + e₃ diagonal: it turns |0⟩ into |+⟩ = e₂₃ + e₁₂, an even mix of up and down.',
    parents: ['qubit'],
    test: (h) => has(h, pointsAlong(E1)),
  },
  {
    id: 'plus-i',
    branch: 'qubits',
    title: 'A quarter more',
    goal: 'Have |+i⟩: a state pointing along e₂.',
    lesson: 'S = 1 − e₁₂ is a quarter turn about e₃. A card of it after an H card turns |0⟩ to |+⟩ and then to |+i⟩: two decks, two gates.',
    parents: ['plus'],
    test: (h) => has(h, pointsAlong(E2)),
  },
  {
    id: 'phase',
    branch: 'qubits',
    title: 'A new phase',
    goal: 'Have two different states that point the same way.',
    lesson:
      'e₁₂ commutes with e₃, so R(1 + e₁₂) points where R points: the state has moved without the point it shows moving. A Multiply card from 1 + e₁₂, turned end to end to multiply from the right, is a phase shifter.',
    parents: ['qubit'],
    test: (h) => {
      const states = elements(h).filter(isState);
      return states.some((a, i) => states.some((b, j) => j > i && samePoint(a, b) && !sameState(a, b)));
    },
  },
  {
    id: 'born-rule',
    branch: 'qubits',
    title: 'Born rule',
    goal: 'Have 8e₃ and 8 of −e₃ from a detector.',
    lesson:
      'A detector finds a state up with probability (1 + z) / 2, z being its Bloch vector’s e₃ part: |0⟩ always, |1⟩ never, |+⟩ half the time. Sort its outputs into two Stores and they fill at those rates.',
    parents: ['qubit'],
    test: (h) => placed(h, 'detector') && heavy(h, (b) => b.equals(E3), 8) && elementStacks(h).some((s) => s.item.kind === 'element' && s.item.mv.equals(E3) && num(s.count) <= -8),
  },
  {
    id: 'fiber',
    branch: 'qubits',
    title: 'A Hopf fiber',
    goal: 'Show an orrery a qubit state.',
    lesson:
      'Every phase of a state, R(cos t + e₁₂ sin t), points the same way, and together they make a circle in the 3-sphere of unit rotors: the state’s Hopf fiber. The orrery projects the 3-sphere into space so you can see it, as a ring coloured by the point the state shows.',
    parents: ['phase'],
    test: (h) => h.machines.some((m) => m.type === 'orrery' && m.seen.length > 0),
  },
  {
    id: 'round-the-fiber',
    branch: 'qubits',
    title: 'Round the fiber',
    goal: 'Show an orrery one point in four different phases.',
    lesson:
      'Each phase is a bead on the same ring. Multiplying on the right by 1 + e₁₂ moves a state an eighth of the way round its fiber, so four phase shifters in a row walk it halfway, while its Bloch vector never moves.',
    parents: ['fiber'],
    test: (h) =>
      h.machines.some((m) => {
        if (m.type !== 'orrery') return false;
        const byPoint = new Map<string, number>();
        for (const r of m.seen) {
          const k = bloch(r)?.key() ?? '';
          byPoint.set(k, (byPoint.get(k) ?? 0) + 1);
        }
        return [...byPoint.values()].some((n) => n >= 4);
      }),
  },
  {
    id: 'linked',
    branch: 'qubits',
    title: 'The Hopf fibration',
    goal: 'Show an orrery two states that point different ways.',
    lesson:
      'R ↦ R e₃ R̃ squashes each fiber to one point of the sphere of directions: that map is the Hopf fibration, and a Turn card does it. Fibers of different points never meet, yet every pair is linked, like two rings of a chain, and together they fill the 3-sphere.',
    parents: ['fiber'],
    test: (h) =>
      h.machines.some((m) => {
        if (m.type !== 'orrery') return false;
        const points = m.seen.map((r) => bloch(r)?.key() ?? '');
        return new Set(points).size >= 2;
      }),
  },

  // --- the field -----------------------------------------------------------------------------
  {
    id: 'a-field',
    branch: 'field',
    title: 'A field',
    goal: 'Lay a field plate.',
    lesson:
      'A field gives every point a value. The electromagnetic field gives each point one multivector, F = E + IB: the electric field E is its vector part, and the magnetic field B, times I, is its bivector part. Plates draw E as an orange arrow and IB as a blue disc. Maxwell’s four equations are the four grades of one: (∂ₜ + ∇)F = ρ − j.',
    parents: ['right-angles'],
    test: (h) => placed(h, 'plate'),
  },
  {
    id: 'gauss',
    branch: 'field',
    title: 'Gauss’s law',
    goal: 'Have a reading of an electric field: a vector and nothing else.',
    lesson:
      'The scalar part of (∂ₜ + ∇)F = ρ − j is ∇ · E = ρ: electric field spreads out from charge, away from a positive one and toward a negative one. The plates are one layer, so each charge acts like a long rod running up, and its field falls off as 1/r.',
    parents: ['a-field'],
    test: (h) => readings(h).some((r) => grades(r) === '1'),
  },
  {
    id: 'ampere',
    branch: 'field',
    title: 'Ampère’s law',
    goal: 'Have a reading of a magnetic field: a bivector and nothing else.',
    lesson:
      'The vector part is ∂ₜE = ∇ × B − j: a current makes B circle it, anticlockwise seen from above when it runs up. The trivector part, ∇ · B = 0, says those circles never start or end: there is no magnetic charge. Round a wire the IB discs stand upright like the pages of an open book.',
    parents: ['a-field'],
    test: (h) => readings(h).some((r) => grades(r) === '2'),
  },
  {
    id: 'one-equation',
    branch: 'field',
    title: 'One equation',
    goal: 'Have a reading with E and IB together.',
    lesson:
      'The bivector part is Faraday’s law, ∂ₜB = −∇ × E. With the vector part, a changing E makes B and a changing B makes E, so an antenna’s swinging current sends out waves at 4 blocks a second. In a wave E and B are at right angles and equally strong, so F² = 0: light is a field whose square vanishes.',
    parents: ['gauss', 'ampere'],
    test: (h) => readings(h).some((r) => grades(r) === '1,2'),
  },
];

export interface TreeNode {
  a: Achievement;
  col: number;
  row: number;
  /** parents in other branches, shown as a note on the node */
  outside: Achievement[];
}

/**
 * Lays out one branch as a tree read left to right: a node's column is one more than its deepest
 * parent's in the same branch, and within a column nodes sit in the order of their parents' rows,
 * so lines from parents to children cross as little as possible.
 */
export function layoutBranch(branch: Branch) {
  const mine = ACHIEVEMENTS.filter((a) => a.branch === branch);
  const ids = new Set(mine.map((a) => a.id));
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  const col = new Map<string, number>();
  const colOf = (a: Achievement): number => {
    if (!col.has(a.id)) col.set(a.id, Math.max(-1, ...a.parents.filter((p) => ids.has(p)).map((p) => colOf(byId.get(p)!))) + 1);
    return col.get(a.id)!;
  };
  const columns: Achievement[][] = [];
  for (const a of mine) (columns[colOf(a)] ??= []).push(a);
  const row = new Map<string, number>();
  for (const c of columns) {
    const key = (a: Achievement) => {
      const rows = a.parents.filter((p) => row.has(p)).map((p) => row.get(p)!);
      return rows.length ? rows.reduce((n, r) => n + r, 0) / rows.length : -1;
    };
    // a stable sort keeps the written order among children of the same parents
    [...c].sort((x, y) => key(x) - key(y)).forEach((a, i) => row.set(a.id, Math.max(i, Math.round(key(a)))));
    // nudge down any node that landed on a row already taken in this column
    const taken = new Set<number>();
    for (const a of [...c].sort((x, y) => row.get(x.id)! - row.get(y.id)!)) {
      let r = row.get(a.id)!;
      while (taken.has(r)) r++;
      taken.add(r);
      row.set(a.id, r);
    }
  }
  const nodes: TreeNode[] = mine.map((a) => ({
    a,
    col: col.get(a.id)!,
    row: row.get(a.id)!,
    outside: a.parents.filter((p) => !ids.has(p)).map((p) => byId.get(p)!),
  }));
  const edges = mine.flatMap((a) => a.parents.filter((p) => ids.has(p)).map((p) => [p, a.id] as const));
  return { nodes, edges, columns: columns.length, rows: Math.max(...nodes.map((n) => n.row)) + 1 };
}

export class Achievements {
  earned = new Map<string, number>();

  /** marks every goal the holdings now meet; returns the ones newly met */
  check(h: Holdings) {
    const fresh: Achievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id) || !a.test(h)) continue;
      this.earned.set(a.id, Date.now());
      fresh.push(a);
    }
    return fresh;
  }

  /** within reach: earned, or with an earned parent, or a root */
  reachable(a: Achievement) {
    return this.earned.has(a.id) || !a.parents.length || a.parents.some((p) => this.earned.has(p));
  }

  /** the goals worth suggesting next: within reach and not yet met, in tree order */
  next() {
    return ACHIEVEMENTS.filter((a) => !this.earned.has(a.id) && this.reachable(a));
  }

  save() {
    return [...this.earned];
  }

  load(saved: [string, number][]) {
    this.earned = new Map(saved.filter(([id]) => ACHIEVEMENTS.some((a) => a.id === id)));
  }
}
