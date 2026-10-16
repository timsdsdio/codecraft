// The monitor fixture: its back carries the ui.Root input socket; its screen faces +Z and shows the
// running app (cyan) or diagnostics (red). In the wiki the screen is a texture, not live DOM.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { FlatLabel } from './Label';
import { Socket, type SocketState } from './Socket';
import type { SocketPlacement, Vec3 } from './layout';

export const MONITOR = { width: 7.2, height: 4.6, elevation: 0.6, depth: 0.34 };
export const MONITOR_CY = MONITOR.elevation + MONITOR.height / 2;
const SCREEN_W = MONITOR.width - 0.4;
const SCREEN_H = (SCREEN_W * 460) / 720;
const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(MONITOR.width, MONITOR.height, MONITOR.depth));

const ROOT_PLACEMENT: SocketPlacement = {
  pos: [0, MONITOR_CY, -MONITOR.depth / 2],
  normal: [0, 0, -1],
  euler: [0, Math.PI, 0],
  face: 'back',
  female: true,
  radius: 0.3,
};

/** World-space anchor of the monitor's root socket for a monitor standing at [x, z]. */
export function monitorRootAt(at: [number, number]): { pos: Vec3; normal: Vec3 } {
  const p = ROOT_PLACEMENT.pos;
  return { pos: [at[0] + p[0], p[1], at[1] + p[2]], normal: ROOT_PLACEMENT.normal };
}

export function Monitor({
  at = [0, 0],
  ok = true,
  rootIface = 'ui.Root@1',
  rootState,
  connected = false,
  screenTitle,
  screenSub,
}: {
  at?: [number, number];
  ok?: boolean;
  rootIface?: string;
  rootState?: SocketState;
  connected?: boolean;
  screenTitle?: string;
  screenSub?: string;
}) {
  const tint = ok ? '#00e5ff' : '#ff2050';
  const glowBase = useMemo(() => new THREE.Color(tint), [tint]);
  const frameColor = useMemo(() => new THREE.Color(tint).multiplyScalar(2.4), [tint]);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.color.copy(glowBase).multiplyScalar((ok ? 1.6 : 1.1) + 0.25 * Math.sin(clock.elapsedTime * (ok ? 1.3 : 4)));
  });
  const z = MONITOR.depth / 2;
  return (
    <group position={[at[0], 0, at[1]]}>
      <RoundedBox args={[MONITOR.width, MONITOR.height, MONITOR.depth]} radius={0.08} smoothness={3} position={[0, MONITOR_CY, 0]}>
        <meshStandardMaterial color="#05080f" metalness={0.7} roughness={0.3} />
      </RoundedBox>
      <lineSegments geometry={frameGeo} position={[0, MONITOR_CY, 0]}>
        <lineBasicMaterial color={frameColor} toneMapped={false} />
      </lineSegments>
      {/* stand */}
      <mesh position={[0, MONITOR.elevation / 2, -0.15]}>
        <boxGeometry args={[0.5, MONITOR.elevation + 0.1, 0.18]} />
        <meshStandardMaterial color="#070b14" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.03, -0.15]}>
        <boxGeometry args={[2.6, 0.06, 1.1]} />
        <meshStandardMaterial color="#070b14" metalness={0.8} roughness={0.3} emissive={tint} emissiveIntensity={0.05} />
      </mesh>
      {/* back panel: label + root socket */}
      <group position={[0, MONITOR_CY, -z - 0.01]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0, -0.002]}>
          <planeGeometry args={[3.2, 2.6]} />
          <meshBasicMaterial color="#03060c" />
        </mesh>
        <FlatLabel text="SPA / REACT" sub={rootIface} position={[0, 1.15, 0.01]} height={0.62} color={tint} intensity={1.7} px={72} />
      </group>
      <Socket placement={ROOT_PLACEMENT} iface={rootIface} state={rootState ?? (ok ? 'active' : 'missing')} connected={connected} />
      {/* screen */}
      <mesh position={[0, MONITOR_CY, z + 0.004]}>
        <planeGeometry args={[SCREEN_W + 0.12, SCREEN_H + 0.12]} />
        <meshBasicMaterial ref={glow} color={tint} toneMapped={false} />
      </mesh>
      <mesh position={[0, MONITOR_CY, z + 0.006]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial color="#02050a" />
      </mesh>
      <FlatLabel
        text={screenTitle ?? (ok ? 'LIVE APP' : 'MISSING')}
        sub={screenSub ?? (ok ? 'composition ok' : `root ← ${rootIface}`)}
        position={[0, MONITOR_CY, z + 0.01]}
        height={0.9}
        color={ok ? '#00fff0' : '#ff2050'}
        intensity={1.4}
        px={72}
      />
    </group>
  );
}
