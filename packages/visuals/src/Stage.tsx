// A self-contained little Tron room for one embed: canvas, fog, lights, baked reflections,
// a neon floor grid, orbit controls and bloom. Everything renders inside <Stage>{…}</Stage>.
import { useEffect, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { Vec3 } from './factory/layout';

export const FOG_COLOR = '#03070f';

export const isCoarsePointer = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** Scroll folds need per-material clipping planes. */
function LocalClipping() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  return null;
}

function ToneMappingSwitch({ post }: { post: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // with a composer the ToneMapping effect does it; without one the renderer must
    gl.toneMapping = post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  }, [gl, post]);
  return null;
}

/** Baked once: overhead strips plus a cyan/amber wash, so glossy blocks pick up reflections. */
function Reflections() {
  return (
    <Environment frames={1} resolution={128} background={false} environmentIntensity={0.85}>
      <color attach="background" args={['#010205']} />
      {[-4, 0, 4].map((x) => (
        <Lightformer key={x} form="rect" intensity={4} color="#cfefff" position={[x, 6, 0]} rotation-x={Math.PI / 2} scale={[0.6, 20, 1]} />
      ))}
      <Lightformer form="rect" intensity={0.9} color="#00d8ff" position={[0, 2, 12]} rotation-y={Math.PI} scale={[30, 3, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#ff6a00" position={[0, 2, -12]} scale={[30, 3, 1]} />
      <Lightformer form="ring" intensity={1.2} color="#ff00e5" position={[-8, 1.5, 0]} rotation-y={Math.PI / 2} scale={2} />
    </Environment>
  );
}

export interface StageProps {
  children: ReactNode;
  /** camera eye position */
  eye?: Vec3;
  /** orbit target */
  target?: Vec3;
  fov?: number;
  /** slowly orbit the target */
  autoRotate?: boolean;
  /** draw the floor grid */
  floor?: boolean;
  /** 'low' = no bloom, dpr 1 (phones / many embeds) */
  quality?: 'high' | 'low';
  className?: string;
}

export function Stage({
  children,
  eye = [4.5, 3.6, 5.5],
  target = [0, 0.9, 0],
  fov = 40,
  autoRotate = true,
  floor = true,
  quality = 'high',
  className,
}: StageProps) {
  const [coarse] = useState(isCoarsePointer);
  const bloom = quality === 'high';
  return (
    <Canvas
      className={className}
      dpr={quality === 'low' ? 1 : coarse ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !bloom, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov, near: 0.05, far: 200, position: eye }}
      style={{ touchAction: coarse ? 'pan-y' : 'none' }}
    >
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 14, 40]} />
      <ambientLight intensity={0.18} />
      <hemisphereLight args={['#3a7cff', '#02040a', 0.45]} />
      <directionalLight position={[6, 14, 9]} intensity={0.7} color="#cfeaff" />
      <Reflections />
      {floor && (
        <Grid
          infiniteGrid
          cellSize={0.5}
          sectionSize={2}
          cellThickness={0.6}
          sectionThickness={1}
          cellColor="#0b3b44"
          sectionColor="#00b8c0"
          fadeDistance={22}
          fadeStrength={1.6}
          position={[0, 0.001, 0]}
        />
      )}
      {children}
      {/* touch: no drag-to-orbit, so the page still scrolls under a finger */}
      <OrbitControls
        makeDefault
        target={target}
        enabled={!coarse}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2 - 0.06}
      />
      <LocalClipping />
      <ToneMappingSwitch post={bloom} />
      {bloom && (
        <EffectComposer multisampling={coarse ? 0 : 4} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={1.1} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.45} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
