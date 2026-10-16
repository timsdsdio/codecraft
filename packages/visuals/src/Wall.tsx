// The network wall: a glowing translucent barrier at z = 0 with a portal that a link block fills.
// Only a link block can carry a cable through it.
import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { CUBE } from './layout';

export function Wall({ width = 10, height = 3.2, portal = CUBE + 0.3, z = 0 }: { width?: number; height?: number; portal?: number; z?: number }) {
  const edge = useMemo(() => new THREE.Color('#ff00e5').multiplyScalar(2.2), []);
  const side = (width - portal) / 2;
  const lintel = height - (portal + 0.1);
  const panels: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [-(portal + side) / 2, height / 2, z], size: [side, height, 0.12] },
    { pos: [(portal + side) / 2, height / 2, z], size: [side, height, 0.12] },
    { pos: [0, portal + 0.1 + lintel / 2, z], size: [portal, lintel, 0.12] },
  ];
  return (
    <group>
      {panels.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#12051a" emissive="#ff00e5" emissiveIntensity={0.08} transparent opacity={0.42} depthWrite={false} />
          <Edges color={edge} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
