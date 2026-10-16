// A socket: male = protruding solid shape (outputs), female = recessed ring with the shape cut out (inputs).
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { visualFor, type SocketVisual } from './palette';
import { socketFillGeometry, socketGeometry } from './geometry';
import type { SocketPlacement } from './layout';
import { Label } from './Label';

/** idle → dim; active → part of a running composition; highlight → compatible target (pulses);
 *  missing → unplugged required input on the active chain (pulses red). */
export type SocketState = 'idle' | 'active' | 'highlight' | 'missing' | 'dim';

const DARK = new THREE.Color('#05070c');
const RED = new THREE.Color('#ff2050');

export const Socket = memo(function Socket({
  placement,
  iface,
  state = 'active',
  connected = false,
  label,
  visual,
}: {
  placement: SocketPlacement;
  iface: string;
  /** explicit shape/colour instead of the one hashed from `iface` */
  visual?: SocketVisual;
  state?: SocketState;
  connected?: boolean;
  /** port name shown next to the socket */
  label?: string;
}) {
  const vis = useMemo(() => visual ?? visualFor(iface), [iface, visual]);
  const base = useMemo(() => new THREE.Color(vis.color), [vis.color]);
  const level = state === 'highlight' ? 4 : state === 'dim' ? 0.18 : state === 'active' ? 2.2 : 0.8;
  const color = useMemo(() => base.clone().multiplyScalar(level), [base, level]);
  const fill = useMemo(
    () => (connected && state !== 'dim' ? base.clone().multiplyScalar(state === 'active' ? 0.9 : 0.35) : DARK),
    [base, connected, state],
  );
  const depth = placement.female ? 0.05 : 0.13;
  const n = placement.normal;
  const o = placement.female ? -0.012 : -0.005;
  const r = placement.radius;

  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || !mat.current) return;
    const t = clock.elapsedTime;
    if (state === 'highlight') {
      g.scale.setScalar(1 + 0.28 * (0.5 + 0.5 * Math.sin(t * 7)));
      mat.current.color.copy(base).multiplyScalar(level * (0.8 + 0.4 * Math.sin(t * 7)));
    } else if (state === 'missing') {
      const w = 0.5 + 0.5 * Math.sin(t * 5);
      g.scale.setScalar(1 + 0.2 * w);
      mat.current.color.copy(RED).multiplyScalar(1.5 + 3.5 * w);
    } else if (g.scale.x !== 1) {
      g.scale.setScalar(1);
      mat.current.color.copy(color);
    }
  });

  const labelPos: [number, number, number] = n[1] > 0.5 ? [0, 0.38, 0] : [n[0] * 0.3, 0.32, n[2] * 0.3];
  return (
    <group position={placement.pos} ref={group}>
      <group position={[n[0] * o, n[1] * o, n[2] * o]} rotation={placement.euler}>
        <mesh geometry={socketGeometry(vis.shape, placement.female)} scale={[r, r, depth]}>
          <meshBasicMaterial ref={mat} color={color} toneMapped={false} />
        </mesh>
        {placement.female && (
          <mesh geometry={socketFillGeometry(vis.shape)} position={[0, 0, 0.02]} scale={[r, r, 1]}>
            <meshBasicMaterial color={fill} toneMapped={false} />
          </mesh>
        )}
      </group>
      {label && (
        <Label position={labelPos} height={0.17} text={label} font="JetBrains Mono" weight={700} color={vis.color} intensity={1.5} backing renderOrder={30} />
      )}
    </group>
  );
});
