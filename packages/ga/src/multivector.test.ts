import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G3, Multivector, PGA3, type Algebra } from './multivector.ts';
import * as Q from './rational.ts';

const e = (...l: string[]) => Multivector.e(G3, ...l);
const s = (n: number) => Multivector.scalar(G3, n);
const same = (a: Multivector, b: Multivector) => assert.equal(a.key(), b.key(), `${a} ≠ ${b}`);

test('basis vectors square to the metric', () => {
  same(e('1').gp(e('1')), s(1));
  const p = (l: string) => Multivector.e(PGA3, l);
  assert.ok(p('0').gp(p('0')).isZero());
  same(p('2').gp(p('2')), Multivector.scalar(PGA3, 1));
});

test('distinct basis vectors anticommute', () => {
  same(e('1').gp(e('2')), e('1', '2'));
  same(e('2').gp(e('1')), e('1', '2').neg());
  same(e('2', '1'), e('1', '2').neg());
});

test('a unit bivector squares to −1 and the pseudoscalar of G(3) too', () => {
  same(e('1', '2').gp(e('1', '2')), s(-1));
  same(e('1', '2', '3').gp(e('1', '2', '3')), s(-1));
});

test('the wedge of a vector with itself is zero, and the wedge is antisymmetric on vectors', () => {
  const a = e('1').add(e('2').scale(3));
  const b = e('2').sub(e('3'));
  assert.ok(a.op(a).isZero());
  same(a.op(b), b.op(a).neg());
});

test('for vectors, ab = a⌋b + a∧b', () => {
  const a = e('1').scale(2).add(e('2'));
  const b = e('2').add(e('3').scale(-4));
  same(a.gp(b), a.lc(b).add(a.op(b)));
  assert.deepEqual(a.lc(b).scalarPart(), Q.q(1));
});

test('the wedge of three axes is the volume element', () => {
  same(e('1').op(e('2')).op(e('3')), e('1', '2', '3'));
  same(e('3').op(e('2')).op(e('1')), e('1', '2', '3').neg());
});

// a small deterministic pseudo-random multivector with integer coefficients
function sample(alg: Algebra, seed: number) {
  let x = seed;
  const next = () => ((x = (x * 1103515245 + 12345) % 2147483648) % 7) - 3;
  const terms: [number, Q.Q][] = [];
  for (let b = 0; b < 1 << alg.metric.length; b++) terms.push([b, Q.q(next())]);
  return Multivector.fromTerms(alg, terms);
}

test('the geometric product is associative and distributive', () => {
  for (const alg of [G3, PGA3])
    for (let i = 1; i < 6; i++) {
      const [a, b, c] = [sample(alg, i), sample(alg, i * 7 + 1), sample(alg, i * 13 + 2)];
      same(a.gp(b).gp(c), a.gp(b.gp(c)));
      same(a.gp(b.add(c)), a.gp(b).add(a.gp(c)));
      same(a.op(b).op(c), a.op(b.op(c)));
    }
});

test('reversion reverses products', () => {
  for (let i = 1; i < 6; i++) {
    const [a, b] = [sample(G3, i), sample(G3, i + 40)];
    same(a.gp(b).reverse(), b.reverse().gp(a.reverse()));
  }
  same(e('1', '2', '3').reverse(), e('1', '2', '3').neg());
});

test('the rotor 1 + e₁₂ turns e₁ a quarter turn onto e₂, exactly', () => {
  const r = s(1).add(e('1', '2'));
  same(r.sandwich(e('1'))!, e('2').neg());
  // the reverse rotor turns the other way
  same(r.reverse().sandwich(e('1'))!, e('2'));
  // and it is the product of two vectors 45° apart, divided out by its length
  same(e('1').gp(e('1').add(e('2'))), r);
});

test('a vector sandwich reflects along the vector; with a minus sign, in the plane across it', () => {
  const v = e('1');
  const x = e('1').add(e('2'));
  same(v.sandwich(x)!, e('1').sub(e('2')));
  same(v.sandwich(x)!.neg(), e('2').sub(e('1')));
});

test('inverses only exist when X X̃ is a nonzero scalar', () => {
  same(e('1').scale(2).inverse()!, e('1').scale(Q.q(1, 2)));
  assert.equal(s(0).inverse(), null);
  assert.equal(s(1).add(e('1')).inverse(), null);
});

test('printing', () => {
  assert.equal(String(s(0)), '0');
  assert.equal(String(e('1').add(e('2'))), 'e₁ + e₂');
  assert.equal(String(s(1).sub(e('1', '2'))), '1 − e₁₂');
  assert.equal(String(e('2', '1')), '−e₁₂');
  assert.equal(String(e('3').scale(Q.q(-3, 2))), '−3/2e₃');
  assert.equal(String(Multivector.e(PGA3, '0', '1')), 'e₀₁');
});

test('keys identify values regardless of how they were made', () => {
  assert.ok(e('1').add(e('2')).equals(e('2').add(e('1'))));
  assert.ok(!e('1').equals(e('2')));
  assert.throws(() => e('1').add(Multivector.e(PGA3, '1')));
});
