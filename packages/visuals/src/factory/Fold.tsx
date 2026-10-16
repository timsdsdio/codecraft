// Fold: the edge of a scroll area, a shimmering prism from the scroll owner's floor up to the
// screen. Whatever slides past it is folded away; only what's inside is drawn.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FACTORY } from '../palette';
import type { Box } from './layout';

const curtain = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(FACTORY.fold) } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float lines = 0.5 + 0.5 * sin(vUv.y * 90.0 + uTime * 3.0);
      float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
      float a = (0.025 + 0.05 * lines) * edge;
      gl_FragColor = vec4(uColor * a * 2.0, a);
    }
  `,
});

export function Fold({ box, y0, y1 }: { box: Box; y0: number; y1: number }) {
  useFrame(({ clock }) => (curtain.uniforms.uTime.value = clock.elapsedTime));
  const h = y1 - y0;
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const edge = useMemo(() => new THREE.Color(FACTORY.fold).multiplyScalar(2), []);
  const walls: { p: [number, number, number]; r: number; len: number }[] = [
    { p: [cx, y0 + h / 2, box.z0], r: 0, len: w },
    { p: [cx, y0 + h / 2, box.z1], r: 0, len: w },
    { p: [box.x0, y0 + h / 2, cz], r: Math.PI / 2, len: d },
    { p: [box.x1, y0 + h / 2, cz], r: Math.PI / 2, len: d },
  ];
  return (
    <group>
      {walls.map((wl, i) => (
        <mesh key={i} position={wl.p} rotation={[0, wl.r, 0]} material={curtain}>
          <planeGeometry args={[wl.len, h]} />
        </mesh>
      ))}
      {[
        [box.x0, box.z0],
        [box.x1, box.z0],
        [box.x0, box.z1],
        [box.x1, box.z1],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, y0 + h / 2, z]}>
          <boxGeometry args={[0.012, h, 0.012]} />
          <meshBasicMaterial color={edge} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
