// The player, for scale: a blocky figure exactly 1 unit (100 CSS px) tall.
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { Vec3 } from './layout';

const PARTS: { p: Vec3; s: Vec3 }[] = [
  { p: [-0.06, 0.2, 0], s: [0.1, 0.4, 0.12] }, // legs
  { p: [0.06, 0.2, 0], s: [0.1, 0.4, 0.12] },
  { p: [0, 0.57, 0], s: [0.24, 0.34, 0.14] }, // torso
  { p: [-0.165, 0.56, 0], s: [0.08, 0.34, 0.1] }, // arms
  { p: [0.165, 0.56, 0], s: [0.08, 0.34, 0.1] },
  { p: [0, 0.865, 0], s: [0.24, 0.25, 0.24] }, // head
];

export function Avatar({ pos, yaw = 0, crouch = false }: { pos: Vec3; yaw?: number; crouch?: boolean }) {
  const edge = useMemo(() => new THREE.Color('#00fff0').multiplyScalar(2.2), []);
  return (
    <group position={pos} rotation={[0, yaw, 0]} scale={[1, crouch ? 0.75 : 1, 1]}>
      {PARTS.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#0a1420" metalness={0.4} roughness={0.5} />
          <Edges color={edge} toneMapped={false} />
        </mesh>
      ))}
      {/* visor */}
      <mesh position={[0, 0.88, 0.122]}>
        <planeGeometry args={[0.18, 0.05]} />
        <meshBasicMaterial color={edge} toneMapped={false} />
      </mesh>
    </group>
  );
}
