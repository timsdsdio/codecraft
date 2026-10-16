// Logic Casing: the component's code (everything above the JSX) as a sealed green glass box in a
// brass frame. Props come in through the bottom; outputs leave through the top. A cog inside turns
// whenever the component renders.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FACTORY } from '../palette';
import { Label } from '../Label';
import { Cog } from './Cog';
import { useClip } from './clip';
import { useMetal } from './look';
import type { Vec3 } from './layout';

export function Casing({
  pos,
  size,
  name,
  renderEvery,
  renderOffset = 0,
  label = true,
  dim = false,
}: {
  /** centre of the base */
  pos: Vec3;
  size: Vec3;
  name: string;
  /** demo: render every N seconds (cog spins up, glass flashes) */
  renderEvery?: number;
  /** demo: delay before the first render, in seconds */
  renderOffset?: number;
  label?: boolean;
  dim?: boolean;
}) {
  const clip = useClip();
  const metal = useMetal('frame');
  const frame = { ...metal, emissiveIntensity: metal.emissiveIntensity * (dim ? 0.25 : 1) };
  const flange = useMetal('accent');
  const [w, h, d] = size;
  const t = 0.035; // frame bar thickness
  const bars = useMemo(() => {
    const out: { p: Vec3; s: Vec3 }[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ p: [(sx * (w - t)) / 2, h / 2, (sz * (d - t)) / 2], s: [t, h, t] });
    for (const y of [t / 2, h - t / 2]) {
      for (const sz of [-1, 1]) out.push({ p: [0, y, (sz * (d - t)) / 2], s: [w, t, t] });
      for (const sx of [-1, 1]) out.push({ p: [(sx * (w - t)) / 2, y, 0], s: [t, t, d] });
    }
    return out;
  }, [w, h, d]);

  const glass = useRef<THREE.MeshStandardMaterial>(null);
  const cog = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const last = useRef(-Infinity);
  useFrame(({ clock }, dt) => {
    const now = clock.elapsedTime - renderOffset;
    if (renderEvery && now > 0 && now - last.current > renderEvery) last.current = now;
    const k = Math.max(0, 1 - (now - last.current) / 0.9); // 1 right after a render, fading out
    spin.current += dt * (0.25 + 7 * k);
    if (cog.current) cog.current.rotation.z = spin.current;
    if (glass.current) glass.current.emissiveIntensity = (dim ? 0.04 : 0.1) + 0.55 * k;
  });

  const cogR = Math.min(w, h) * 0.4;
  return (
    <group position={pos}>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial {...frame} clippingPlanes={clip} />
        </mesh>
      ))}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w - t, h - t, d - t]} />
        <meshStandardMaterial
          ref={glass}
          color="#031a0e"
          emissive={FACTORY.casing}
          emissiveIntensity={0.1}
          transparent
          opacity={0.5}
          metalness={0.2}
          roughness={0.15}
          depthWrite={false}
          clippingPlanes={clip}
        />
      </mesh>
      <group ref={cog} position={[0, h / 2, 0]}>
        <Cog radius={cogR} thickness={Math.min(0.08, d * 0.3)} glow={0.25} />
      </group>
      {/* input flange underneath, output flange on top */}
      {[0.012, h - 0.012].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 12]} />
          <meshStandardMaterial {...flange} clippingPlanes={clip} />
        </mesh>
      ))}
      {label && (
        <Label position={[0, h + 0.2, 0]} height={0.15} text={name} font="JetBrains Mono" weight={700} color="#7dffbe" intensity={1.3} backing renderOrder={20} />
      )}
    </group>
  );
}
