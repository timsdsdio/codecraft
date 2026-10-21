// What things cost to build at the Workbench. Machines and verb plates cost elements you could only
// have made by hand, and a plate also needs its rule learned on the rail, so a machine can never do
// anything you haven't done yourself.
import type { Multivector } from '@codecraft/ga';
import { stack, machine, type Item, type Stack } from './items.ts';
import type { Rule } from './products.ts';
import { E3 } from './qubit.ts';
import { addTo, countUnits, removeUnits, PICKUP_ORDER, type Slots } from './slots.ts';
import type { SortMode } from './world.ts';

export interface Ingredient {
  /** shown in the recipe, e.g. "a bivector" */
  label: string;
  count: number;
  test: (item: Item) => boolean;
}

export interface Recipe {
  makes: Item;
  count: number;
  /** what it does, in one line */
  does: string;
  needs: Ingredient[];
  /** rules that must be learned on the rail first */
  learned?: Rule[];
}

const isEl = (test: (m: Multivector) => boolean) => (item: Item) => item.kind === 'element' && test(item.mv);
const grades = (m: Multivector) => m.grades().join();
const lattice = (count: number): Ingredient => ({ label: 'lattice', count, test: (i) => i.kind === 'lattice' });
const one = (label: string, test: (m: Multivector) => boolean, count = 1): Ingredient => ({ label, count, test: isEl(test) });

const SCALAR = one('the scalar 1', (m) => grades(m) === '0');
const OFF_AXIS = one('a vector off the axes (e.g. e₁ + e₂)', (m) => grades(m) === '1' && m.terms.size > 1);
const BIVECTOR = one('a bivector (e.g. e₁₂)', (m) => grades(m) === '2');
const TRIVECTOR = one('a trivector (e₁₂₃)', (m) => grades(m) === '3');
const ROTOR = one('a rotor: scalar + bivector (e.g. 1 + e₁₂)', (m) => grades(m) === '0,2');

export const RECIPES: Recipe[] = [
  { makes: { kind: 'workbench' }, count: 1, does: 'Hand work: the tray, the grid and the rail. Builds everything else.', needs: [lattice(4)] },
  { makes: machine('duct'), count: 4, does: 'Carries one stack at a time the way it points.', needs: [lattice(2)] },
  { makes: machine('extractor'), count: 1, does: 'Placed against a deposit, draws its blade out every 1.5 s.', needs: [lattice(4), SCALAR] },
  { makes: machine('store'), count: 1, does: 'Holds 27 stacks, put in by hand or by duct.', needs: [lattice(4)] },
  { makes: machine('packer'), count: 1, does: 'Adds what arrives at its back and sides into one multivector.', needs: [lattice(4), OFF_AXIS] },
  { makes: machine('unpacker'), count: 1, does: 'Splits a multivector into its blades, one stack each.', needs: [lattice(4), OFF_AXIS] },
  { makes: machine('splitter'), count: 1, does: 'Deals what arrives at its back to its front, left and right in turn.', needs: [lattice(6)] },
  { makes: machine('merger'), count: 1, does: 'Takes from its back, left and right in turn and sends everything out the front.', needs: [lattice(6)] },
  { makes: machine('sorter'), count: 1, does: 'Sends matches out of one side and everything else straight on.', needs: [lattice(6), SCALAR] },
  { makes: machine('crossing'), count: 1, does: 'Lets two lines cross: whatever comes in one side leaves by the opposite side.', needs: [lattice(4)] },
  { makes: machine('press'), count: 1, does: 'Presses a multivector and a verb plate into a card.', needs: [lattice(6), BIVECTOR] },
  { makes: { kind: 'blank' }, count: 4, does: 'Card stock for the Card Press.', needs: [lattice(2)] },
  { makes: machine('mill'), count: 1, does: 'Applies its cards to what arrives: side by side they add, the second deck runs after the first.', needs: [lattice(6), TRIVECTOR] },
  { makes: { kind: 'plate', verb: 'join' }, count: 1, does: 'Presses cards that do M ∧ X.', needs: [lattice(2), BIVECTOR], learned: ['join'] },
  { makes: { kind: 'plate', verb: 'meter' }, count: 1, does: 'Presses cards that do M ⌋ X.', needs: [lattice(2), SCALAR], learned: ['meter'] },
  { makes: { kind: 'plate', verb: 'sieve' }, count: 1, does: 'Presses cards that keep the grades M has and drop the rest.', needs: [lattice(2), OFF_AXIS], learned: ['meter'] },
  { makes: { kind: 'plate', verb: 'multiply' }, count: 1, does: 'Presses cards that do M X (or X M, turned end to end).', needs: [lattice(2), ROTOR], learned: ['multiply'] },
  { makes: { kind: 'plate', verb: 'reverse' }, count: 1, does: 'Presses cards that reverse X (no multivector needed).', needs: [lattice(2), BIVECTOR], learned: ['multiply'] },
  { makes: { kind: 'plate', verb: 'turn' }, count: 1, does: 'Presses cards that do M X M̃ / (M M̃): turns, or mirrors for a vector M.', needs: [lattice(2), { ...ROTOR, count: 2 }], learned: ['multiply'] },
  { makes: machine('detector'), count: 1, does: 'Measures a qubit state: sends e₃ (up) or −e₃ (down), up with probability (1 + z) / 2.', needs: [lattice(4), one('e₃', (m) => m.equals(E3), 2)] },
  { makes: machine('orrery'), count: 1, does: 'Passes things through and draws the Hopf fiber of each distinct state.', needs: [lattice(4), ROTOR, TRIVECTOR] },
  { makes: machine('plate'), count: 8, does: 'Holds the electromagnetic field F = E + IB. Plates side by side make one field.', needs: [lattice(4), TRIVECTOR] },
  { makes: machine('charge'), count: 1, does: 'In a field, its scalar is a charge whose electric field spreads out from it.', needs: [lattice(4), SCALAR] },
  { makes: machine('wire'), count: 1, does: 'In a field, the e₃ part of its vector is a current up the wire; B circles it.', needs: [lattice(4), one('e₃', (m) => m.equals(E3))] },
  { makes: machine('antenna'), count: 1, does: 'A wire whose current swings up and down: it sends waves across the field.', needs: [lattice(4), one('e₃', (m) => m.equals(E3)), ROTOR] },
  { makes: machine('probe'), count: 1, does: 'In a field, records the field where it stands once a second: F = E + IB.', needs: [lattice(4), one('a vector', (m) => grades(m) === '1'), BIVECTOR] },
];

export const canBuild = (slots: Slots, r: Recipe, learned: (rule: Rule) => boolean) =>
  (r.learned ?? []).every(learned) && r.needs.every((n) => countUnits(slots, n.test) >= n.count);

/** spends the ingredients and adds what it makes; false if anything is missing */
export function build(slots: Slots, r: Recipe, learned: (rule: Rule) => boolean): Stack | null | false {
  if (!canBuild(slots, r, learned)) return false;
  for (const n of r.needs) removeUnits(slots, n.test, n.count);
  return addTo(slots, stack(r.makes, r.count), PICKUP_ORDER);
}

/** how a sorter's setting reads: "multiples of e₁" or "vectors" */
export function sortLabel(mode: SortMode, filter: Multivector | null) {
  if (mode === 'same') return filter ? `multiples of ${filter}` : 'nothing (no sample set)';
  return { scalar: 'scalars', vector: 'vectors', bivector: 'bivectors', trivector: 'trivectors', state: 'qubit states' }[mode];
}


