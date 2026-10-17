// Splitter: sits on a component's casing and does the property access its JSX does, sending each
// value it reads (`todo.title`, `todo.done`, …) down its own duct.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useActivity } from './activity';
import { useClip } from './clip';
import { SPLITTER, type Vec3 } from './layout';

export function Splitter({ pos, pulseKey }: { pos: Vec3; pulseKey?: string }) {
  const clip = useClip();
  const activity = useActivity();
  const comb = useRef<THREE.Group>(null);
  const edge = useRef<THREE.Color>(new THREE.Color('#b18cff'));
  const mat = useRef<THREE.LineBasicMaterial>(null);
  useFrame((_, dt) => {
    const live = pulseKey ? activity?.latest(pulseKey) : undefined;
    const k = live === undefined || !activity ? 0 : Math.max(0, 1 - (activity.now() - live) / 0.6);
    if (comb.current) comb.current.rotation.y += dt * (activity ? activity.rate() : 1) * (0.6 + 6 * k);
    mat.current?.color.copy(edge.current).multiplyScalar(1.4 + 2.5 * k);
  });
  const s = SPLITTER;
  return (
    <group position={pos}>
      <mesh position={[0, s * 0.4, 0]}>
        <boxGeometry args={[s, s * 0.8, s]} />
        <meshStandardMaterial color="#0a0614" metalness={0.5} roughness={0.4} transparent opacity={0.85} clippingPlanes={clip} />
        <Edges>
          <lineBasicMaterial ref={mat} color={edge.current} toneMapped={false} clippingPlanes={clip} />
        </Edges>
      </mesh>
      <group ref={comb} position={[0, s * 0.4, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 3, 0]}>
            <boxGeometry args={[s * 0.75, s * 0.06, s * 0.08]} />
            <meshBasicMaterial color={new THREE.Color('#b18cff').multiplyScalar(1.6)} toneMapped={false} clippingPlanes={clip} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
