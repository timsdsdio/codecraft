// Window: a test of whether a phone browser can make its screen look like a window into a box behind
// it. The eye position comes from one of three sources: the front camera (face tracking), the
// gyroscope (assumes the head holds still and only the phone turns) or a finger (for desktops and
// for comparison). Everything is measured in millimetres on the real screen.
import * as THREE from 'three';
import './window.css';
import { FaceTracker, type FaceSample } from './face';
import { GyroFrame } from './gyro';
import { aimThroughGlass, OneEuro, type Vec3 } from './projection';
import { buildBox, lights } from './scene';

type Mode = 'face' | 'tilt' | 'drag';

interface Settings {
  mmPerPx: number;
  cameraAboveMm: number;
  fovDeg: number;
  ipdMm: number;
  depth: number; // box depth as a multiple of the screen's height
  flipX: boolean;
  flipY: boolean;
  gyroAssist: boolean;
  preview: boolean;
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
const DEFAULTS: Settings = {
  // most phones show about 6 CSS px per mm
  mmPerPx: 0.16,
  // iPhones put the lens in the status bar; Android Chrome adds an address bar above the page too
  cameraAboveMm: isIOS ? 5 : 12,
  fovDeg: 70,
  ipdMm: 63,
  depth: 1.2,
  flipX: false,
  flipY: false,
  gyroAssist: true,
  preview: true,
};
const STORE = 'codecraft.window.settings';
const HELD_EYE_MM = 350; // assumed distance for the tilt and touch sources

const settings: Settings = { ...DEFAULTS, ...load() };
function load(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch {
    // private browsing: settings last for this visit only
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- rendering ---------------------------------------------------------------------------------

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070f);
lights(scene);
const camera = new THREE.PerspectiveCamera();

let glassW = 0;
let glassH = 0;
let box: ReturnType<typeof buildBox> | null = null;

function layout() {
  renderer.setSize(innerWidth, innerHeight, false);
  glassW = innerWidth * settings.mmPerPx;
  glassH = innerHeight * settings.mmPerPx;
  if (box) {
    scene.remove(box.group);
    box.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
  box = buildBox(glassW, glassH, glassH * settings.depth);
  scene.add(box.group);
}
addEventListener('resize', layout);
layout();

// --- eye sources -------------------------------------------------------------------------------

let mode: Mode = 'drag';
const eye: Vec3 = { x: 0, y: 0, z: HELD_EYE_MM };
const filters = { x: new OneEuro(), y: new OneEuro(), z: new OneEuro(0.6, 0.01) };

/** camera-relative position (screen axes) → position in front of the page's centre */
function fromLens(p: Vec3): Vec3 {
  return {
    x: (settings.flipX ? -1 : 1) * p.x,
    y: (settings.flipY ? -1 : 1) * p.y + glassH / 2 + settings.cameraAboveMm,
    z: p.z,
  };
}

// face: the eye is filtered in the gyroscope's reference frame, which doesn't turn with the phone,
// and turned into the phone's frame every render
const gyro = new GyroFrame();
const faceRef = new THREE.Vector3(0, 0, HELD_EYE_MM);
const v = new THREE.Vector3();
const assisted = () => settings.gyroAssist && gyro.active;
let lastFace: FaceSample | null = null;
const faceTimes: number[] = [];
const face = new FaceTracker(
  () => settings,
  (s) => {
    lastFace = s;
    if (s) {
      faceTimes.push(s.t);
      while (faceTimes.length && s.t - faceTimes[0] > 1000) faceTimes.shift();
    }
    if (mode !== 'face' || !s) return;
    const p = fromLens(s.eye);
    v.set(p.x, p.y, p.z);
    if (assisted()) gyro.toReference(v, s.captured);
    faceRef.set(filters.x.filter(v.x, s.t), filters.y.filter(v.y, s.t), filters.z.filter(v.z, s.t));
    showIrises(s);
  },
);
let faceReady = false;

// tilt: integrate the gyroscope, leaking back to centre so the rest position follows the hand
const tilt = { x: 0, y: 0, t: 0, ok: false };
let motionStarted = false;
function onMotion(e: DeviceMotionEvent) {
  gyro.update(e);
  const r = e.rotationRate;
  if (!r || r.beta == null || r.gamma == null) return;
  tilt.ok = true;
  const now = performance.now();
  const dt = tilt.t ? Math.min((now - tilt.t) / 1000, 0.1) : 0;
  tilt.t = now;
  const leak = Math.exp(-dt / 2.5);
  tilt.x = (tilt.x + ((r.beta * Math.PI) / 180) * dt) * leak; // about the screen's x axis
  tilt.y = (tilt.y + ((r.gamma * Math.PI) / 180) * dt) * leak; // about the screen's y axis
  if (mode !== 'tilt') return;
  // a still eye straight in front of the page, seen from a turned phone
  eye.x = (settings.flipX ? -1 : 1) * -HELD_EYE_MM * Math.sin(tilt.y);
  eye.y = (settings.flipY ? -1 : 1) * HELD_EYE_MM * Math.sin(tilt.x);
  eye.z = HELD_EYE_MM * Math.cos(tilt.x) * Math.cos(tilt.y);
}
async function startTilt() {
  const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
  if (DME.requestPermission && (await DME.requestPermission()) !== 'granted') {
    throw new Error('Motion access was turned down. Reload the page to be asked again.');
  }
  addEventListener('devicemotion', onMotion);
  motionStarted = true;
}

// touch: the finger stands in for the eye, three times as far out so small drags show a lot
let down: { x: number; y: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
  if (mode !== 'drag' || (e.pointerType !== 'mouse' && !down)) return;
  eye.x = (e.clientX - innerWidth / 2) * settings.mmPerPx * 3;
  eye.y = (innerHeight / 2 - e.clientY) * settings.mmPerPx * 3;
  eye.z = HELD_EYE_MM;
});
canvas.addEventListener('pointerup', () => {
  if (down && !down.moved && chrome.hidden && !start.isConnected) showChrome(true);
  down = null;
});

// --- UI ----------------------------------------------------------------------------------------

const start = $('start');
const chrome = $('chrome');
const status = $('status');
const readout = $('readout');
const rate = $('rate');
const preview = $('preview');
const dots = preview.querySelectorAll<HTMLElement>('.dot');
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-mode]');

function showChrome(on: boolean) {
  chrome.hidden = !on;
  syncPreview();
}

function setMode(m: Mode) {
  mode = m;
  modeButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  if (m !== 'face') Object.values(filters).forEach((f) => f.reset());
  if (m !== 'drag') return;
  eye.x = 0;
  eye.y = 0;
  eye.z = HELD_EYE_MM;
}

function syncPreview() {
  preview.hidden = !(settings.preview && faceReady && mode === 'face');
}

function showIrises(s: FaceSample) {
  if (preview.hidden) return;
  s.irises.forEach(([x, y], i) => {
    dots[i].style.left = `${(1 - x) * 100}%`;
    dots[i].style.top = `${y * 100}%`;
  });
}

async function begin(m: Mode) {
  const buttons = start.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  try {
    // ask for motion first: iOS only allows the request straight from the tap
    if (m !== 'drag') await startTilt().catch((e) => (m === 'tilt' ? Promise.reject(e) : undefined));
    if (m === 'face') {
      await face.start((msg) => (status.textContent = msg));
      faceReady = true;
      preview.prepend(face.video);
    }
    if (m === 'tilt' && !tilt.ok) status.textContent = 'Waiting for the gyroscope…';
    navigator.wakeLock?.request('screen').catch(() => {});
    start.remove();
    setMode(m);
    showChrome(true);
  } catch (e) {
    status.textContent = describe(e);
    buttons.forEach((b) => (b.disabled = false));
  }
}

function describe(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Camera access was turned down. Allow it in the browser’s site settings, then reload.';
  if (name === 'NotFoundError') return 'No front camera was found. Try tilt or touch instead.';
  if (!isSecureContext) return 'The camera needs an https:// address.';
  return e instanceof Error ? e.message : String(e);
}

$('go').addEventListener('click', () => begin('face'));
$('go-tilt').addEventListener('click', () => begin('tilt'));
$('go-drag').addEventListener('click', () => begin('drag'));
modeButtons.forEach((b) =>
  b.addEventListener('click', async () => {
    const m = b.dataset.mode as Mode;
    // ask for motion first: iOS only allows the request straight from the tap
    if (m !== 'drag' && !motionStarted) {
      const failed = await startTilt().then(
        () => false,
        (e) => ((readout.textContent = describe(e)), true),
      );
      if (failed && m === 'tilt') return;
    }
    if (m === 'face' && !faceReady) {
      try {
        await face.start((msg) => (readout.textContent = msg));
        faceReady = true;
        preview.prepend(face.video);
      } catch (e) {
        readout.textContent = describe(e);
        return;
      }
    }
    setMode(m);
    syncPreview();
  }),
);
$('hide').addEventListener('click', () => showChrome(false));

// settings
const sheet = $('settings');
const card = $('card');
const sliders = {
  mmPerPx: { el: $<HTMLInputElement>('s-scale'), out: $('o-scale'), fmt: (v: number) => `${(1 / v).toFixed(2)} px/mm` },
  cameraAboveMm: { el: $<HTMLInputElement>('s-cam'), out: $('o-cam'), fmt: (v: number) => `${v} mm` },
  fovDeg: { el: $<HTMLInputElement>('s-fov'), out: $('o-fov'), fmt: (v: number) => `${v}°` },
  ipdMm: { el: $<HTMLInputElement>('s-ipd'), out: $('o-ipd'), fmt: (v: number) => `${v} mm` },
  depth: { el: $<HTMLInputElement>('s-depth'), out: $('o-depth'), fmt: (v: number) => `${Math.round(v * glassH)} mm` },
} as const;
const checks = {
  flipX: $<HTMLInputElement>('s-flipx'),
  flipY: $<HTMLInputElement>('s-flipy'),
  gyroAssist: $<HTMLInputElement>('s-gyro'),
  preview: $<HTMLInputElement>('s-preview'),
} as const;

function syncSettings() {
  for (const [k, s] of Object.entries(sliders) as [keyof typeof sliders, (typeof sliders)[keyof typeof sliders]][]) {
    s.el.value = String(settings[k]);
    s.out.textContent = s.fmt(settings[k]);
  }
  for (const [k, el] of Object.entries(checks) as [keyof typeof checks, HTMLInputElement][]) el.checked = settings[k];
  // the short edge of an ISO/IEC 7810 ID-1 card, which fits across any phone
  card.style.width = `${53.98 / settings.mmPerPx}px`;
}
for (const [k, s] of Object.entries(sliders) as [keyof typeof sliders, (typeof sliders)[keyof typeof sliders]][]) {
  s.el.addEventListener('input', () => {
    settings[k] = Number(s.el.value);
    save();
    if (k === 'mmPerPx' || k === 'depth') layout();
    syncSettings();
  });
}
for (const [k, el] of Object.entries(checks) as [keyof typeof checks, HTMLInputElement][]) {
  el.addEventListener('change', () => {
    settings[k] = el.checked;
    save();
    if (k === 'gyroAssist') Object.values(filters).forEach((f) => f.reset());
    syncPreview();
  });
}
$('open-settings').addEventListener('click', () => {
  syncSettings();
  sheet.hidden = false;
});
$('close-settings').addEventListener('click', () => (sheet.hidden = true));
$('reset').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  save();
  layout();
  syncSettings();
  syncPreview();
});
const fs = $<HTMLButtonElement>('fullscreen');
fs.hidden = !document.fullscreenEnabled;
fs.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});

