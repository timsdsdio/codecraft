// What machines cost to build at the bench. Each operation machine takes an element you could only
// have made by doing that operation by hand first, so making something once at the bench is what
// lets you automate it.
import type { Multivector } from '@codecraft/ga';
import { machine, type Inventory, type Item, type MachineType } from './items.ts';

export interface Ingredient {
  /** shown in the recipe, e.g. "any bivector" */
  label: string;
  count: number;
  test: (item: Item) => boolean;
}

export interface Recipe {
  makes: MachineType;
  count: number;
  /** what the machine does, in one line */
  does: string;
  needs: Ingredient[];
}

const isEl = (test: (m: Multivector) => boolean) => (item: Item) => item.kind === 'element' && test(item.mv);
const grades = (m: Multivector) => m.grades().join();
const lattice = (count: number): Ingredient => ({ label: 'lattice', count, test: (i) => i.kind === 'lattice' });

export const RECIPES: Recipe[] = [
  { makes: 'duct', count: 4, does: 'Carries elements the way it points.', needs: [lattice(2)] },
  {
    makes: 'extractor',
    count: 1,
    does: 'Placed against a deposit, draws its element out every 1.5 s.',
    needs: [lattice(4), { label: 'the scalar 1', count: 1, test: isEl((m) => grades(m) === '0') }],
  },
  { makes: 'collector', count: 1, does: 'Stores whatever arrives; open it to take the contents.', needs: [lattice(4)] },
  {
    makes: 'adder',
    count: 1,
    does: 'Outputs A + B.',
    needs: [lattice(4), { label: 'a vector off the axes (e.g. e₁ + e₂)', count: 1, test: isEl((m) => grades(m) === '1' && m.terms.size > 1) }],
  },
  {
    makes: 'wedger',
    count: 1,
    does: 'Outputs A ∧ B.',
    needs: [lattice(4), { label: 'a bivector (e.g. e₁ ∧ e₂)', count: 1, test: isEl((m) => grades(m) === '2') }],
  },
  {
    makes: 'multiplier',
    count: 1,
    does: 'Outputs the geometric product A B.',
    needs: [lattice(4), { label: 'a rotor: scalar + bivector (e.g. e₁(e₁ + e₂))', count: 1, test: isEl((m) => grades(m) === '0,2') }],
  },
  {
    makes: 'sandwich',
    count: 1,
    does: 'Outputs B A B⁻¹: B turns or reflects A.',
    needs: [
      lattice(4),
      { label: 'a rotor', count: 1, test: isEl((m) => grades(m) === '0,2') },
      { label: 'a trivector (e.g. e₁ ∧ e₂ ∧ e₃)', count: 1, test: isEl((m) => grades(m) === '3') },
    ],
  },
];

export const canBuild = (inv: Inventory, r: Recipe) => r.needs.every((n) => inv.count(n.test) >= n.count);

/** spends the ingredients and adds the machine; false if anything is missing */
export function build(inv: Inventory, r: Recipe) {
  if (!canBuild(inv, r)) return false;
  for (const n of r.needs) inv.remove(n.test, n.count);
  inv.add(machine(r.makes), r.count);
  return true;
}
