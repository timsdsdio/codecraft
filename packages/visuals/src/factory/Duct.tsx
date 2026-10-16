// Itemduct: a glass tube with frame rings, and discrete items travelling inside it, each one a
// value being passed (an object, a string, a function card…). Items carry their data in
// `userData.inspect`, so a raycast can show what's inside. Times come from the Activity clock.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { KIND_COLOR, type ValueKind } from '../palette';
import { DUCT_SPEED, useActivity, type Cargo, type Shipment } from './activity';
import { useClip } from './clip';
import { useMetal } from './look';
import { seeThrough, type Vec3 } from './layout';

const POOL = 10;
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const ringGeo = new THREE.TorusGeometry(1, 0.16, 6, 14);

export function Duct({
  points,
  kind,
  ductKey,
  radius = 0.045,
  sendEvery,
  sendOffset = 0,
  demoCargo,
}: {
  points: Vec3[];
  kind: ValueKind;
  /** the Activity shipments key for this duct */
  ductKey?: string;
  radius?: number;
  /** demo (no Activity): send an item every N seconds */
  sendEvery?: number;
  sendOffset?: number;
  demoCargo?: Cargo;
}) {
  const clip = useClip();
  const activity = useActivity();
  const frame = useMetal('rail', KIND_COLOR[kind]);
  const key = JSON.stringify(points);
  const geo = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const v = points.map((p) => new THREE.Vector3(...p));
    for (let i = 0; i < v.length - 1; i++) if (v[i].distanceToSquared(v[i + 1]) > 1e-8) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
    const len = path.getLength();
    const tube = new THREE.TubeGeometry(path, Math.max(8, Math.round(len * 20)), radius, 10, false);
    // frame rings every ~0.32 units, oriented along the path
    const rings: { pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];
    const n = Math.max(2, Math.floor(len / 0.32));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const pos = path.getPointAt(u);
      const tan = path.getTangentAt(u);
      rings.push({ pos, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan) });
    }
    return { path, len, tube, rings };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radius]);
  useEffect(() => () => geo.tube.dispose(), [geo]);

  const glass = useMemo(() => new THREE.Color(KIND_COLOR[kind]).multiplyScalar(0.25), [kind]);
  const items = useRef<(THREE.Mesh | null)[]>([]);
  const demo = useRef<number[]>([]);
  const lastDemo = useRef(-Infinity);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const travel = geo.len / DUCT_SPEED;
    let list: Shipment[];
    let now: number;
    if (activity && ductKey) {
      now = activity.now();
      list = activity.shipmentsIn(ductKey, travel);
    } else {
      now = clock.elapsedTime;
      if (sendEvery && now - sendOffset - lastDemo.current > sendEvery && now > sendOffset) {
        lastDemo.current = now - sendOffset;
        demo.current.push(now);
      }
      demo.current = demo.current.filter((t) => now - t < travel);
      list = demo.current.map((t) => ({ t, ...(demoCargo ?? { label: kind, kind }) }));
    }
    for (let i = 0; i < POOL; i++) {
      const m = items.current[i];
      if (!m) continue;
      const s = list[i];
      const p = s ? (now - s.t) / travel : -1;
      if (!s || p < 0 || p > 1) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      geo.path.getPointAt(Math.min(1, p), tmp);
      m.position.copy(tmp);
      const card = s.kind === 'function';
      const r = radius * 1.25;
      m.scale.set(card ? r * 1.7 : r, card ? r * 0.35 : r, card ? r * 1.2 : r);
      (m.material as THREE.MeshBasicMaterial).color.set(KIND_COLOR[s.kind]).multiplyScalar(1.8);
      m.userData.inspect = { label: s.label, kind: s.kind, value: s.value } satisfies Cargo;
    }
  });

  return (
    <group>
      <mesh geometry={geo.tube} raycast={seeThrough}>
        <meshStandardMaterial color={glass} emissive={glass} emissiveIntensity={0.6} transparent opacity={0.22} depthWrite={false} metalness={0.1} roughness={0.05} clippingPlanes={clip} />
      </mesh>
      {geo.rings.map((rg, i) => (
        <mesh key={i} geometry={ringGeo} position={rg.pos} quaternion={rg.quat} scale={radius * 1.08} raycast={seeThrough}>
          <meshStandardMaterial {...frame} clippingPlanes={clip} />
        </mesh>
      ))}
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(m) => void (items.current[i] = m)} geometry={boxGeo} visible={false}>
          <meshBasicMaterial toneMapped={false} clippingPlanes={clip} />
        </mesh>
      ))}
    </group>
  );
}