// --- frame loop --------------------------------------------------------------------------------

const sign = (v: number) => (v < 0 ? '−' : '+') + Math.abs(Math.round(v)).toString().padStart(3, ' ');
renderer.setAnimationLoop((t) => {
  if (box) box.cube.rotation.set(t * 0.0003, t * 0.0005, 0);
  if (mode === 'face') {
    v.copy(faceRef);
    if (assisted()) gyro.toPhone(v);
    eye.x = v.x;
    eye.y = v.y;
    eye.z = v.z;
  }
  aimThroughGlass(camera, eye, glassW, glassH);
  renderer.render(scene, camera);

  if (chrome.hidden) return;
  readout.textContent = `eye x${sign(eye.x)} y${sign(eye.y)} z${sign(eye.z)} mm`;
  if (mode === 'face') {
    const fresh = lastFace && performance.now() - lastFace.t < 500;
    const lag = lastFace ? lastFace.t - lastFace.captured : 0;
    rate.textContent = fresh
      ? `${faceTimes.length} fps · ${lag.toFixed(0)} ms behind${assisted() ? ' · gyro assist' : ''}`
      : 'no face in view';
  } else if (mode === 'tilt') {
    rate.textContent = tilt.ok ? 'gyroscope' : 'no gyroscope readings';
  } else {
    rate.textContent = 'drag to move the eye';
  }
});

setMode('drag');
