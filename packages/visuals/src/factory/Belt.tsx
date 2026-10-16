// Conveyor Belt: the floor of a scroll area. Its surface moves with the scroll offset; everything
// above it in the tree rides along.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Box } from './layout';
import { useMetal } from './look';

const TILE = 0.12;

function treadTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1f23';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#34393f';
  g.fillRect(0, 4, 32, 10);
  g.fillStyle = '#4a3a1a';
  g.fillRect(0, 13, 32, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Belt({ box, y, offset = 0, drift = 0 }: { box: Box; y: number; offset?: number; drift?: number }) {
  const w = box.x1 - box.x0;
  const len = box.z1 - box.z0;
  const rail = useMetal('rail', '#00b8c0');
  const roller = useMetal('frame', '#00fff0');
  const tex = useMemo(treadTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useEffect(() => {
    tex.repeat.set(1, len / TILE);
  }, [tex, len]);
  const shown = useRef(offset);
  const rollers = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const target = offset + drift * clock.elapsedTime;
    shown.current += (target - shown.current) * Math.min(1, dt * 8);
    tex.offset.y = -shown.current / TILE;
    if (rollers.current) rollers.current.children.forEach((r) => (r.rotation.x = -shown.current / 0.06));
  });
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  return (
    <group>
      <mesh position={[cx, y + 0.03, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, len]} />
        <meshStandardMaterial map={tex} metalness={0.2} roughness={0.8} />
      </mesh>
      {/* side rails */}
      {[box.x0, box.x1].map((x) => (
        <mesh key={x} position={[x, y + 0.04, cz]}>
          <boxGeometry args={[0.03, 0.06, len]} />
          <meshStandardMaterial {...rail} />
        </mesh>
      ))}
      <group ref={rollers}>
        {[box.z0, box.z1].map((z) => (
          <mesh key={z} position={[cx, y + 0.03, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, w + 0.06, 12]} />
            <meshStandardMaterial {...roller} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
