// A self-contained little Tron room for one embed: canvas, fog, lights, baked reflections,
// a neon floor grid, orbit controls and bloom. Everything renders inside <Stage>{…}</Stage>.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { Vec3 } from './factory/layout';
import { LookProvider, type Look } from './factory/look';
import { WalkControls, type WalkSpawn } from './WalkControls';
import { isCoarsePointer } from './input';

export const FOG_COLOR = '#03070f';


/** Scroll folds need per-material clipping planes. */
function LocalClipping() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  return null;
}

/** Counts frames and writes "NN fps" into a DOM element twice a second (no React re-renders). */
function FpsMeter({ out }: { out: RefObject<HTMLDivElement | null> }) {
  const acc = useRef({ frames: 0, since: performance.now() });
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    const now = performance.now();
    if (now - a.since >= 500) {
      const fps = Math.round((a.frames * 1000) / (now - a.since));
      const el = out.current;
      if (el) {
        el.textContent = `${fps} fps`;
        el.style.color = fps >= 50 ? '#7dffbe' : fps >= 30 ? '#ffd166' : '#ff5c7a';
      }
      a.frames = 0;
      a.since = now;
    }
  });
  return null;
}

const FPS_STYLE = {
  position: 'absolute',
  left: 6,
  bottom: 6,
  zIndex: 2,
  padding: '1px 5px',
  font: '600 10px/1.5 "JetBrains Mono", ui-monospace, monospace',
  color: '#7dffbe',
  background: 'rgba(0,0,0,0.55)',
  borderRadius: 4,
  pointerEvents: 'none',
} as const;

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
  /** machine materials: neon edges (tron) or Create-style brass */
  look?: Look;
  /** 'walk' = first person (see WalkControls); 'orbit' = turntable camera */
  mode?: 'orbit' | 'walk';
  /** walk mode: standing heights and where you start */
  walk?: { levels?: number[]; spawn?: WalkSpawn; onLevel?: (i: number) => void };
  /** orbit mode: allow drag-to-orbit on touch screens (off inline, so the page can scroll) */
  touchOrbit?: boolean;
  /** tiny frame-rate readout in the bottom-left corner (the parent must be positioned) */
  fps?: boolean;
  /** give the canvas an alpha channel, so DOM placed behind it shows through transparent pixels */
  alpha?: boolean;
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
  look = 'tron',
  mode = 'orbit',
  walk,
  touchOrbit = false,
  fps = true,
  alpha = false,
}: StageProps) {
  const fpsEl = useRef<HTMLDivElement>(null);
  const [coarse] = useState(isCoarsePointer);
  const bloom = quality === 'high';
  return (
    <>
      <Canvas
        className={className}
        dpr={quality === 'low' ? 1 : coarse ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !bloom, powerPreference: 'high-performance', alpha, stencil: false }}
        camera={{ fov, near: 0.05, far: 200, position: eye }}
        style={{ touchAction: coarse && mode === 'orbit' && !touchOrbit ? 'pan-y' : 'none' }}
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
        <LookProvider look={look}>{children}</LookProvider>
        {mode === 'walk' ? (
          <WalkControls levels={walk?.levels} spawn={walk?.spawn} onLevel={walk?.onLevel} />
        ) : (
          // inline on touch: no drag-to-orbit, so the page still scrolls under a finger
          <OrbitControls
            makeDefault
            target={target}
            enabled={!coarse || touchOrbit}
            enableZoom={touchOrbit}
            enablePan={false}
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            minPolarAngle={0.25}
            maxPolarAngle={Math.PI / 2 - 0.06}
          />
        )}
        <LocalClipping />
        <ToneMappingSwitch post={bloom} />
        {bloom && (
          <EffectComposer multisampling={coarse ? 0 : 4} enableNormalPass={false}>
            <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.3} intensity={0.7} radius={0.6} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette offset={0.3} darkness={0.45} />
          </EffectComposer>
        )}
        {fps && <FpsMeter out={fpsEl} />}
      </Canvas>
      {fps && <div ref={fpsEl} style={FPS_STYLE} aria-hidden />}
    </>
  );
}
