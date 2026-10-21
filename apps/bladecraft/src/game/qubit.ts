// Qubits as rotors. Any nonzero even element of G(3), R = a + b e₂₃ + c e₃₁ + d e₁₂, is a qubit
// state; its length doesn't matter, so states stay exact without square roots.
//
//   Bloch vector   R e₃ R⁻¹: where the state points on the Bloch sphere. This map from the 3-sphere
//                  of unit rotors to the 2-sphere is the Hopf fibration.
//   phase          R (cos t + e₁₂ sin t): e₁₂ commutes with e₃, so the Bloch vector doesn't move.
//                  The states with one Bloch vector form a circle, its Hopf fiber.
//   gates          G R: a rotor on the left turns the Bloch vector by the rotation G stands for.
//   measurement    the chance of finding the state up (+e₃) is (1 + z) / 2, z being the Bloch
//                  vector's e₃ part.
import { Q, type Multivector, type Rational } from '@codecraft/ga';
import { el, scalar } from './items.ts';

export const E3 = el('3');

export const isState = (m: Multivector) => !m.isZero() && m.grades().every((k) => k % 2 === 0);

/** R e₃ R⁻¹, or null for something that isn't a state */
export const bloch = (r: Multivector) => (isState(r) ? r.sandwich(E3) : null);

/** the same state up to a positive scale (a negative scale is the phase −1, a different state) */
export function sameState(a: Multivector, b: Multivector) {
  const inv = b.inverse();
  if (!inv) return false;
  const k = a.gp(inv);
  return k.isScalar() && !k.isZero() && k.scalarPart().n > 0;
}

/** on the same Hopf fiber: the same Bloch vector */
export function samePoint(a: Multivector, b: Multivector) {
  const pa = bloch(a);
  const pb = bloch(b);
  return !!pa && !!pb && pa.equals(pb);
}

/** the probability of measuring up (+e₃) */
export function probUp(r: Multivector): Rational | null {
  const v = bloch(r);
  if (!v) return null;
  const z = v.terms.get(4) ?? Q.ZERO;
  return Q.div(Q.add(Q.ONE, z), Q.q(2));
}

export type GateId = 'X' | 'Y' | 'Z' | 'H' | 'S';

/** gate rotors, unnormalised: a half turn about e₁, e₂, e₃ or the e₁ + e₃ diagonal, and a quarter turn about e₃ */
export const GATES: Record<GateId, { rotor: Multivector; does: string }> = {
  X: { rotor: el('2', '3'), does: 'half turn about e₁: |0⟩ ↔ |1⟩' },
  Y: { rotor: el('3', '1'), does: 'half turn about e₂' },
  Z: { rotor: el('1', '2'), does: 'half turn about e₃: flips the phase of |1⟩' },
  H: { rotor: el('2', '3').add(el('1', '2')), does: 'half turn about e₁ + e₃: |0⟩ → |+⟩' },
  S: { rotor: scalar(1).sub(el('1', '2')), does: 'quarter turn about e₃: |+⟩ → |+i⟩' },
};

export function gateOf(m: Multivector | null): GateId | null {
  if (!m) return null;
  return (Object.keys(GATES) as GateId[]).find((g) => sameState(GATES[g].rotor, m)) ?? null;
}

// --- floating point, for drawing ---------------------------------------------------------------

/** a unit rotor as (scalar, e₂₃, e₃₁, e₁₂) */
export type Quat = [number, number, number, number];

export function toQuat(r: Multivector): Quat {
  const c = (b: number) => Q.toNumber(r.terms.get(b) ?? Q.ZERO);
  // e₃₁ = −e₁₃, and the blade stored is e₁₃
  const q: Quat = [c(0), c(6), -c(5), c(3)];
  const l = Math.hypot(...q) || 1;
  return q.map((x) => x / l) as Quat;
}

/** product of even elements a + I b, writing bivectors as their dual vectors b */
export function qmul([a1, x1, y1, z1]: Quat, [a2, x2, y2, z2]: Quat): Quat {
  return [
    a1 * a2 - (x1 * x2 + y1 * y2 + z1 * z2),
    a1 * x2 + a2 * x1 - (y1 * z2 - z1 * y2),
    a1 * y2 + a2 * y1 - (z1 * x2 - x1 * z2),
    a1 * z2 + a2 * z1 - (x1 * y2 - y1 * x2),
  ];
}

// the 3-sphere is turned by a fixed rotor before projecting, so that no common state's fiber
// passes through the projection point and becomes a line
const VIEW: Quat = (() => {
  const q: Quat = [0.62, 0.31, -0.48, 0.53];
  const l = Math.hypot(...q);
  return q.map((x) => x / l) as Quat;
})();

/** stereographic projection of a unit rotor into 3D (algebra coordinates) */
export function project(q: Quat): [number, number, number] {
  const [a, x, y, z] = qmul(VIEW, q);
  const k = 1 / Math.max(1e-3, 1 - a);
  return [x * k, y * k, z * k];
}

/** the Hopf fiber through r: its phases R(cos t + e₁₂ sin t), projected, as a closed loop of points */
export function fiber(r: Multivector, n = 96): [number, number, number][] {
  const q = toQuat(r);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return project(qmul(q, [Math.cos(t), 0, 0, Math.sin(t)]));
  });
}
