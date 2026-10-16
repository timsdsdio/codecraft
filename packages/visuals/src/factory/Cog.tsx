// A Create-style cogwheel: brass rim with square teeth around a darker hub.
import { useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { FACTORY } from '../palette';
import { useClip } from './clip';

const cache = new Map<number, THREE.ExtrudeGeometry>();

/** Unit cog (outer radius 1, thickness 1) lying in the XY plane, extruded along +Z. */
export function cogGeometry(teeth = 8): THREE.ExtrudeGeometry {
  let g = cache.get(teeth);
  if (g) return g;
  const s = new THREE.Shape();
  const rOut = 1;
  const rIn = 0.78;
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % 4 === 1 || i % 4 === 2 ? rOut : rIn;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.22, 0, Math.PI * 2, true);
  s.holes.push(hole);
  g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -0.5);
  cache.set(teeth, g);
  return g;
}

export function Cog({ radius = 0.2, thickness = 0.06, teeth = 8, glow = 0, ...rest }: { radius?: number; thickness?: number; teeth?: number; glow?: number } & ThreeElements['mesh']) {
  const clip = useClip();
  const emissive = useMemo(() => new THREE.Color(FACTORY.brass), []);
  return (
    <mesh geometry={cogGeometry(teeth)} scale={[radius, radius, thickness]} {...rest}>
      <meshStandardMaterial color={FACTORY.brass} metalness={0.85} roughness={0.35} emissive={emissive} emissiveIntensity={0.08 + glow} clippingPlanes={clip} />
    </mesh>
  );
}
