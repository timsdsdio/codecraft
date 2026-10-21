// Achievements: an optional tree of milestones that teaches geometric algebra by doing it. Like
// Minecraft's advancements, nothing is locked behind them; an achievement can be earned at any time,
// and the tree only shows how the ideas build on each other. It is drawn in four branches (the
// algebra, the factory, qubits and the field), each read left to right. A node is named once one of
// its parents is earned, so the next ideas come into view as you go.
import { G3, Multivector } from '@codecraft/ga';
import type { MachineType } from './items.ts';
import type { Op } from './ops.ts';
import type { Block } from './world.ts';
import { ORDERS } from './orders.ts';

export type GameEvent =
  | { type: 'break'; block: Block }
  | { type: 'inventory'; elements: Multivector[] }
  | { type: 'craft'; by: 'hand' | 'machine'; op: Op; a: Multivector; b: Multivector | null; result: Multivector }
  | { type: 'build'; machine: MachineType }
  | { type: 'place'; block: Block }
  | { type: 'deliver'; mv: Multivector }
  | { type: 'order'; index: number }
  | { type: 'qubit'; kind: 'project' | 'gate' | 'measure'; input: Multivector; result: Multivector }
  | { type: 'orrery'; seen: Multivector[] }
  /** a source set while standing in a field, or a probe's reading */
  | { type: 'field'; kind: 'charge' | 'wire' | 'antenna' | 'reading'; mv: Multivector }
  /** a logistics block sent an element somewhere other than straight on */
  | { type: 'route'; kind: 'split' | 'merge' | 'sort' | 'cross' };

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
const isEven = (m: Multivector) => !m.isZero() && m.grades().every((k) => k % 2 === 0);
/** in span{1, e₁₂} with some e₁₂: a phase */
const isPhase = (m: Multivector) => m.terms.has(3) && [...m.terms.keys()].every((b) => b === 0 || b === 3);
const pointKey = (r: Multivector) => r.sandwich(el3)?.key() ?? '';
const el3 = Multivector.e(G3, '3');
const onAxis = (m: Multivector) => m.terms.size === 1;
const isTrivector = (m: Multivector) => !m.isZero() && m.grades().join() === '3';
/** the index of the last order of each tier, so finishing a tier can be noticed */
const lastOf = (test: (kind: string) => boolean) => ORDERS.reduce((last, o, i) => (test(o.kind ?? 'exact') ? i : last), -1);
const LAST_ALGEBRA = lastOf((k) => k === 'exact');
const LAST_QUBIT = lastOf((k) => k === 'state' || k === 'phases');
const LAST_FIELD = lastOf((k) => k === 'reading');
const negativeOnly = (m: Multivector) => [...m.terms.values()].every((c) => c.n < 0);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'break-ground',
    branch: 'factory',
    title: 'Break ground',
    goal: 'Break any block.',
    lesson:
      'The world is a lattice with deposits in it, each labelled with its element: e₁ (red), e₂ (green), e₃ (blue) and the scalar 1 (pale). Breaking a deposit gives you one and leaves it standing; an extractor draws on it forever. Everything else is made from these.',
    parents: [],
    test: (e) => e.type === 'break',
  },
  {
    id: 'direction',
    branch: 'algebra',
    title: 'A sense of direction',
    goal: 'Collect a vector from a deposit.',
    lesson:
      'A vector is a direction with a length. e₁ points east, e₂ north and e₃ up, each one block long. Its arrow is drawn the same way in your hand, in your inventory and in the world.',
    parents: ['break-ground'],
    test: (e) => e.type === 'inventory' && e.elements.some(isVector),
  },
  {
    id: 'three-axes',
    branch: 'algebra',
    title: 'Three axes',
    goal: 'Hold e₁, e₂ and e₃ at the same time.',
    lesson:
      'e₁, e₂ and e₃ are a basis: every vector in this space is some amount of each, like 2e₁ + e₂ − e₃. Three numbers, one per axis, describe any vector.',
    parents: ['direction'],
    test: (e) => e.type === 'inventory' && ['1', '2', '4'].every((b) => e.elements.some((m) => m.terms.size === 1 && m.terms.has(Number(b)) && m.terms.get(Number(b))!.n === 1 && m.terms.get(Number(b))!.d === 1)),
  },
  {
    id: 'head-to-tail',
    branch: 'algebra',
    title: 'Head to tail',
    goal: 'Add two vectors into one that lies off the axes.',
    lesson:
      'Adding vectors puts them head to tail: e₁ + e₂ points north-east. Adding works coefficient by coefficient, so it never mixes up which axis is which.',
    parents: ['three-axes'],
    test: (e) => e.type === 'craft' && e.op === 'add' && isVector(e.result) && !onAxis(e.result),
  },
  {
    id: 'squares-to-a-number',
    branch: 'algebra',
    title: 'Squares to a number',
    goal: 'Multiply a vector by itself with the geometric product (AB).',
    lesson:
      'The geometric product of a vector with itself is its length squared, a plain number: e₁e₁ = 1 and (e₁ + e₂)(e₁ + e₂) = 2. This is the one rule the whole algebra is built from.',
    parents: ['direction'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && isVector(e.a) && e.a.equals(e.b),
  },
  {
    id: 'oriented-area',
    branch: 'algebra',
    title: 'Oriented area',
    goal: 'Wedge two vectors into a bivector (A ∧ B).',
    lesson:
      'a ∧ b is the piece of plane swept out by a and b: its size is the area of their parallelogram, and its ring of arrows runs from a toward b. e₁ ∧ e₂ = e₁₂ is the floor plane, one block in area, turning east-to-north.',
    parents: ['three-axes'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isBivector(e.result),
  },
  {
    id: 'order-matters',
    branch: 'algebra',
    title: 'Order matters',
    goal: 'Wedge two vectors in the other order and get a negative bivector.',
    lesson: 'b ∧ a = −(a ∧ b). Swapping the order flips the orientation: e₂ ∧ e₁ = −e₁₂ is the same plane turning the other way.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isBivector(e.result) && negativeOnly(e.result),
  },
  {
    id: 'nothing-at-all',
    branch: 'algebra',
    title: 'Nothing at all',
    goal: 'Wedge a vector with itself.',
    lesson: 'a ∧ a = 0. A vector with itself sweeps out no area, and neither do any two vectors that point the same or opposite ways.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'wedge' && isVector(e.a) && !!e.b && isVector(e.b) && e.result.isZero(),
  },
  {
    id: 'two-grades',
    branch: 'algebra',
    title: 'Two grades at once',
    goal: 'Take the geometric product of two different vectors that are neither parallel nor at right angles.',
    lesson:
      'For vectors, ab = a·b + a∧b: a number saying how much they agree plus a bivector saying how much they turn. e₁(e₁ + e₂) = 1 + e₁₂. Things with mixed grades are fine; they add like anything else.',
    parents: ['squares-to-a-number', 'oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'product' && e.result.grades().join() === '0,2',
  },
  {
    id: 'square-root-of-minus-one',
    branch: 'algebra',
    title: 'A real √−1',
    goal: 'Multiply a bivector like e₁₂ by itself.',
    lesson:
      'e₁₂e₁₂ = e₁e₂e₁e₂ = −e₁e₁e₂e₂ = −1. The unit bivector squares to −1, which is why complex numbers describe rotation: i is the floor plane.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && isBivector(e.a) && e.a.equals(e.b) && e.result.isScalar(),
  },
  {
    id: 'volume',
    branch: 'algebra',
    title: 'Volume',
    goal: 'Wedge a bivector with a third vector into a trivector.',
    lesson:
      'e₁ ∧ e₂ ∧ e₃ = e₁₂₃ is a unit of oriented volume, the biggest thing in three dimensions. It also squares to −1, and multiplying by it swaps a plane for the direction at right angles to it.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.result.grades().join() === '3',
  },
  {
    id: 'quarter-turn',
    branch: 'algebra',
    title: 'Quarter turn',
    goal: 'Make a rotor: a scalar plus a bivector, such as 1 + e₁₂.',
    lesson:
      'A scalar plus a bivector is a rotor. The product ba of two vectors is the rotor that turns by twice the angle from a to b, in their plane. 1 + e₁₂ turns a quarter turn.',
    parents: ['two-grades'],
    test: (e) => e.type === 'craft' && isRotor(e.result),
  },
  {
    id: 'sandwich',
    branch: 'algebra',
    title: 'Sandwich',
    goal: 'Apply a rotor to a vector with A B A⁻¹ (A the rotor, B the vector).',
    lesson:
      'R v R⁻¹ turns v. The same sandwich turns anything, bivectors and trivectors included, so one rule handles every kind of object. Try (1 + e₁₂) on e₁ and on e₂.',
    parents: ['quarter-turn'],
    test: (e) => e.type === 'craft' && e.op === 'sandwich' && isRotor(e.a) && !!e.b && isVector(e.b),
  },
  {
    id: 'mirror',
    branch: 'algebra',
    title: 'Mirror',
    goal: 'Apply a vector to a vector with A B A⁻¹.',
    lesson:
      'n v n⁻¹ reflects v across the line of n, and −n v n⁻¹ reflects it across the plane at right angles to n. Two reflections make a rotation, which is why a rotor is a product of two vectors.',
    parents: ['squares-to-a-number'],
    test: (e) => e.type === 'craft' && e.op === 'sandwich' && isVector(e.a) && !!e.b && isVector(e.b),
  },
  {
    id: 'whats-left',
    branch: 'algebra',
    title: 'What’s left',
    goal: 'Contract a vector into a bivector (A ⌋ B).',
    lesson:
      'a ⌋ B takes a out of B: e₁ ⌋ e₁₂ = e₂, what is left of the floor plane once e₁ is taken out. Contracting a vector into a vector gives their dot product, a number. The wedge raises grade and the contraction lowers it.',
    parents: ['oriented-area'],
    test: (e) => e.type === 'craft' && e.op === 'contract' && isVector(e.a) && !!e.b && isBivector(e.b) && isVector(e.result),
  },
  {
    id: 'backwards',
    branch: 'algebra',
    title: 'Backwards',
    goal: 'Reverse a bivector (Ã).',
    lesson:
      'The reverse writes every product backwards: e₁e₂ becomes e₂e₁ = −e₁₂. Scalars and vectors stay as they are, while bivectors and trivectors change sign. The reverse of a rotor turns the other way, so R R̃ is a plain number and R̃ undoes R.',
    parents: ['order-matters'],
    test: (e) => e.type === 'craft' && e.op === 'reverse' && e.a.grades().includes(2),
  },
  {
    id: 'right-angles',
    branch: 'algebra',
    title: 'At right angles',
    goal: 'Multiply a vector by a trivector with the geometric product.',
    lesson:
      'e₁₂₃ e₃ = e₁₂: multiplying by the unit volume I = e₁₂₃ swaps a direction for the plane at right angles to it, and a plane for the direction at right angles to it. This is duality, and it is how the magnetic field B, a direction, becomes the plane IB in the field F = E + IB.',
    parents: ['volume'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && ((isTrivector(e.a) && isVector(e.b)) || (isVector(e.a) && isTrivector(e.b))),
  },
  {
    id: 'built',
    branch: 'factory',
    title: 'Built to last',
    goal: 'Build a machine at the bench.',
    lesson:
      'Machines are made from elements. An extractor costs the scalar 1, a wedger costs a bivector, a multiplier a rotor: to automate an operation, you first do it by hand.',
    parents: ['break-ground'],
    test: (e) => e.type === 'build',
  },
  {
    id: 'delivery',
    branch: 'factory',
    title: 'Special delivery',
    goal: 'Get an element to the hub by duct.',
    lesson:
      'Ducts carry one element at a time the way they point, and wait when the next block is full, so nothing is ever lost. The hub takes anything, but only elements matching its order count.',
    parents: ['built'],
    test: (e) => e.type === 'deliver',
  },
  {
    id: 'order-filled',
    branch: 'factory',
    title: 'Order filled',
    goal: 'Complete an order at the hub.',
    lesson: 'Each order asks for an element one operation further along. Its hint says which machine makes it and what to feed it.',
    parents: ['delivery'],
    test: (e) => e.type === 'order',
  },
  {
    id: 'hands-off',
    branch: 'factory',
    title: 'Hands off',
    goal: 'Have a machine combine two elements.',
    lesson:
      'A machine takes A from its back and B from its sides, or uses a fixed B set in its panel. With a fixed B, a wedger becomes "wedge everything with e₃" and a sandwich press "turn everything by this rotor".',
    parents: ['built'],
    test: (e) => e.type === 'craft' && e.by === 'machine',
  },
  {
    id: 'fork',
    branch: 'factory',
    title: 'Fork in the road',
    goal: 'Have a splitter send an element out of one of its sides.',
    lesson:
      'A splitter deals what arrives at its back to its front, left and right in turn, skipping any side with nowhere to go. One extractor can then feed both inputs of a machine, or three machines at once.',
    parents: ['delivery'],
    test: (e) => e.type === 'route' && e.kind === 'split',
  },
  {
    id: 'two-into-one',
    branch: 'factory',
    title: 'Two into one',
    goal: 'Have a merger send on an element that came in at one of its sides.',
    lesson:
      'A merger takes from its back, left and right in turn and sends everything out of its front, so no input crowds out the others. Several lines can then share one duct to the hub.',
    parents: ['fork'],
    test: (e) => e.type === 'route' && e.kind === 'merge',
  },
  {
    id: 'sorted',
    branch: 'factory',
    title: 'Sorted',
    goal: 'Have a sorter send a match out of its side.',
    lesson:
      'A sorter looks at each element: those matching its sample, or of the kind it is set to (scalars, vectors, bivectors, trivectors or qubit states), leave by one side and the rest go straight on. Sorting by grade is sorting by what kind of object something is.',
    parents: ['fork'],
    test: (e) => e.type === 'route' && e.kind === 'sort',
  },
  {
    id: 'crossroads',
    branch: 'factory',
    title: 'Crossroads',
    goal: 'Send an element through a crossing.',
    lesson: 'A crossing lets two lines pass through one block: whatever comes in on one side leaves by the opposite side, so the lines never mix.',
    parents: ['fork'],
    test: (e) => e.type === 'route' && e.kind === 'cross',
  },
  {
    id: 'algebra-delivered',
    branch: 'factory',
    title: 'Algebra delivered',
    goal: 'Fill the hub’s first seven orders, up to the sandwich press.',
    lesson:
      'From two vectors you have made a sum, a bivector of each orientation, a rotor, a volume and a rotation, each by a machine. Every element of G(3) can be reached this way: sums of products of e₁, e₂ and e₃.',
    parents: ['order-filled'],
    test: (e) => e.type === 'order' && e.index === LAST_ALGEBRA,
  },
  {
    id: 'qubit',
    branch: 'qubits',
    title: 'A qubit',
    goal: 'Send a rotor through a Bloch projector.',
    lesson:
      'A rotor is a qubit state. R e₃ R⁻¹ is where it points, its Bloch vector: the scalar 1 points up (|0⟩), e₂₃ points down (|1⟩), and e₂₃ + e₁₂ points along e₁ (|+⟩). Its length never matters, so states stay exact.',
    parents: ['quarter-turn'],
    test: (e) => e.type === 'qubit' && e.kind === 'project',
  },
  {
    id: 'quantum-gate',
    branch: 'qubits',
    title: 'Quantum gate',
    goal: 'Have a gate machine act on a state.',
    lesson:
      'A gate is a rotor multiplied on the left, G R, and it turns the Bloch vector by the rotation G stands for: X is a half turn about e₁, H a half turn about the e₁ + e₃ diagonal, S a quarter turn about e₃.',
    parents: ['qubit'],
    test: (e) => e.type === 'qubit' && e.kind === 'gate',
  },
  {
    id: 'born-rule',
    branch: 'qubits',
    title: 'Born rule',
    goal: 'Measure a state with a detector.',
    lesson:
      'A detector finds a state up with probability (1 + z) / 2, z being its Bloch vector’s e₃ part: |0⟩ always, |1⟩ never, |+⟩ half the time. Only the Bloch vector matters, not the phase.',
    parents: ['qubit'],
    test: (e) => e.type === 'qubit' && e.kind === 'measure',
  },
  {
    id: 'new-phase',
    branch: 'qubits',
    title: 'A new phase',
    goal: 'Multiply a state on the right by a phase such as 1 + e₁₂.',
    lesson:
      'e₁₂ commutes with e₃, so R(1 + e₁₂) has the same Bloch vector as R: the state has moved without the point it shows moving. On the left, the same element would be a gate and turn the point.',
    parents: ['qubit'],
    test: (e) => e.type === 'craft' && e.op === 'product' && !!e.b && isEven(e.a) && isPhase(e.b) && isEven(e.result),
  },
  {
    id: 'hopf-fiber',
    branch: 'qubits',
    title: 'Hopf fiber',
    goal: 'Show an orrery two different states with the same Bloch vector.',
    lesson:
      'All the phases of one state form a circle in the 3-sphere of unit rotors, and R ↦ R e₃ R⁻¹ squashes each circle to one point of the Bloch sphere. That is the Hopf fibration; the orrery draws the circles, projected into 3D.',
    parents: ['new-phase'],
    test: (e) => {
      if (e.type !== 'orrery') return false;
      const keys = e.seen.map(pointKey);
      return keys.some((k, i) => keys.indexOf(k) !== i);
    },
  },
  {
    id: 'linked',
    branch: 'qubits',
    title: 'Linked rings',
    goal: 'Show an orrery states on two different Bloch points.',
    lesson:
      'The fibers of two different points never meet, yet every pair is linked: you can’t pull one ring off another without cutting it. The whole 3-sphere is filled with such rings, one for each point of the Bloch sphere.',
    parents: ['hopf-fiber'],
    test: (e) => e.type === 'orrery' && new Set(e.seen.map(pointKey)).size >= 2,
  },
  {
    id: 'qubits-delivered',
    branch: 'qubits',
    title: 'Qubits delivered',
    goal: 'Fill every qubit order.',
    lesson:
      'Up, down, |+⟩ in four phases and |+i⟩: you have pointed a qubit along every axis of the Bloch sphere using nothing but rotors, and moved it round its fiber without moving the point it shows.',
    parents: ['quantum-gate'],
    test: (e) => e.type === 'order' && e.index === LAST_QUBIT,
  },
  // the field: Maxwell's four equations are the four grades of one, (∂ₜ + ∇)F = ρ − j
  {
    id: 'a-field',
    branch: 'field',
    title: 'A field',
    goal: 'Lay a field plate.',
    lesson:
      'A field gives every point a value. The electromagnetic field gives each point one multivector, F = E + IB with I = e₁₂₃: the electric field E is its vector part, and the magnetic field B, times I, is its bivector part, a small plane at right angles to the way B points. Plates draw E as an orange arrow and IB as a blue disc. Maxwell’s four equations are the four grades of one: (∂ₜ + ∇)F = ρ − j, with ∇ = e₁∂₁ + e₂∂₂ + e₃∂₃.',
    parents: ['right-angles'],
    test: (e) => e.type === 'place' && e.block.kind === 'machine' && e.block.type === 'plate',
  },
  {
    id: 'gauss',
    branch: 'field',
    title: 'Gauss’s law',
    goal: 'Give a charge standing in a field a scalar.',
    lesson:
      'The scalar part of (∂ₜ + ∇)F = ρ − j is ∇·E = ρ: electric field spreads out from charge, away from a positive one and toward a negative one. The plates are one layer, so the field acts as if each charge were a long rod running straight up, and it falls off as 1/r. A field’s edge is earthed, which pulls the field toward it.',
    parents: ['a-field'],
    test: (e) => e.type === 'field' && e.kind === 'charge' && !e.mv.isZero(),
  },
  {
    id: 'ampere',
    branch: 'field',
    title: 'Ampère’s law',
    goal: 'Run a current up a wire standing in a field.',
    lesson:
      'The vector part is ∂ₜE = ∇×B − j: a current makes the magnetic field circle it. Current up a wire (along e₃) makes B run anticlockwise round it, seen from above. IB is the plane at right angles to B, so round a wire the discs stand upright and fan out from it, like the pages of an open book.',
    parents: ['a-field'],
    test: (e) => e.type === 'field' && e.kind === 'wire' && e.mv.terms.has(4),
  },
  {
    id: 'faraday',
    branch: 'field',
    title: 'Faraday’s law',
    goal: 'Run an antenna in a field.',
    lesson:
      'The bivector part is ∂ₜB = −∇×E: a changing magnetic field makes an electric field curl round it. Together with the vector part, a changing E makes B and a changing B makes E, so the field carries itself away from a swinging current as a wave, at the speed of light: 4 blocks a second here.',
    parents: ['ampere'],
    test: (e) => e.type === 'field' && e.kind === 'antenna' && e.mv.terms.has(4),
  },
  {
    id: 'no-monopoles',
    branch: 'field',
    title: 'No monopoles',
    goal: 'Have a probe read a magnetic field.',
    lesson:
      'The trivector part is ∇·B = 0: magnetic field has no sources, because there is no magnetic charge. Round a wire B runs in closed loops with no start or end, where E from a charge starts at the charge.',
    parents: ['ampere'],
    test: (e) => e.type === 'field' && e.kind === 'reading' && e.mv.grades().includes(2),
  },
  {
    id: 'one-equation',
    branch: 'field',
    title: 'One equation',
    goal: 'Have a probe read E and IB together.',
    lesson:
      'A reading is the whole field at a point as one multivector: E + IB, a vector plus a bivector. In a wave E and B are at right angles and equally strong, so F² = E² − B² + 2I E·B is 0: light is a field whose square vanishes.',
    parents: ['gauss', 'faraday'],
    test: (e) => e.type === 'field' && e.kind === 'reading' && e.mv.grades().join() === '1,2',
  },
  {
    id: 'every-order',
    branch: 'field',
    title: 'Every order filled',
    goal: 'Fill the hub’s last order.',
    lesson:
      'Vectors, planes and volumes; rotations and reflections; qubits and their fibers; and Maxwell’s equations as one. All of it came from one rule, that a vector times itself is its length squared.',
    parents: ['one-equation'],
    test: (e) => e.type === 'order' && e.index === LAST_FIELD,
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
