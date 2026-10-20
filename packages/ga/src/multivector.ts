// Multivectors of a Clifford algebra with any signature, with exact rational coefficients.
//
// A basis blade is a bitmask over the basis vectors: in 3D, 0b011 is e₁₂ (e₁ ∧ e₂) and 0b111 is
// e₁₂₃. A multivector is a sparse map from blades to coefficients. Products work blade by blade: the
// sign comes from the swaps needed to put the basis vectors in order, and each basis vector the two
// blades share contributes its square from the metric (+1, −1, or 0 in projective algebras).
import * as Q from './rational.ts';
import type { Q as Rational } from './rational.ts';

export interface Algebra {
  readonly name: string;
  /** what each basis vector squares to, in order */
  readonly metric: readonly number[];
  /** label of each basis vector, used as a subscript: e₁, e₂, … */
  readonly labels: readonly string[];
}

/** 3D Euclidean geometric algebra: arrows, oriented areas and volumes, rotations about the origin */
export const G3: Algebra = { name: 'G(3)', metric: [1, 1, 1], labels: ['1', '2', '3'] };
/** 3D projective geometric algebra: planes, lines and points, and every rigid motion */
export const PGA3: Algebra = { name: 'G(3,0,1)', metric: [0, 1, 1, 1], labels: ['0', '1', '2', '3'] };

const popcount = (x: number) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

/** sign from reordering the basis vectors of a·b into canonical order */
function reorderSign(a: number, b: number) {
  let swaps = 0;
  for (a >>= 1; a; a >>= 1) swaps += popcount(a & b);
  return swaps & 1 ? -1 : 1;
}

export const grade = (blade: number) => popcount(blade);

export class Multivector {
  readonly alg: Algebra;
  /** blade → coefficient, never holding zeros */
  readonly terms: ReadonlyMap<number, Rational>;

  private constructor(alg: Algebra, terms: ReadonlyMap<number, Rational>) {
    this.alg = alg;
    this.terms = terms;
  }

  static zero(alg: Algebra) {
    return new Multivector(alg, new Map());
  }

  static scalar(alg: Algebra, n: number | Rational) {
    return Multivector.blade(alg, 0, n);
  }

  /** a basis blade times a coefficient: blade(G3, 0b11) is e₁₂ */
  static blade(alg: Algebra, blade: number, n: number | Rational = 1) {
    const c = typeof n === 'number' ? Q.q(n) : n;
    return new Multivector(alg, Q.isZero(c) ? new Map() : new Map([[blade, c]]));
  }

  /** basis vector by label: e(G3, '1') is e₁ */
  static e(alg: Algebra, ...labels: string[]) {
    return labels.reduce((acc, l) => {
      const i = alg.labels.indexOf(l);
      if (i < 0) throw new RangeError(`no basis vector e${l} in ${alg.name}`);
      return acc.gp(Multivector.blade(alg, 1 << i));
    }, Multivector.scalar(alg, 1));
  }

  static fromTerms(alg: Algebra, terms: Iterable<[number, Rational]>) {
    const map = new Map<number, Rational>();
    for (const [b, c] of terms) {
      const sum = Q.add(map.get(b) ?? Q.ZERO, c);
      if (Q.isZero(sum)) map.delete(b);
      else map.set(b, sum);
    }
    return new Multivector(alg, map);
  }

  private same(o: Multivector) {
    if (o.alg !== this.alg) throw new TypeError(`can't combine ${this.alg.name} with ${o.alg.name}`);
  }

  private combine(o: Multivector, f: (a: number, b: number) => { blade: number; sign: number } | null) {
    this.same(o);
    const out: [number, Rational][] = [];
    for (const [a, ca] of this.terms)
      for (const [b, cb] of o.terms) {
        const r = f(a, b);
        if (r && r.sign) out.push([r.blade, Q.mul(Q.q(r.sign), Q.mul(ca, cb))]);
      }
    return Multivector.fromTerms(this.alg, out);
  }

  private bladeProduct = (a: number, b: number) => {
    let sign = reorderSign(a, b);
    const shared = a & b;
    for (let i = 0; shared >> i; i++) if ((shared >> i) & 1) sign *= this.alg.metric[i];
    return { blade: a ^ b, sign };
  };

