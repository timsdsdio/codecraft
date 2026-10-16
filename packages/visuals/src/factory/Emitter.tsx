// Emitter: hangs under one element on the screen and paints it from the values its duct delivers.
// A handler emitter (red) is where that element's event handler lives; calls zap out of it.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useActivity, type Cargo } from './activity';
import { useClip } from './clip';
import { EMITTER, type Vec3 } from './layout';

export function Emitter({ pos, kind, pulseKey, inspect }: { pos: Vec3; kind: 'value' | 'handler'; pulseKey?: string; inspect?: Cargo }) {
  const clip = useClip();
  const activity = useActivity();
  const tint = kind === 'handler' ? '#ff2050' : '#d8f6ff';
  const base = useMemo(() => new THREE.Color(tint), [tint]);
  const lens = useRef<THREE.MeshBasicMaterial>(null);
  const userData = useMemo(() => ({ inspect }), [inspect]);
  useFrame(() => {
    const live = pulseKey ? activity?.latest(pulseKey) : undefined;
    const k = live === undefined || !activity ? 0 : Math.max(0, 1 - (activity.now() - live) / 0.6);
    lens.current?.color.copy(base).multiplyScalar(1.2 + 3 * k);
  });
  return (
    <group position={pos}>
      <mesh userData={userData}>
        <boxGeometry args={[EMITTER.w, EMITTER.h, EMITTER.w]} />
        <meshStandardMaterial color="#05080f" metalness={0.6} roughness={0.35} clippingPlanes={clip} />
        <Edges color={base.clone().multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      <mesh position={[0, EMITTER.h / 2 + 0.012, 0]}>
        <cylinderGeometry args={[EMITTER.w * 0.3, EMITTER.w * 0.36, 0.024, 12]} />
        <meshBasicMaterial ref={lens} color={base} toneMapped={false} clippingPlanes={clip} />
      </mesh>
    </group>
  );
}
