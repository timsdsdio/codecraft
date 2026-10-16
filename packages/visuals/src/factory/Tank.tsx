// State Tank: one useState hook. Glass cylinder in brass bands; the fluid's colour is the value's
// kind, its level eases toward `fill`, and the current value reads out above it.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { KIND_COLOR } from '../palette';
import { Label } from '../Label';
import { useClip } from './clip';
import { useActivity } from './activity';
import { useMetal } from './look';
import type { ValueInfo, Vec3 } from './layout';

export function Tank({
  pos,
  radius = 0.13,
  height = 0.46,
  info,
  fill = 0.7,
  label = true,
  pulseKey,
}: {
  pos: Vec3;
  radius?: number;
  height?: number;
  info: ValueInfo;
  fill?: number;
  label?: boolean;
  /** live: slosh when the Activity store pulses this key */
  pulseKey?: string;
}) {
  const clip = useClip();
  const inspect = { label: `${info.name} (state)`, kind: info.kind, value: info.value ?? info.preview };
  const activity = useActivity();
  const fluidMat = useRef<THREE.MeshBasicMaterial>(null);
  const metal = useMetal('frame', KIND_COLOR[info.kind]);
  const color = useMemo(() => new THREE.Color(KIND_COLOR[info.kind]), [info.kind]);
  const fluid = useRef<THREE.Mesh>(null);
  const level = useRef(fill);
  useFrame((_, dt) => {
    level.current += (fill - level.current) * Math.min(1, dt * 3);
    const live = pulseKey ? activity?.latest(pulseKey) : undefined;
    const k = live === undefined ? 0 : Math.max(0, 1 - (activity!.now() - live) / 0.8);
    fluidMat.current?.color.copy(color).multiplyScalar(1.6 + 2.5 * k);
    const m = fluid.current;
    if (m) {
      const fh = Math.max(0.02, (height - 0.08) * level.current);
      m.scale.y = fh;
      m.position.y = 0.04 + fh / 2;
    }
  });
  return (
    <group position={pos}>
      <mesh position={[0, height / 2, 0]} userData={{ inspect }}>
        <cylinderGeometry args={[radius, radius, height, 20, 1, true]} />
        <meshStandardMaterial color="#5fb8d8" transparent opacity={0.14} metalness={0.3} roughness={0.05} depthWrite={false} side={THREE.DoubleSide} clippingPlanes={clip} />
      </mesh>
      <mesh ref={fluid}>
        <cylinderGeometry args={[radius * 0.86, radius * 0.86, 1, 18]} />
        <meshBasicMaterial ref={fluidMat} color={color.clone().multiplyScalar(1.6)} toneMapped={false} clippingPlanes={clip} />
      </mesh>
      {/* frame posts, so the glass reads as a vessel */}
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        return (
          <mesh key={`post${i}`} position={[Math.cos(a) * (radius + 0.012), height / 2, Math.sin(a) * (radius + 0.012)]}>
            <boxGeometry args={[0.022, height, 0.022]} />
            <meshStandardMaterial {...metal} clippingPlanes={clip} />
          </mesh>
        );
      })}
      {[0.02, height / 2, height - 0.02].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[radius + 0.015, radius + 0.015, 0.035, 20]} />
          <meshStandardMaterial {...metal} clippingPlanes={clip} />
        </mesh>
      ))}
      {label && (
        <Label
          position={[0, height + 0.17, 0]}
          height={0.13}
          text={info.name}
          sub={info.preview}
          font="JetBrains Mono"
          weight={700}
          color={KIND_COLOR[info.kind]}
          intensity={1.3}
          backing
          renderOrder={21}
        />
      )}
    </group>
  );
}
