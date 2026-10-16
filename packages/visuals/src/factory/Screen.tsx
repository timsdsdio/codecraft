// The screen: the running app, lying face up as the roof of the factory. In the game this is the
// real DOM (a CSS3D iframe); in diagrams it's a canvas drawing of the app.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SLAB, PX } from './layout';

export function Screen({
  size,
  y,
  draw,
  opacity = 1,
}: {
  /** world [w, d] */
  size: [number, number];
  y: number;
  /** paints the app into a canvas of viewport size × 2 (ctx is pre-scaled to CSS px) */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  opacity?: number;
}) {
  const [w, d] = size;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    const pw = Math.round(w * PX);
    const ph = Math.round(d * PX);
    c.width = pw * 2;
    c.height = ph * 2;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    draw(g, pw, ph);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, d, draw]);
  useEffect(() => () => tex.dispose(), [tex]);
  const ghost = opacity < 1;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SLAB + 0.001, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial map={tex} transparent={ghost} opacity={opacity} depthWrite={!ghost} />
      </mesh>
      <mesh position={[0, SLAB / 2, 0]}>
        <boxGeometry args={[w + 0.08, SLAB, d + 0.08]} />
        <meshStandardMaterial color="#0a0f16" metalness={0.6} roughness={0.4} transparent={ghost} opacity={ghost ? opacity * 0.6 : 1} depthWrite={!ghost} />
      </mesh>
    </group>
  );
}
