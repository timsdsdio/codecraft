// Exact rational numbers. Items have to compare equal to stack, so coefficients never touch floating
// point: n/d in lowest terms with d > 0. Plain numbers are enough for the small values a game makes.

export interface Q {
  readonly n: number;
  readonly d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function q(n: number, d = 1): Q {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new RangeError(`not a ratio of integers: ${n}/${d}`);
  if (d === 0) throw new RangeError('division by zero');
  if (n === 0) return ZERO;
  const g = gcd(n, d) * Math.sign(d);
  return { n: n / g, d: d / g };
}

export const ZERO: Q = { n: 0, d: 1 };
export const ONE: Q = { n: 1, d: 1 };

export const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
export const neg = (a: Q): Q => (a.n === 0 ? a : { n: -a.n, d: a.d });
export const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
export const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
export const isZero = (a: Q) => a.n === 0;
export const toNumber = (a: Q) => a.n / a.d;
export const show = (a: Q) => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);
