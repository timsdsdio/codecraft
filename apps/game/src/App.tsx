// CodeCraft: stand on a running React app, drop through it into the factory that makes it.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { Factory, PX, SLAB, Stage, TouchControls, floorY, isCoarsePointer, type FactoryLayout, type WalkSpawn } from '@codecraft/visuals';
import type { GameMessage, Payload } from '@codecraft/probe';
import { useProbe } from './useProbe';

/** The app being visualised. It runs its own dev server; see apps/todo. */
const APP_URL = import.meta.env.VITE_APP_URL ?? `${location.protocol}//${location.hostname}:5320/`;
/** The iframe's size is the app's viewport. */
const VIEWPORT = { w: 400, h: 720 };
/** How far away (world units) you can press things on the screen. */
const REACH = 4;

/** Standing heights: every floor, then the screen on top. */
function levelsOf(layout: FactoryLayout) {
  const floors = Array.from({ length: layout.floors }, (_, i) => ({ y: floorY(i + 1) + SLAB, name: `Floor ${i + 1}` }));
  return [...floors, { y: layout.screenY + SLAB, name: 'Screen' }];
}

export function App() {
  const probe = useProbe();
  const { layout } = probe;
  const [coarse] = useState(isCoarsePointer);
  const [level, setLevel] = useState<string>('Screen');
  const camera = useRef<THREE.Camera | null>(null);
  const onScreen = level === 'Screen';

  const levels = useMemo(() => (layout ? levelsOf(layout) : null), [layout?.floors, layout?.screenY]); // eslint-disable-line react-hooks/exhaustive-deps
  const spawn = useMemo<WalkSpawn | undefined>(() => (layout ? { pos: [0.3, layout.screenY + SLAB, layout.size[1] / 2 - 0.9], yaw: 0 } : undefined), [!!layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // the keyboard belongs to the app while one of its inputs has focus
  useEffect(() => {
    if (probe.editing) {
      document.exitPointerLock?.();
      probe.frame.current?.focus();
    }
  }, [probe.editing, probe.frame]);

  /** Press whatever the ray through NDC (x, y) hits on the screen. */
  const pressAt = (ndc: { x: number; y: number }) => {
    const cam = camera.current;
    if (!cam || !layout || !onScreen) return;
    const hit = screenPoint(cam, ndc, layout);
    if (hit) probe.send({ type: 'click', ...hit });
  };

  return (
    <div className="game">
      <Stage
        mode={levels ? 'walk' : 'orbit'}
        walk={levels ? { levels: levels.map((l) => l.y), spawn, onLevel: (i) => setLevel(levels[i]?.name ?? '') } : undefined}
        eye={[6, 7, 9]}
        target={[0, 1, 0]}
        autoRotate={false}
        floor={false}
      >
        <CameraRef out={camera} />
        {layout && <Factory layout={layout} activity={probe.activity} wires />}
        {layout && <ScreenSlab layout={layout} />}
        <AppScreen layout={layout} frame={probe.frame} visible={onScreen || !layout} />
        {layout && !coarse && <DesktopInput enabled={onScreen} layout={layout} send={probe.send} />}
      </Stage>

      <div className="hud">
        <span className="hud-title">CODECRAFT</span>
        {layout && <span className="hud-level">{level}</span>}
      </div>
      {!layout && <div className="hud-center">Connecting to the app at {APP_URL}…</div>}
      {probe.editing && <div className="hud-center hud-typing">Typing in the app · Esc to stop</div>}
      {layout && !probe.editing && <div className="crosshair" aria-hidden />}
      {layout && !coarse && !probe.editing && (
        <div className="hud-hint">
          Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · click the screen to press · wheel scrolls ·{' '}
          <kbd>Shift</kbd> down a floor · <kbd>Space</kbd> up
        </div>
      )}
      {layout && coarse && (
        <TouchControls
          onTap={(x, y) => pressAt({ x: (x / window.innerWidth) * 2 - 1, y: -(y / window.innerHeight) * 2 + 1 })}
        />
      )}
    </div>
  );
}

function CameraRef({ out }: { out: MutableRefObject<THREE.Camera | null> }) {
  out.current = useThree((s) => s.camera);
  return null;
}

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

/** Where the ray through `ndc` meets the screen, in the app's viewport px (or null). */
function screenPoint(cam: THREE.Camera, ndc: { x: number; y: number }, layout: FactoryLayout) {
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
  plane.constant = -(layout.screenY + SLAB);
  if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
  if (hitPoint.distanceTo(ray.ray.origin) > REACH) return null;
  const x = hitPoint.x * PX + VIEWPORT.w / 2;
  const y = hitPoint.z * PX + VIEWPORT.h / 2;
  return x >= 0 && y >= 0 && x <= VIEWPORT.w && y <= VIEWPORT.h ? { x, y } : null;
}

/** Desktop: with the mouse captured, clicks press the app at the crosshair and the wheel scrolls it. */
function DesktopInput({ enabled, layout, send }: { enabled: boolean; layout: FactoryLayout; send: (m: Payload<GameMessage>) => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const el = gl.domElement;
    const locked = () => document.pointerLockElement === el;
    const onDown = (e: PointerEvent) => {
      if (!enabled || !locked() || e.button !== 0) return;
      const hit = screenPoint(camera, { x: 0, y: 0 }, layout);
      if (hit) send({ type: 'click', ...hit });
    };
    const onWheel = (e: WheelEvent) => {
      if (!enabled || !locked()) return;
      const hit = screenPoint(camera, { x: 0, y: 0 }, layout);
      if (hit) send({ type: 'wheel', ...hit, dy: e.deltaY });
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, enabled, layout, send]);
  return null;
}

/**
 * The app itself: a real iframe lying face up as the factory's roof, placed with three.js's
 * CSS3DRenderer (1 CSS px = 0.01 units). The iframe is created once, outside React, so nothing
 * the game re-renders can reload the app.
 */
function AppScreen({ layout, frame, visible }: { layout: FactoryLayout | null; frame: MutableRefObject<HTMLIFrameElement | null>; visible: boolean }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const css = useRef<{ renderer: CSS3DRenderer; scene: THREE.Scene; obj: CSS3DObject } | null>(null);

  useEffect(() => {
    const host = gl.domElement.parentElement?.parentElement;
    if (!host) return;
    const renderer = new CSS3DRenderer();
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
    host.appendChild(renderer.domElement);
    const iframe = document.createElement('iframe');
    iframe.src = APP_URL;
    iframe.title = 'The app';
    iframe.width = String(VIEWPORT.w);
    iframe.height = String(VIEWPORT.h);
    Object.assign(iframe.style, { display: 'block', border: '0', background: '#fff' });
    frame.current = iframe;
    const obj = new CSS3DObject(iframe);
    obj.rotation.x = -Math.PI / 2;
    obj.scale.setScalar(1 / PX);
    const scene = new THREE.Scene();
    scene.add(obj);
    css.current = { renderer, scene, obj };
    return () => {
      renderer.domElement.remove();
      frame.current = null;
      css.current = null;
    };
  }, [gl, frame]);

  useEffect(() => {
    css.current?.renderer.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame(() => {
    const c = css.current;
    if (!c) return;
    c.obj.position.y = (layout?.screenY ?? 0) + SLAB + 0.002;
    c.renderer.domElement.style.visibility = visible ? 'visible' : 'hidden';
    c.renderer.render(c.scene, camera);
  });
  return null;
}

/** Dark slab under the screen: the roof you see from inside the factory. */
function ScreenSlab({ layout }: { layout: FactoryLayout }) {
  const [w, d] = layout.size;
  return (
    <mesh position={[0, layout.screenY + SLAB / 2, 0]}>
      <boxGeometry args={[w + 0.08, SLAB, d + 0.08]} />
      <meshStandardMaterial color="#0a0f16" metalness={0.6} roughness={0.4} />
    </mesh>
  );
}
