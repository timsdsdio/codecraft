// A factory floor: steel grating you can see down through, with brass edge rails and a level plate.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Label } from '../Label';
import { SLAB } from './layout';
import { useLook, useMetal } from './look';

function gratingTexture(bar: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bar;
  g.fillRect(0, 0, 64, 64);
  g.clearRect(6, 6, 52, 52);
  g.fillStyle = bar;
  g.fillRect(30, 6, 4, 52);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Floor({ size, y, level, label = true }: { size: [number, number]; y: number; level: number; label?: boolean }) {
  const [w, d] = size;
  const tron = useLook() === 'tron';
  const rail = useMetal('rail', '#00b8c0');
  const tex = useMemo(() => gratingTexture(tron ? '#0d4a52' : '#2a333d'), [tron]);
  useEffect(() => {
    tex.repeat.set(w / 0.25, d / 0.25);
  }, [tex, w, d]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SLAB, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex} alphaTest={0.5} metalness={0.7} roughness={0.5} side={THREE.DoubleSide} emissive={tron ? '#00b8c0' : '#000000'} emissiveMap={tron ? tex : null} emissiveIntensity={tron ? 0.22 : 0} />
      </mesh>
      {/* under-plate glow so lower floors read through the grating */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SLAB * 0.4, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#04121a" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {[
        { p: [0, SLAB / 2, -d / 2] as const, s: [w + 0.06, SLAB, 0.06] as const },
        { p: [0, SLAB / 2, d / 2] as const, s: [w + 0.06, SLAB, 0.06] as const },
        { p: [-w / 2, SLAB / 2, 0] as const, s: [0.06, SLAB, d] as const },
        { p: [w / 2, SLAB / 2, 0] as const, s: [0.06, SLAB, d] as const },
      ].map((r, i) => (
        <mesh key={i} position={[...r.p]}>
          <boxGeometry args={[...r.s]} />
          <meshStandardMaterial {...rail} />
        </mesh>
      ))}
      {label && <Label position={[-w / 2 - 0.45, 0.25, d / 2]} height={0.2} text={`FLOOR ${level}`} color={tron ? '#00fff0' : '#c8963e'} intensity={1.2} backing />}
    </group>
  );
}
