// Display Link: a beam from a casing's top up to the patch of screen the component paints, with
// that patch outlined on the screen's underside. It flares whenever the component renders.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FACTORY } from '../palette';
import { useActivity } from './activity';
import { seeThrough, type Box, type Vec3 } from './layout';

export function DisplayLink({
  from,
  rect,
  screenY,
  renderEvery,
  renderOffset = 0,
  pulseKey,
}: {
  from: Vec3;
  rect: Box;
  screenY: number;
  renderEvery?: number;
  renderOffset?: number;
  pulseKey?: string;
}) {
  const activity = useActivity();
  const top = screenY - 0.004;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const h = Math.max(0.01, top - from[1]);
  const base = useMemo(() => new THREE.Color(FACTORY.link), []);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const edge = useRef<THREE.MeshBasicMaterial>(null);
  const last = useRef(-Infinity);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - renderOffset;
    if (renderEvery && t > 0 && t - last.current > renderEvery) last.current = t;
    const live = pulseKey ? activity?.latest(pulseKey) : undefined;
    const kLive = live === undefined ? 0 : Math.max(0, 1 - (activity!.now() - live) / 0.7);
    const k = Math.max(kLive, 1 - (t - last.current) / 0.7, 0);
    beam.current?.color.copy(base).multiplyScalar(0.25 + 2.2 * k);
    edge.current?.color.copy(base).multiplyScalar(0.5 + 2.5 * k);
  });
  const t = 0.012;
  const ew = rect.x1 - rect.x0;
  const ed = rect.z1 - rect.z0;
  return (
    <group>
      <mesh position={[from[0], from[1] + h / 2, from[2]]} raycast={seeThrough}>
        <cylinderGeometry args={[0.012, 0.012, h, 6]} />
        <meshBasicMaterial ref={beam} color={base} toneMapped={false} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group position={[cx, top, cz]}>
        {[
          [0, -ed / 2, ew, t],
          [0, ed / 2, ew, t],
          [-ew / 2, 0, t, ed],
          [ew / 2, 0, t, ed],
        ].map(([x, z, sx, sz], i) => (
          <mesh key={i} position={[x, 0, z]} raycast={seeThrough}>
            <boxGeometry args={[sx, 0.006, sz]} />
            <meshBasicMaterial ref={i === 0 ? edge : undefined} color={base} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
