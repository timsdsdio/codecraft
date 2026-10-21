// The hub's orders, in sequence. Each asks for a number of one element, delivered by duct, and its
// hint names the machine and inputs that make it. Delivering an order moves the hub to the next.
import type { Multivector } from '@codecraft/ga';
import { el, scalar } from './items.ts';

export interface Order {
  want: Multivector;
  count: number;
  hint: string;
}

const e1 = el('1');
const e2 = el('2');
const e3 = el('3');
const e12 = e1.op(e2);

export const ORDERS: Order[] = [
  {
    want: e1,
    count: 8,
    hint: 'Build an extractor at the bench, place it against the red e₁ deposit, and lay ducts from its output to the hub.',
  },
  {
    want: e1.add(e2),
    count: 8,
    hint: 'An adder outputs A + B. Duct e₁ into its back (A) and e₂ into a side (B).',
  },
  {
    want: e12,
    count: 8,
    hint: 'A wedger outputs A ∧ B. Duct e₁ into its back and e₂ into a side.',
  },
  {
    want: e12.neg(),
    count: 8,
    hint: 'Swap a wedger’s inputs: e₂ ∧ e₁ = −e₁₂.',
  },
  {
    want: scalar(1).add(e12),
    count: 8,
    hint: 'A multiplier outputs the geometric product A B. Try e₁ times e₁ + e₂.',
  },
  {
    want: e12.op(e3),
    count: 8,
    hint: 'Chain two wedgers: e₁ ∧ e₂, then wedge the result with e₃.',
  },
  {
    want: e2.sub(e1),
    count: 8,
    hint: 'A sandwich press outputs B A B⁻¹, turning A by the rotor B. Set its B to 1 − e₁₂ (made as e₂(e₁ + e₂)) and feed it e₁ + e₂.',
  },
];

export interface HubProgress {
  order: number;
  delivered: number;
}
