// How an element of G(3) looks. Each grade has its own picture, layered when an element mixes
// grades:
//   scalar     an orb, white when positive and magenta when negative, bigger for bigger values
//   vector     an arrow, in the axis colour when it lies on an axis (e₁ red, e₂ green, e₃ blue)
//   bivector   a square piece of plane with a ring of arrows showing its orientation; it turns slowly
//              in its own plane, the way it would turn things
//   trivector  a wire cube, solid edges for +e₁₂₃ and a different colour for −e₁₂₃
import * as THREE from 'three';
import { Q, type Multivector } from '@codecraft/ga';

export const AXIS_COLOURS = [0xff5a5a, 0x5aff8a, 0x5aa8ff];
const NEUTRAL = 0x00fff0;
const NEGATIVE = 0xff4dc4;

const c = (mv: Multivector, blade: number) => Q.toNumber(mv.terms.get(blade) ?? Q.ZERO);

/** algebra coordinates (e₁ east, e₂ north, e₃ up) → three.js world (x east, y up, z south) */
export const toWorld = (a: number, b: number, up: number) => new THREE.Vector3(a, up, -b);

export interface Parts {
  scalar: number;
  /** vector part in algebra coordinates */
  vector: [number, number, number];
  /** bivector part as its normal (the dual vector) in algebra coordinates: e₂₃ → e₁, e₃₁ → e₂, e₁₂ → e₃ */
  normal: [number, number, number];
  trivector: number;
}

export function parts(mv: Multivector): Parts {
  return {
    scalar: c(mv, 0),
    vector: [c(mv, 1), c(mv, 2), c(mv, 4)],
    normal: [c(mv, 6), -c(mv, 5), c(mv, 3)],
    trivector: c(mv, 7),
  };
}

export const vectorColour = ([a, b, d]: number[]) => {
  const nonzero = [a, b, d].map((v) => v !== 0);
  if (nonzero.filter(Boolean).length === 1) return AXIS_COLOURS[nonzero.indexOf(true)];
  return NEUTRAL;
};

const len = (v: number[]) => Math.hypot(...v);

/** squashes any size into a range that fits in a block while keeping bigger things bigger */
const fit = (x: number, max: number) => (max * x) / (1 + x);

export class Glyph extends THREE.Group {
  private spinner: THREE.Object3D | null = null;
  private spinRate = 0;

  constructor(mv: Multivector, size = 1) {
    super();
    const p = parts(mv);

    if (p.scalar) {
      const r = fit(Math.abs(p.scalar), 0.22) * size;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 12),
        new THREE.MeshStandardMaterial({ color: p.scalar > 0 ? 0xffffff : NEGATIVE, emissive: p.scalar > 0 ? 0x8a8a6a : 0x6a1050 }),
      );
      this.add(orb);
    }

    const vl = len(p.vector);
    if (vl) {
      const dir = toWorld(...p.vector).normalize();
      const length = fit(vl, 0.9) * size;
      const colour = vectorColour(p.vector);
      const arrow = new THREE.ArrowHelper(dir, dir.clone().multiplyScalar(-length / 2), length, colour, 0.18 * size, 0.12 * size);
      (arrow.line.material as THREE.LineBasicMaterial).linewidth = 2;
      // a thick shaft so it reads at a distance
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025 * size, 0.025 * size, length - 0.18 * size, 8),
        new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.4 }),
      );
      shaft.position.copy(dir.clone().multiplyScalar(-0.09 * size));
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.add(arrow, shaft);
    }

    const bl = len(p.normal);
    if (bl) {
      const n = toWorld(...p.normal).normalize();
      const side = Math.sqrt(fit(bl, 0.6)) * size;
      const plane = new THREE.Group();
      plane.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(side, side),
          new THREE.MeshStandardMaterial({ color: NEUTRAL, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
        ),
        new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(side, side)),
          new THREE.LineBasicMaterial({ color: NEUTRAL }),
        ),
        orientationRing(side * 0.32, NEUTRAL),
      );
      // the plane's local +z is its normal; the ring runs counter-clockwise seen from +z
      plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      this.add(plane);
      this.spinner = plane;
      this.spinRate = 0.8;
    }

    if (p.trivector) {
      const s = fit(Math.abs(p.trivector), 0.7) * size;
      this.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)),
          new THREE.LineBasicMaterial({ color: p.trivector > 0 ? 0xffd25a : NEGATIVE }),
        ),
      );
    }
  }

  /** turn the bivector piece in its own plane */
  tick(dt: number) {
    if (this.spinner) this.spinner.rotateZ(this.spinRate * dt);
  }

  dispose() {
    this.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        (x as THREE.SpriteMaterial).map?.dispose();
        x.dispose();
      });
    });
  }
}

/** a ring of three arrowheads running counter-clockwise in the xy plane */
function orientationRing(r: number, colour: number) {
  const g = new THREE.Group();
  const curve = new THREE.EllipseCurve(0, 0, r, r, 0.2, Math.PI * 2 - 0.2, false, 0);
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, 0.002))),
      new THREE.LineBasicMaterial({ color: colour }),
    ),
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.6;
    const head = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.4, 8), new THREE.MeshBasicMaterial({ color: colour }));
    head.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.002);
    head.rotation.z = a; // cone points along +y; at angle a the counter-clockwise tangent is a + 90°
    g.add(head);
  }
  return g;
}
