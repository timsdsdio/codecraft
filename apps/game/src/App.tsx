// CodeCraft: stand on a running React app, drop through it into the factory that makes it.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { Factory, KIND_COLOR, PX, SLAB, Stage, TouchControls, floorY, isCoarsePointer, type Cargo, type FactoryLayout, type WalkSpawn } from '@codecraft/visuals';
import type { GameMessage, Payload } from '@codecraft/probe';
import { useProbe } from './useProbe';
import { Inspector } from './Inspector';

/** The app being visualised runs its own dev server (apps/todo), which serves two versions of it. */
const APP_BASE = import.meta.env.VITE_APP_URL ?? `${location.protocol}//${location.hostname}:5320/`;
const APPS = [
  { id: 'plain', label: 'plain', path: '' },
  { id: 'memo', label: 'memoized', path: 'memo.html' },
] as const;
type AppId = (typeof APPS)[number]['id'];
const appUrl = (id: AppId) => APP_BASE + (APPS.find((a) => a.id === id)?.path ?? '');
/** The iframe's size is the app's viewport. */
const VIEWPORT = { w: 400, h: 720 };
/** How far away (world units) you can press things on the screen. */
const REACH = 4;
/** Replay speeds the speed button cycles through. */
const SPEEDS = [1, 0.5, 0.25, 0.1];

/** Standing heights: every floor, then the screen on top. */
function levelsOf(layout: FactoryLayout) {
  const floors = Array.from({ length: layout.floors }, (_, i) => ({ y: floorY(i + 1) + SLAB, name: `Floor ${i + 1}` }));
  return [...floors, { y: layout.screenY + SLAB, name: 'Screen' }];
}

