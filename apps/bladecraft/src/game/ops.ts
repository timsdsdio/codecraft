// The operations of the algebra that the bench and the machines perform.
import type { Multivector } from '@codecraft/ga';

export type Op = 'add' | 'sub' | 'wedge' | 'product' | 'contract' | 'sandwich' | 'reverse';

/** a op b; for 'sandwich', a is applied to b (a b a⁻¹); null when the result doesn't exist */
export function apply(op: Op, a: Multivector, b: Multivector | null): Multivector | null {
  if (op === 'reverse') return a.reverse();
  if (!b) return null;
  switch (op) {
    case 'add':
      return a.add(b);
    case 'sub':
      return a.sub(b);
    case 'wedge':
      return a.op(b);
    case 'product':
      return a.gp(b);
    case 'contract':
      return a.lc(b);
    case 'sandwich':
      return a.sandwich(b);
  }
}