  add(o: Multivector) {
    this.same(o);
    return Multivector.fromTerms(this.alg, [...this.terms, ...o.terms]);
  }
  sub(o: Multivector) {
    return this.add(o.neg());
  }
  neg() {
    return this.scale(Q.q(-1));
  }
  scale(s: number | Rational) {
    const c = typeof s === 'number' ? Q.q(s) : s;
    return Multivector.fromTerms(this.alg, [...this.terms].map(([b, v]) => [b, Q.mul(v, c)] as [number, Rational]));
  }

  /** geometric product ab */
  gp(o: Multivector) {
    return this.combine(o, this.bladeProduct);
  }
  /** outer (wedge) product a ∧ b: the part of ab whose grade is the sum of the grades */
  op(o: Multivector) {
    return this.combine(o, (a, b) => (a & b ? null : this.bladeProduct(a, b)));
  }
  /** left contraction a ⌋ b: the part of ab whose grade is grade(b) − grade(a) */
  lc(o: Multivector) {
    return this.combine(o, (a, b) => ((a & ~b) !== 0 ? null : this.bladeProduct(a, b)));
  }

  /** reverse: each blade of grade k gets the sign (−1)^(k(k−1)/2) */
  reverse() {
    return this.mapBlades((b) => ((grade(b) * (grade(b) - 1)) / 2) % 2 ? -1 : 1);
  }
  /** grade involution: each blade of grade k gets the sign (−1)^k */
  involute() {
    return this.mapBlades((b) => (grade(b) % 2 ? -1 : 1));
  }
  private mapBlades(sign: (blade: number) => number) {
    return Multivector.fromTerms(this.alg, [...this.terms].map(([b, c]) => [b, Q.mul(c, Q.q(sign(b)))] as [number, Rational]));
  }

  /** the part of grade k */
  grade(k: number) {
    return Multivector.fromTerms(this.alg, [...this.terms].filter(([b]) => grade(b) === k));
  }
  /** grades present, ascending */
  grades() {
    return [...new Set([...this.terms.keys()].map(grade))].sort((a, b) => a - b);
  }
  scalarPart() {
    return this.terms.get(0) ?? Q.ZERO;
  }
  isZero() {
    return this.terms.size === 0;
  }
  isScalar() {
    return this.terms.size === 0 || (this.terms.size === 1 && this.terms.has(0));
  }

  /** inverse of a versor (a product of vectors): X̃ / (X X̃), or null when X X̃ isn't a nonzero scalar */
  inverse() {
    const rev = this.reverse();
    const norm = this.gp(rev);
    if (!norm.isScalar() || norm.isZero()) return null;
    return rev.scale(Q.div(Q.ONE, norm.scalarPart()));
  }

  /** V X V⁻¹, or null when V has no inverse */
  sandwich(x: Multivector) {
    const inv = this.inverse();
    return inv ? this.gp(x).gp(inv) : null;
  }

  equals(o: Multivector) {
    return o.alg === this.alg && o.key() === this.key();
  }

  /** a canonical string: equal multivectors have equal keys */
  key() {
    return (
      this.alg.name +
      ':' +
      [...this.terms]
        .sort(([a], [b]) => a - b)
        .map(([b, c]) => `${b}=${c.n}/${c.d}`)
        .join(',')
    );
  }

  toString() {
    if (this.isZero()) return '0';
    const sorted = [...this.terms].sort(([a], [b]) => grade(a) - grade(b) || a - b);
    return sorted
      .map(([b, c], i) => {
        const negative = c.n < 0;
        const abs = Q.show({ n: Math.abs(c.n), d: c.d });
        const name = bladeName(this.alg, b);
        const body = !name ? abs : abs === '1' ? name : `${abs}${name}`;
        if (i === 0) return negative ? `−${body}` : body;
        return negative ? ` − ${body}` : ` + ${body}`;
      })
      .join('');
  }
}

const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

/** e₁₂ for blade 0b011; '' for the scalar blade */
export function bladeName(alg: Algebra, blade: number) {
  if (!blade) return '';
  let s = 'e';
  for (let i = 0; i < alg.labels.length; i++) if ((blade >> i) & 1) s += [...alg.labels[i]].map((ch) => SUB[ch] ?? ch).join('');
  return s;
}
