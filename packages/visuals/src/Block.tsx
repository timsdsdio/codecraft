// A block: dark glass cube with neon edges tinted by zone, a slowly turning wireframe core,
// sockets on its faces and a billboard name label.
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { CUBE, CUBE_Y, socketLocal, type BlockSpec } from './layout';
import { ZONE_TINT } from './palette';
import { Socket, type SocketState } from './Socket';
import { Label } from './Label';
import { Beacon } from './Beacon';

const boxGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
const innerGeo = new THREE.BoxGeometry(CUBE * 0.62, CUBE * 0.62, CUBE * 0.62);
const ringGeo = new THREE.RingGeometry(CUBE * 0.78, CUBE * 0.86, 4, 1);

export interface BlockProps {
  spec: BlockSpec;
  /** floor position [x, z] */
  at?: [number, number];
  /** part of a running composition (bright) vs idle (dim) */
  active?: boolean;
  selected?: boolean;
  /** show the title label above the block */
  title?: boolean;
  /** show each port's name next to its socket */
  portLabels?: boolean;
  /** port names that have a cable plugged in */
  connected?: readonly string[];
  /** per-port state overrides (highlight / missing / dim) */
  portState?: Readonly<Record<string, SocketState>>;
}

export const Block = memo(function Block({
  spec,
  at = [0, 0],
  active = true,
  selected = false,
  title = true,
  portLabels = false,
  connected = [],
  portState = {},
}: BlockProps) {
  const tint = ZONE_TINT[spec.zone];
  const missing = Object.values(portState).includes('missing');
  const level = active ? 2.6 : 0.7;
  const edgeColor = useMemo(() => new THREE.Color(tint).multiplyScalar(selected ? level * 1.7 : level), [tint, level, selected]);
  const coreColor = useMemo(() => new THREE.Color(tint).multiplyScalar(active ? 0.9 : 0.18), [tint, active]);
  const ringColor = useMemo(() => new THREE.Color(tint).multiplyScalar(3), [tint]);
  const phase = useMemo(() => (spec.id.length * 1.37) % 6.28, [spec.id]);

  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * (active ? 0.6 : 0.15) + phase;
      core.current.rotation.x = t * (active ? 0.35 : 0.08);
    }
    if (ring.current) ring.current.rotation.z = t * 0.5;
  });

  const sockets = useMemo(
    () => spec.ports.flatMap((p) => {
      const pl = socketLocal(spec, p.name);
      return pl ? [{ p, pl }] : [];
    }),
    [spec],
  );

  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh geometry={boxGeo} position={[0, CUBE_Y, 0]}>
        <meshStandardMaterial
          color="#060b14"
          emissive={tint}
          emissiveIntensity={active ? 0.06 : 0.015}
          metalness={0.6}
          roughness={0.25}
          transparent
          opacity={0.86}
        />
        <Edges lineWidth={selected ? 2.6 : 1.6} color={edgeColor} toneMapped={false} />
      </mesh>
      <mesh ref={core} geometry={innerGeo} position={[0, CUBE_Y, 0]}>
        <meshBasicMaterial color={coreColor} wireframe toneMapped={false} transparent opacity={0.5} />
      </mesh>
      {sockets.map(({ p, pl }) => (
        <Socket
          key={p.name}
          placement={pl}
          iface={p.iface}
          state={portState[p.name] ?? (active ? 'active' : 'idle')}
          connected={connected.includes(p.name)}
          label={portLabels ? p.name : undefined}
        />
      ))}
      {title && (
        <Label
          position={[0, CUBE_Y + CUBE / 2 + 0.55, 0]}
          height={0.42}
          text={spec.title.toUpperCase()}
          sub={spec.id}
          color={tint}
          intensity={active ? 1.5 : 0.75}
          backing
        />
      )}
      {missing && <Beacon y={CUBE_Y + CUBE / 2 + 0.05} />}
      {selected && (
        <mesh ref={ring} geometry={ringGeo} rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.02, 0]}>
          <meshBasicMaterial color={ringColor} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
});
