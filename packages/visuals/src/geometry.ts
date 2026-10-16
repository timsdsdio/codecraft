// Socket shape outlines, cached socket geometry, and cable curves (ported from the prototype).
import * as THREE from 'three';
import type { SocketShape } from './palette';
import { shapePoints } from './shapes';

/** Counter-clockwise outline of a unit-ish shape. */
export function shapeOutline(shape: SocketShape): THREE.Vector2[] {
  return shapePoints(shape).map(([x, y]) => new THREE.Vector2(x, y));
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Extruded along +Z from 0 → 1. male = solid shape; female = ring (outline×1.45 with shape hole). */
export function socketGeometry(shape: SocketShape, female: boolean): THREE.BufferGeometry {
  const key = `${shape}|${female ? 'f' : 'm'}`;
  let g = geoCache.get(key);
  if (g) return g;
  const inner = shapeOutline(shape);
  let s: THREE.Shape;
  if (female) {
    s = new THREE.Shape(inner.map((p) => p.clone().multiplyScalar(1.45)));
    s.holes.push(new THREE.Path(inner.map((p) => p.clone()).reverse()));
  } else {
    s = new THREE.Shape(inner);
  }
  g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  geoCache.set(key, g);
  return g;
}

/** Flat filled shape (cavity backing of a female socket). */
export function socketFillGeometry(shape: SocketShape): THREE.BufferGeometry {
  const key = `${shape}|fill`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.ShapeGeometry(new THREE.Shape(shapeOutline(shape)));
    geoCache.set(key, g);
  }
  return g;
}

/** Cable path: leaves each socket along its normal, arcs gently upward between. */
export function cableCurve(
  a: THREE.Vector3,
  na: THREE.Vector3,
  b: THREE.Vector3,
  nb: THREE.Vector3,
  out?: THREE.CatmullRomCurve3,
): THREE.CatmullRomCurve3 {
  const c = out ?? new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(() => new THREE.Vector3()), false, 'centripetal', 0.5);
  const [a0, a1, mid, b1, b0] = c.points;
  const dist = a.distanceTo(b);
  const lead = Math.min(1.1, 0.35 + dist * 0.12);
  a1.copy(a).addScaledVector(na, lead);
  b1.copy(b).addScaledVector(nb, lead);
  mid.copy(a1).add(b1).multiplyScalar(0.5);
  mid.y += 0.25 + dist * 0.07;
  a0.copy(a).addScaledVector(na, 0.02);
  b0.copy(b).addScaledVector(nb, 0.02);
  return c;
}
