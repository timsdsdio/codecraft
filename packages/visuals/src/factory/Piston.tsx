// Telescoping Piston: what `items.map(...)` becomes. One head per item, strung along a rod that
// leaves the casing; each head has an outlet on its side that feeds that item. Heads glide to their
// targets, and a new item's head slides out of the one before it.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FACTORY } from '../palette';
import { useClip } from './clip';
import type { Vec3 } from './layout';

const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2); // axis along z
const MAX = 64;

export function Piston({ base, heads }: { base: Vec3; heads: { key: string; pos: Vec3 }[] }) {
  const clip = useClip();
  const current = useRef(new Map<string, number>());
  const headRefs = useRef<(THREE.Group | null)[]>([]);
  const rodRefs = useRef<(THREE.Mesh | null)[]>([]);
  const rodR = (i: number) => Math.max(0.025, 0.06 - i * 0.004);
  const brass = useMemo(() => ({ color: FACTORY.brass, metalness: 0.85, roughness: 0.35 }), []);

  useFrame((_, dt) => {
    const cur = current.current;
    let prev = base[2];
    for (const k of [...cur.keys()]) if (!heads.some((h) => h.key === k)) cur.delete(k);
    heads.forEach((h, i) => {
      if (i >= MAX) return;
      let z = cur.get(h.key);
      if (z === undefined) z = prev; // new heads emerge from the one before
      z += (h.pos[2] - z) * Math.min(1, dt * 5);
      cur.set(h.key, z);
      const g = headRefs.current[i];
      if (g) g.position.z = z;
      const rod = rodRefs.current[i];
      if (rod) {
        const len = Math.max(0.001, Math.abs(z - prev));
        rod.position.z = (z + prev) / 2;
        rod.scale.set(rodR(i), rodR(i), len);
      }
      prev = z;
    });
  });

  const [bx, by, bz] = base;
  return (
    <group>
      {/* the sleeve the rod slides through */}
      <mesh geometry={rodGeo} position={[bx, by, bz]} scale={[0.1, 0.1, 0.22]}>
        <meshStandardMaterial color={FACTORY.andesite} metalness={0.6} roughness={0.5} clippingPlanes={clip} />
      </mesh>
      {heads.slice(0, MAX).map((h, i) => (
        <group key={h.key}>
          <mesh ref={(m) => void (rodRefs.current[i] = m)} geometry={rodGeo} position={[bx, by, bz]} scale={[rodR(i), rodR(i), 0.001]}>
            <meshStandardMaterial color={i % 2 ? '#8a9096' : '#a9b0b6'} metalness={0.9} roughness={0.25} clippingPlanes={clip} />
          </mesh>
          <group ref={(g) => void (headRefs.current[i] = g)} position={[bx, by, bz]}>
            <mesh>
              <boxGeometry args={[0.2, 0.2, 0.16]} />
              <meshStandardMaterial {...brass} clippingPlanes={clip} />
            </mesh>
            <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.045, 0.045, 0.06, 10]} />
              <meshStandardMaterial color={FACTORY.copper} metalness={0.8} roughness={0.3} clippingPlanes={clip} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
