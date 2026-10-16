// Calls, drawn as lasers: when a handler calls a function, a beam fires from the element's emitter
// straight to where the function was created (or the state tank it sets), and the arguments ride
// along it as an item you can inspect.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { KIND_COLOR } from '../palette';
import { ZAP_TIME, useActivity } from './activity';

const POOL = 6;
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2); // along z
const itemGeo = new THREE.IcosahedronGeometry(1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const up = new THREE.Vector3(0, 0, 1);

export function Zaps() {
  const activity = useActivity();
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const items = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const list = activity ? activity.liveZaps() : [];
    const now = activity?.now() ?? 0;
    for (let i = 0; i < POOL; i++) {
      const beam = beams.current[i];
      const item = items.current[i];
      if (!beam || !item) continue;
      const z = list[i];
      const p = z ? (now - z.t) / ZAP_TIME : -1;
      if (!z || p < 0 || p > 1.6) {
        beam.visible = item.visible = false;
        continue;
      }
      a.set(...z.from);
      b.set(...z.to);
      const len = a.distanceTo(b);
      beam.visible = true;
      beam.position.copy(a).lerp(b, 0.5);
      beam.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      const fade = p <= 1 ? 1 : 1 - (p - 1) / 0.6;
      beam.scale.set(0.012 + 0.02 * fade, 0.012 + 0.02 * fade, len);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      item.visible = p <= 1;
      item.position.copy(a).lerp(b, Math.min(1, p));
      item.scale.setScalar(0.05);
      (item.material as THREE.MeshBasicMaterial).color.set(KIND_COLOR[z.kind]).multiplyScalar(2.2);
      item.userData.inspect = { label: z.label, kind: z.kind, value: z.value };
    }
  });
  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i}>
          <mesh ref={(m) => void (beams.current[i] = m)} geometry={beamGeo} visible={false}>
            <meshBasicMaterial color={new THREE.Color('#ff2050').multiplyScalar(2.4)} toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={(m) => void (items.current[i] = m)} geometry={itemGeo} visible={false}>
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