export function App() {
  const probe = useProbe();
  const [appId, setAppId] = useState<AppId>(() => (new URLSearchParams(location.search).get('app') === 'memo' ? 'memo' : 'plain'));
  const switchApp = () => {
    const next: AppId = appId === 'plain' ? 'memo' : 'plain';
    const url = new URL(location.href);
    url.searchParams.set('app', next);
    history.replaceState(null, '', url);
    probe.reset();
    setAppId(next);
  };
  const { layout } = probe;
  const [coarse] = useState(isCoarsePointer);
  const [level, setLevel] = useState<string>('Screen');
  const camera = useRef<THREE.Camera | null>(null);
  const onScreen = level === 'Screen';
  const [inspected, setInspected] = useState<Cargo | null>(null);
  const [paused, setPaused] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const togglePause = () =>
    setPaused((p) => {
      probe.activity.paused = !p;
      return !p;
    });
  const cycleSpeed = () =>
    setSpeedIndex((i) => {
      const n = (i + 1) % SPEEDS.length;
      probe.activity.speed = SPEEDS[n];
      return n;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'KeyR') probe.replay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        alpha
        mode={levels ? 'walk' : 'orbit'}
        walk={levels ? { levels: levels.map((l) => l.y), spawn, onLevel: (i) => setLevel(levels[i]?.name ?? '') } : undefined}
        eye={[6, 7, 9]}
        target={[0, 1, 0]}
        autoRotate={false}
        floor={false}
      >
        <CameraRef out={camera} />
        {layout && <Factory layout={layout} activity={probe.activity} />}
        {layout && <Inspector onChange={setInspected} />}
        {layout && <ScreenWindow layout={layout} />}
        <AppScreen layout={layout} frame={probe.frame} url={appUrl(appId)} onLoad={() => probe.send({ type: 'sync' })} />
        {layout && !coarse && <DesktopInput enabled={onScreen} layout={layout} send={probe.send} />}
      </Stage>

      <div className="hud">
        <span className="hud-title">CODECRAFT</span>
        {layout && <span className="hud-level">{level}</span>}
        <button type="button" className="hud-app" onClick={(e) => (switchApp(), e.currentTarget.blur())} title="Switch between the plain and memoized versions of the app">
          app: <b>{APPS.find((a) => a.id === appId)?.label}</b>
        </button>
      </div>
      {layout && (
        <div className="hud-time" role="group" aria-label="Time">
          <button type="button" onClick={(e) => (togglePause(), e.currentTarget.blur())} title="Pause (P)">
            {paused ? '▶ play' : '❚❚ pause'}
          </button>
          <button type="button" onClick={(e) => (cycleSpeed(), e.currentTarget.blur())} title="Replay speed">
            {SPEEDS[speedIndex]}×
          </button>
          <button type="button" onClick={(e) => (probe.replay(), e.currentTarget.blur())} title="Replay the last update (R)">
            ⟲ replay
          </button>
        </div>
      )}
      {inspected && (
        <div className="hud-inspect">
          <div className="hud-inspect-title" style={{ color: KIND_COLOR[inspected.kind] }}>
            {inspected.label}
          </div>
          {inspected.value !== undefined && <pre>{pretty(inspected.value)}</pre>}
        </div>
      )}
      {!layout && <div className="hud-center">Connecting to the app at {appUrl(appId)}…</div>}
      {probe.editing && <div className="hud-center hud-typing">Typing in the app · Esc to stop</div>}
      {layout && !probe.editing && <div className="crosshair" aria-hidden />}
      {layout && !coarse && !probe.editing && (
        <div className="hud-hint">
          Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · click the screen to press · wheel scrolls ·{' '}
          <kbd>Shift</kbd> down a floor · <kbd>Space</kbd> up · <kbd>P</kbd> pause · <kbd>R</kbd> replay
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
 * CSS3DRenderer (1 CSS px = 0.01 units). The iframe is created once, outside React, so nothing the
 * game re-renders can reload the app.
 *
 * The page sits *behind* the WebGL canvas, which is transparent only where the screen is
 * (see ScreenWindow). So anything in front of the screen draws over it, and from below you see the
 * page's back face: the app, mirrored, as if through glass.
 */
function AppScreen({
  layout,
  frame,
  url,
  onLoad,
}: {
  layout: FactoryLayout | null;
  frame: MutableRefObject<HTMLIFrameElement | null>;
  url: string;
  onLoad: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const css = useRef<{ renderer: CSS3DRenderer; scene: THREE.Scene; obj: CSS3DObject } | null>(null);

  useEffect(() => {
    const host = gl.domElement.parentElement?.parentElement;
    if (!host) return;
    const renderer = new CSS3DRenderer();
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '-1' });
    host.appendChild(renderer.domElement);
    const iframe = document.createElement('iframe');
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

  // load (or switch) the app; ask the probe for a snapshot whenever a page finishes loading
  const loaded = useRef(onLoad);
  loaded.current = onLoad;
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const onLoadEvent = () => loaded.current();
    iframe.addEventListener('load', onLoadEvent);
    if (iframe.src !== url) iframe.src = url;
    return () => iframe.removeEventListener('load', onLoadEvent);
  }, [url, frame]);

  useFrame(() => {
    const c = css.current;
    if (!c) return;
    c.obj.position.y = (layout?.screenY ?? 0) + SLAB;
    c.renderer.render(c.scene, camera);
  });
  return null;
}

/**
 * Where the screen is, the canvas writes fully transparent pixels so the page behind it shows
 * through, from above and below. It still writes depth, so machines behind the screen stay hidden
 * and machines in front of it draw over it. A thin frame marks the screen's edge.
 */
const windowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  blending: THREE.NoBlending,
  side: THREE.DoubleSide,
});

/** Faces down only: dims the page seen from below, so it doesn't glare in the dark factory. */
const undersideTint = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });

function ScreenWindow({ layout }: { layout: FactoryLayout }) {
  const [w, d] = layout.size;
  const y = layout.screenY + SLAB;
  const t = 0.04;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={windowMaterial} renderOrder={-1}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} material={undersideTint} raycast={() => {}}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {[
        [0, -d / 2 - t / 2, w + 2 * t, t],
        [0, d / 2 + t / 2, w + 2 * t, t],
        [-w / 2 - t / 2, 0, t, d],
        [w / 2 + t / 2, 0, t, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, -SLAB / 2, z]}>
          <boxGeometry args={[sx, SLAB, sz]} />
          <meshStandardMaterial color="#0a0f16" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** JSON for the inspector, clipped to a readable length. */
function pretty(v: unknown): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 2);
  const lines = (s ?? String(v)).split('\n');
  return lines.length > 18 ? [...lines.slice(0, 18), '  …'].join('\n') : lines.join('\n');
}
