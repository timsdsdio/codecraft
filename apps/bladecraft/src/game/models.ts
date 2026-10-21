// The machines as small steampunk contraptions built from primitives: riveted iron, brass and
// copper, with brass plates naming each part. Every model sits on the block's floor, faces local +x
// (its output), and animates from the state the factory leaves in its block:
//   extractor        a pump: its rod strokes and its flywheel turns once per element drawn
//   duct             a conveyor belt whose surface runs the way it carries
//   adder            two meshing gears that turn while it works
//   wedger           a stamping press whose ram comes down as the work completes
//   multiplier       a spoked flywheel that spins up while it works
//   sandwich press   two jaws closing on a turntable that turns a quarter per operation
//   collector        a banded tank with a gauge window showing how full it is
//   hub              a pedestal with armillary rings turning around the element it wants
//   bench            a workbench with a vice and a gear train
import * as THREE from 'three';
import type { Multivector } from '@codecraft/ga';
import { DUCT_SPEED, EXTRACT_EVERY, WORK_TIME, COLLECTOR_CAPACITY } from './factory';
import type { MachineType } from './items';
import { MACHINE_LOOK, hex } from './looks';
import { E3, bloch, fiber, project, toQuat } from './qubit';
import { SINGLE_INPUT, type Block } from './world';
import { parts, toWorld } from './glyph';

// --- shared materials and geometry -------------------------------------------------------------

const M = {
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }),
  darkBrass: new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.45 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc0703c, metalness: 1, roughness: 0.35 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.85, roughness: 0.5 }),
  darkIron: new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.8, roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 1, roughness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0, roughness: 0.75 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
  gaugeFace: new THREE.MeshStandardMaterial({ color: 0xf2e8cf, metalness: 0, roughness: 0.6 }),
  needle: new THREE.MeshBasicMaterial({ color: 0xaa2222 }),
};

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

const box = (w: number, h: number, d: number) => geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, seg = 20, open = false) =>
  geo(`cyl${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const torus = (r: number, t: number) => geo(`torus${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 32));
const sphere = (r: number) => geo(`sphere${r}`, () => new THREE.SphereGeometry(r, 12, 8));

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/** a gear lying in the xy plane, centred, `depth` thick along z */
function gear(r: number, teeth: number, depth: number) {
  return geo(`gear${r},${teeth},${depth}`, () => {
    const s = new THREE.Shape();
    const inner = r * 0.8;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const w = (Math.PI * 2) / teeth;
      const pts: [number, number][] = [
        [inner, a],
        [r, a + w * 0.15],
        [r, a + w * 0.45],
        [inner, a + w * 0.6],
      ];
      pts.forEach(([rad, ang], k) => {
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0 && k === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      });
    }
    s.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

/** a spoked wheel lying in the xy plane */
function wheel(r: number, spokes: number, mat: THREE.Material) {
  const g = new THREE.Group();
  g.add(mesh(torus(r, r * 0.09), mat));
  const hub = mesh(cyl(r * 0.16, r * 0.16, r * 0.25), mat);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const s = mesh(cyl(r * 0.04, r * 0.04, r * 1.9, 6), mat);
    s.rotation.z = (i / spokes) * Math.PI;
    g.add(s);
  }
  return g;
}

/** a brass plate with engraved text, facing +z in its own frame */
const plateCache = new Map<string, THREE.MeshStandardMaterial>();
function plate(text: string, w: number, h: number, accent = 0x2a1a08) {
  const key = `${text}|${w}|${h}|${accent}`;
  let mat = plateCache.get(key);
  if (!mat) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = Math.round((256 * h) / w);
    const g = cv.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, '#e2bf68');
    grad.addColorStop(1, '#a5802f');
    g.fillStyle = grad;
    g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#6b4f1a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
    g.fillStyle = '#6b4f1a';
    for (const [x, y] of [[14, 14], [cv.width - 14, 14], [14, cv.height - 14], [cv.width - 14, cv.height - 14]]) {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = hex(accent);
    g.font = `700 ${Math.min(cv.height * 0.62, (cv.width * 1.6) / Math.max(2, text.length))}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.4 });
    plateCache.set(key, mat);
  }
  return new THREE.Mesh(geo(`plane${w},${h}`, () => new THREE.PlaneGeometry(w, h)), mat);
}

function rivets(group: THREE.Group, y: number, half: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const t = -half + (2 * half * (i + 0.5)) / n;
    for (const [x, z] of [[t, half], [t, -half], [half, t], [-half, t]]) group.add(mesh(sphere(0.022), M.brass, x, y, z));
  }
}

/** a pipe stub through a face, along local axis `dir` (unit vector in xz), with a flange at its mouth */
function port(group: THREE.Group, dir: THREE.Vector3, y: number, label?: string) {
  const p = new THREE.Group();
  const pipe = mesh(cyl(0.1, 0.1, 0.16), M.copper);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.x = 0.44;
  const flange = mesh(torus(0.11, 0.03), M.brass);
  flange.rotation.y = Math.PI / 2;
  flange.position.x = 0.52;
  const mouth = mesh(cyl(0.085, 0.085, 0.02), M.darkIron);
  mouth.rotation.z = Math.PI / 2;
  mouth.position.x = 0.525;
  p.add(pipe, flange, mouth);
  if (label) {
    const pl = plate(label, 0.2, 0.14);
    pl.position.set(0.411, 0.2, 0);
    pl.rotation.y = Math.PI / 2;
    p.add(pl);
  }
  p.position.y = y;
  p.rotation.y = Math.atan2(-dir.z, dir.x);
  group.add(p);
  return p;
}

/** a small light in the machine's colour that glows while it works */
function pilot(colour: number) {
  const mat = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.2, roughness: 0.3 });
  const lamp = new THREE.Group();
  lamp.add(mesh(cyl(0.05, 0.06, 0.04), M.brass, 0, 0.02, 0), mesh(sphere(0.045), mat, 0, 0.07, 0));
  return { lamp, set: (on: boolean, dt: number) => (mat.emissiveIntensity += ((on ? 2.2 : 0.15) - mat.emissiveIntensity) * Math.min(1, dt * 8)) };
}

// --- belts -------------------------------------------------------------------------------------

/** one shared belt texture: every belt runs along its local +x, so scrolling it moves them all */
export const beltTexture = (() => {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1c1c1e';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#2c2c30';
  g.lineWidth = 4;
  for (let x = 0; x < 128; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 64);
    g.stroke();
  }
  g.fillStyle = '#c9a24a';
  g.beginPath();
  g.moveTo(40, 14);
  g.lineTo(70, 32);
  g.lineTo(40, 50);
  g.lineTo(52, 32);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
})();
const beltMat = new THREE.MeshStandardMaterial({ map: beltTexture, metalness: 0.1, roughness: 0.85 });

export function scrollBelts(dt: number) {
  // the texture spans one block, so moving it DUCT_SPEED per second matches the elements riding it
  if (beltTexture) beltTexture.offset.x -= DUCT_SPEED * dt;
}

// --- the models --------------------------------------------------------------------------------

export interface Model {
  group: THREE.Group;
  /** where held elements are drawn, in the model's frame */
  anchors: { a: THREE.Vector3; b: THREE.Vector3; out: THREE.Vector3; fixed: THREE.Vector3 };
  /** where steam comes out, in the model's frame */
  chimney: THREE.Vector3;
  update(b: Block | undefined, dt: number, time: number): void;
  /** a flash, for the hub when an element it wants arrives */
  pulse?(): void;
}

const ANCHORS = () => ({
  a: new THREE.Vector3(-0.72, 0.42, 0),
  b: new THREE.Vector3(0, 0.42, 0.72),
  out: new THREE.Vector3(0.72, 0.42, 0),
  fixed: new THREE.Vector3(0.3, 1.42, 0.3),
});

/** the iron cabinet every operation machine is built on */
function chassis(type: MachineType, sides = 'B', stand = true) {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(box(0.8, 0.5, 0.8), M.iron, 0, 0.35, 0));
  for (const [x, z] of [[0.41, 0.41], [0.41, -0.41], [-0.41, 0.41], [-0.41, -0.41]]) g.add(mesh(cyl(0.05, 0.05, 0.6), M.brass, x, 0.4, z));
  g.add(mesh(box(0.88, 0.06, 0.88), M.brass, 0, 0.63, 0));
  rivets(g, 0.665, 0.4, 3);
  port(g, new THREE.Vector3(-1, 0, 0), 0.34, 'A');
  port(g, new THREE.Vector3(0, 0, 1), 0.34, sides);
  port(g, new THREE.Vector3(0, 0, -1), 0.34, sides);
  // output chute
  const chute = new THREE.Group();
  chute.add(mesh(box(0.2, 0.06, 0.26), M.copper, 0.48, 0.24, 0));
  chute.add(mesh(box(0.2, 0.12, 0.03), M.copper, 0.48, 0.29, 0.13));
  chute.add(mesh(box(0.2, 0.12, 0.03), M.copper, 0.48, 0.29, -0.13));
  chute.rotation.z = -0.15;
  g.add(chute);
  const out = plate('OUT', 0.24, 0.12);
  out.position.set(0.401, 0.5, 0);
  out.rotation.y = Math.PI / 2;
  g.add(out);
  // the symbol on the top, readable from the input side
  const sym = plate(MACHINE_LOOK[type].symbol, 0.34, 0.16);
  sym.rotation.x = -Math.PI / 2;
  sym.rotation.z = -Math.PI / 2;
  sym.position.set(-0.24, 0.664, 0);
  g.add(sym);
  // a stand for a fixed B, which floats above
  if (stand) {
    g.add(mesh(cyl(0.012, 0.012, 0.62, 6), M.brass, 0.3, 0.97, 0.3));
    const ring = mesh(torus(0.08, 0.012), M.brass, 0.3, 1.28, 0.3);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const lamp = pilot(MACHINE_LOOK[type].colour);
  lamp.lamp.position.set(-0.32, 0.66, 0.32);
  g.add(lamp.lamp);
  return { g, lamp };
}

type OpBlock = Extract<Block, { kind: 'machine'; a: unknown }>;
const opState = (b: Block | undefined) => {
  const m = b?.kind === 'machine' && 'a' in b ? (b as OpBlock) : null;
  const working = !!m && !!m.a && (SINGLE_INPUT.includes(m.type) || !!(m.fixed ?? m.b)) && !m.out;
  return { m, working, progress: m ? m.work / WORK_TIME : 0 };
};

function adder(): Model {
  const { g, lamp } = chassis('adder');
  const big = mesh(gear(0.17, 12, 0.05), M.brass, -0.05, 0.86, 0);
  const small = mesh(gear(0.12, 9, 0.05), M.copper, 0.22, 0.83, 0);
  small.rotation.z = Math.PI / 9;
  const axle = mesh(box(0.5, 0.04, 0.04), M.darkIron, 0.08, 0.7, 0);
  g.add(big, small, axle, mesh(box(0.04, 0.2, 0.04), M.darkIron, -0.05, 0.76, 0), mesh(box(0.04, 0.16, 0.04), M.darkIron, 0.22, 0.75, 0));
  let speed = 0;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.1, 0),
    update(b, dt) {
      const { working } = opState(b);
      speed += ((working ? 4 : 0) - speed) * Math.min(1, dt * 4);
      big.rotation.z += speed * dt;
      small.rotation.z -= speed * dt * (12 / 9);
      lamp.set(working, dt);
    },
  };
}

function wedger(): Model {
  const { g, lamp } = chassis('wedger');
  // a press frame over an anvil
  for (const z of [-0.26, 0.26]) g.add(mesh(box(0.06, 0.62, 0.06), M.darkIron, 0.12, 0.97, z));
  g.add(mesh(box(0.1, 0.08, 0.62), M.darkIron, 0.12, 1.3, 0));
  g.add(mesh(box(0.26, 0.06, 0.3), M.steel, 0.12, 0.69, 0));
  const ram = new THREE.Group();
  ram.add(mesh(cyl(0.05, 0.05, 0.4, 12), M.steel, 0, 0.2, 0), mesh(box(0.22, 0.08, 0.24), M.brass, 0, 0, 0));
  ram.position.set(0.12, 1.0, 0);
  g.add(ram);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0.12, 1.35, 0),
    update(b, dt) {
      const { working, progress } = opState(b);
      // rise slowly while working, then drop on the stroke at the end
      const target = working ? (progress < 0.8 ? 1.05 + progress * 0.12 : 0.76) : 1.0;
      ram.position.y += (target - ram.position.y) * Math.min(1, dt * (progress >= 0.8 ? 30 : 6));
      lamp.set(working, dt);
    },
  };
}

function multiplier(): Model {
  const { g, lamp } = chassis('multiplier');
  const fly = wheel(0.3, 6, M.brass);
  fly.rotation.x = Math.PI / 2; // lie flat, turning about y
  const spinner = new THREE.Group();
  spinner.add(fly);
  spinner.position.set(0.05, 0.86, 0);
  g.add(mesh(cyl(0.03, 0.03, 0.22, 10), M.steel, 0.05, 0.76, 0), spinner);
  const governor = new THREE.Group();
  const balls = [-1, 1].map((s) => mesh(sphere(0.045), M.copper, s * 0.08, 0.1, 0));
  governor.add(...balls);
  for (const s of [-1, 1]) governor.add(mesh(cyl(0.008, 0.008, 0.12, 4), M.steel, s * 0.04, 0.05, 0));
  governor.position.set(0.05, 0.9, 0);
  g.add(governor);
  let speed = 0;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0.05, 1.1, 0),
    update(b, dt) {
      const { working } = opState(b);
      speed += ((working ? 6 : 0.0) - speed) * Math.min(1, dt * 2);
      spinner.rotation.y += speed * dt;
      governor.rotation.y = spinner.rotation.y;
      // the governor's balls fly out and up as it spins faster
      balls.forEach((ball, i) => ball.position.set((i ? 1 : -1) * (0.08 + speed * 0.006), 0.1 + speed * 0.008, 0));
      lamp.set(working, dt);
    },
  };
}

function sandwich(): Model {
  const { g, lamp } = chassis('sandwich');
  for (const [x, z] of [[-0.05, -0.28], [-0.05, 0.28]]) g.add(mesh(cyl(0.03, 0.03, 0.62, 8), M.darkIron, x, 0.97, z));
  const lower = mesh(cyl(0.22, 0.22, 0.05, 24), M.darkBrass, 0.05, 0.69, 0);
  const table = new THREE.Group();
  const disc = mesh(cyl(0.2, 0.2, 0.04, 24), M.brass);
  const mark = mesh(box(0.18, 0.012, 0.04), M.copper, 0.08, 0.026, 0);
  table.add(disc, mark);
  table.position.set(0.05, 0.74, 0);
  const upper = new THREE.Group();
  upper.add(mesh(cyl(0.22, 0.22, 0.05, 24), M.darkBrass), mesh(cyl(0.04, 0.04, 0.3, 10), M.steel, 0, 0.17, 0));
  upper.position.set(0.05, 1.05, 0);
  g.add(lower, table, upper, mesh(box(0.06, 0.06, 0.62), M.darkIron, -0.05, 1.28, 0));
  let turned = 0;
  let wasWorking = false;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0.05, 1.3, 0),
    update(b, dt) {
      const { working, progress } = opState(b);
      if (wasWorking && !working) turned += Math.PI / 2;
      wasWorking = working;
      const close = working ? Math.min(1, progress * 2) : 0;
      upper.position.y = 1.05 - close * 0.24;
      table.rotation.y += (turned + (working ? progress * (Math.PI / 2) : 0) - table.rotation.y) * Math.min(1, dt * 6);
      lamp.set(working, dt);
    },
  };
}

function extractor(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  // intake from the deposit behind
  const intake = mesh(cyl(0.12, 0.12, 0.3), M.copper, -0.36, 0.3, 0);
  intake.rotation.z = Math.PI / 2;
  const iflange = mesh(torus(0.13, 0.035), M.brass, -0.5, 0.3, 0);
  iflange.rotation.y = Math.PI / 2;
  g.add(intake, iflange);
  // pump housing
  g.add(mesh(cyl(0.24, 0.27, 0.56, 24), M.brass, 0, 0.38, 0));
  for (const y of [0.18, 0.4, 0.62]) {
    const band = mesh(torus(0.265, 0.02), M.darkIron, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  g.add(mesh(cyl(0.2, 0.24, 0.06, 24), M.darkBrass, 0, 0.69, 0));
  const rod = new THREE.Group();
  rod.add(mesh(cyl(0.035, 0.035, 0.42, 10), M.steel, 0, 0.21, 0), mesh(box(0.2, 0.05, 0.08), M.darkIron, 0, 0.43, 0));
  rod.position.set(0, 0.68, 0);
  g.add(rod);
  // flywheel on the side, linked to the rod
  const fly = wheel(0.2, 5, M.iron);
  fly.position.set(0, 0.62, 0.34);
  g.add(fly, mesh(box(0.08, 0.42, 0.04), M.darkIron, 0, 0.42, 0.32));
  // output spout
  const spout = mesh(cyl(0.1, 0.1, 0.28), M.copper, 0.36, 0.3, 0);
  spout.rotation.z = Math.PI / 2;
  const oflange = mesh(torus(0.11, 0.03), M.brass, 0.5, 0.3, 0);
  oflange.rotation.y = Math.PI / 2;
  g.add(spout, oflange);
  // gauge and chimney
  const gauge = new THREE.Group();
  const face = mesh(cyl(0.08, 0.08, 0.02, 20), M.gaugeFace);
  face.rotation.x = Math.PI / 2;
  const rim = mesh(torus(0.08, 0.012), M.brass);
  const needle = mesh(box(0.012, 0.07, 0.006), M.needle, 0, 0.03, 0.012);
  const needlePivot = new THREE.Group();
  needlePivot.add(needle);
  gauge.add(face, rim, needlePivot);
  gauge.position.set(0.16, 0.6, -0.24);
  gauge.rotation.y = -0.5;
  g.add(gauge, mesh(cyl(0.045, 0.06, 0.4, 10), M.darkIron, -0.2, 0.86, -0.2));
  const pl = plate('EXTRACT', 0.42, 0.12);
  pl.position.set(0, 0.32, -0.31);
  pl.rotation.y = Math.PI;
  const deposit = plate('DEPOSIT', 0.3, 0.1);
  deposit.position.set(-0.27, 0.52, 0);
  deposit.rotation.y = -Math.PI / 2;
  g.add(pl, deposit);
  const lamp = pilot(MACHINE_LOOK.extractor.colour);
  lamp.lamp.position.set(0.3, 0.1, 0.34);
  g.add(lamp.lamp);
  return {
    group: g,
    anchors: { ...ANCHORS(), out: new THREE.Vector3(0.72, 0.36, 0) },
    chimney: new THREE.Vector3(-0.2, 1.08, -0.2),
    update(b, dt, time) {
      const m = b?.kind === 'machine' && b.type === 'extractor' ? b : null;
      const phase = m ? m.timer / EXTRACT_EVERY : 0;
      const running = !!m && m.timer > 0;
      rod.position.y = 0.68 + (running ? 0.1 * (1 - Math.cos(phase * Math.PI * 2)) : 0);
      fly.rotation.z = -phase * Math.PI * 2;
      needlePivot.rotation.z = running ? -0.6 + phase * 1.6 + Math.sin(time * 30) * 0.03 : 0.8;
      lamp.set(running, dt);
    },
  };
}

function duct(): Model {
  const g = new THREE.Group();
  for (const z of [-0.27, 0.27]) g.add(mesh(box(1, 0.1, 0.05), M.iron, 0, 0.27, z));
  for (const x of [-0.4, 0.4]) for (const z of [-0.27, 0.27]) g.add(mesh(box(0.05, 0.25, 0.05), M.darkIron, x, 0.12, z));
  g.add(mesh(box(1, 0.03, 0.5), beltMat, 0, 0.3, 0));
  for (const x of [-0.47, 0.47]) {
    const roller = mesh(cyl(0.05, 0.05, 0.54, 12), M.steel, x, 0.29, 0);
    roller.rotation.x = Math.PI / 2;
    g.add(roller);
  }
  return { group: g, anchors: ANCHORS(), chimney: new THREE.Vector3(), update() {} };
}

function collector(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(cyl(0.36, 0.38, 0.72, 28), M.iron, 0, 0.46, 0));
  for (const y of [0.18, 0.46, 0.74]) {
    const band = mesh(torus(0.375, 0.022), M.brass, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  g.add(mesh(cyl(0.2, 0.36, 0.12, 28), M.darkBrass, 0, 0.88, 0), mesh(cyl(0.12, 0.08, 0.12, 16, true), M.copper, 0, 0.98, 0));
  // a gauge window on the front with a level that rises as it fills
  const window = mesh(box(0.08, 0.5, 0.02), M.glass, 0.37, 0.46, 0);
  window.rotation.y = Math.PI / 2;
  const level = mesh(box(0.05, 1, 0.012), new THREE.MeshStandardMaterial({ color: 0x9ab8d0, emissive: 0x4a90c0, emissiveIntensity: 0.6 }), 0.375, 0.21, 0);
  level.rotation.y = Math.PI / 2;
  level.scale.y = 0.001;
  const pl = plate('STORE', 0.3, 0.12);
  pl.position.set(0, 0.6, 0.41);
  g.add(window, level, pl);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.05, 0),
    update(b) {
      const m = b?.kind === 'machine' && b.type === 'collector' ? b : null;
      const fill = m ? m.stored.reduce((n, s) => n + s.count, 0) / COLLECTOR_CAPACITY : 0;
      level.scale.y = Math.max(0.001, fill * 0.5);
      level.position.y = 0.21 + fill * 0.25;
    },
  };
}

function hub(): Model {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.5, 0.52, 0.12, 8), M.darkIron, 0, 0.06, 0));
  g.add(mesh(cyl(0.38, 0.46, 0.6, 8), M.iron, 0, 0.42, 0));
  g.add(mesh(cyl(0.44, 0.4, 0.08, 8), M.brass, 0, 0.76, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.add(mesh(cyl(0.03, 0.03, 0.6, 6), M.brass, Math.cos(a) * 0.43, 0.42, Math.sin(a) * 0.43));
  }
  for (let i = 0; i < 4; i++) {
    const pl = plate('HUB', 0.28, 0.14, 0x3a2208);
    const a = (i / 4) * Math.PI * 2;
    pl.position.set(Math.sin(a) * 0.41, 0.45, Math.cos(a) * 0.41);
    pl.rotation.y = a;
    g.add(pl);
  }
  // armillary rings around the beacon
  const rings = [0.5, 0.42, 0.34].map((r, i) => {
    const ring = mesh(torus(r, 0.018), i === 1 ? M.copper : M.brass);
    const holder = new THREE.Group();
    holder.add(ring);
    holder.position.y = 1.5;
    g.add(holder);
    return holder;
  });
  rings[0].rotation.x = Math.PI / 2;
  g.add(mesh(cyl(0.025, 0.025, 0.7, 8), M.brass, 0, 1.1, 0));
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb030, emissiveIntensity: 0.3 });
  g.add(mesh(sphere(0.06), glow, 0, 0.82, 0));
  let pulse = 0;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.5, 0),
    update(_b, dt, time) {
      rings[0].rotation.z = time * 0.3;
      rings[1].rotation.x = time * 0.5;
      rings[1].rotation.y = 0.6;
      rings[2].rotation.y = time * 0.8;
      rings[2].rotation.x = 1.1;
      pulse = Math.max(0, pulse - dt * 2);
      glow.emissiveIntensity = 0.3 + pulse * 3;
    },
    pulse() {
      pulse = 1;
    },
  };
}

function bench(): Model {
  const g = new THREE.Group();
  for (const [x, z] of [[0.4, 0.4], [0.4, -0.4], [-0.4, 0.4], [-0.4, -0.4]]) g.add(mesh(box(0.08, 0.78, 0.08), M.darkIron, x, 0.39, z));
  g.add(mesh(box(0.86, 0.06, 0.86), M.darkIron, 0, 0.2, 0));
  g.add(mesh(box(1, 0.12, 1), M.wood, 0, 0.84, 0));
  // vice on one edge
  g.add(mesh(box(0.2, 0.12, 0.14), M.iron, 0.36, 0.96, 0.3), mesh(box(0.2, 0.12, 0.04), M.iron, 0.36, 0.96, 0.42));
  const screw = mesh(cyl(0.015, 0.015, 0.22, 8), M.steel, 0.36, 0.96, 0.5);
  screw.rotation.x = Math.PI / 2;
  g.add(screw);
  // a small gear train
  const g1 = mesh(gear(0.13, 10, 0.04), M.brass, -0.2, 1.03, -0.3);
  const g2 = mesh(gear(0.09, 7, 0.04), M.copper, 0.02, 0.99, -0.3);
  g.add(g1, g2);
  const pl = plate('BENCH', 0.5, 0.14);
  pl.position.set(0, 0.84, 0.502);
  g.add(pl);
  const sym = plate('∧ + AB', 0.4, 0.16);
  sym.rotation.x = -Math.PI / 2;
  sym.position.set(-0.12, 0.902, 0.05);
  g.add(sym);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(),
    update(_b, dt) {
      g1.rotation.z += dt * 0.6;
      g2.rotation.z -= dt * 0.6 * (10 / 7);
    },
  };
}

// --- qubit machines ----------------------------------------------------------------------------

/** a colour for a point on the Bloch sphere: hue from its longitude, light at the top and dark at the bottom */
export function blochColour([x, y, z]: number[]) {
  const hue = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
  return new THREE.Color().setHSL(hue, 0.85, 0.42 + 0.22 * z);
}

function gate(): Model {
  const { g, lamp } = chassis('gate');
  // a valve handwheel on a column: it turns through the gate's angle each time it works
  g.add(mesh(cyl(0.05, 0.06, 0.28, 12), M.darkIron, -0.02, 0.8, 0));
  const wheelArm = new THREE.Group();
  const hand = wheel(0.24, 4, M.brass);
  hand.rotation.y = Math.PI / 2; // face the input side
  wheelArm.add(hand);
  wheelArm.position.set(-0.02, 1.02, 0);
  g.add(wheelArm);
  // the gate's letter on a plate the player can read from the input side
  const letter = plate('?', 0.2, 0.2, 0x0a3a50);
  letter.position.set(-0.19, 0.8, 0);
  letter.rotation.y = -Math.PI / 2;
  g.add(letter);
  let shown = '?';
  let turned = 0;
  let wasWorking = false;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.3, 0),
    update(b, dt) {
      const { m, working, progress } = opState(b);
      const label = m?.preset ?? (m?.fixed ? 'B' : m?.b ? 'B' : '?');
      if (label !== shown) {
        shown = label;
        letter.material = plate(label, 0.2, 0.2, 0x0a3a50).material;
      }
      const angle = m?.preset === 'S' ? Math.PI / 2 : Math.PI;
      if (wasWorking && !working) turned += angle;
      wasWorking = working;
      hand.rotation.x = turned + (working ? progress * angle : 0);
      lamp.set(working, dt);
    },
  };
}

function blochProjector(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(cyl(0.3, 0.38, 0.2, 8), M.iron, 0, 0.2, 0));
  port(g, new THREE.Vector3(-1, 0, 0), 0.22, 'A');
  const spout = mesh(cyl(0.08, 0.08, 0.3), M.copper, 0.36, 0.22, 0);
  spout.rotation.z = Math.PI / 2;
  g.add(spout, mesh(cyl(0.04, 0.05, 0.4, 10), M.brass, 0, 0.5, 0));
  // the globe: an equator, two meridians, and an axis from |0⟩ (top) to |1⟩ (bottom)
  const globe = new THREE.Group();
  globe.position.y = 1.0;
  const R = 0.3;
  const equator = mesh(torus(R, 0.012), M.brass);
  equator.rotation.x = Math.PI / 2;
  const m1 = mesh(torus(R, 0.01), M.darkBrass);
  const m2 = mesh(torus(R, 0.01), M.darkBrass);
  m2.rotation.y = Math.PI / 2;
  globe.add(equator, m1, m2, mesh(cyl(0.008, 0.008, R * 2.3, 6), M.steel));
  globe.add(mesh(sphere(0.035), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666 }), 0, R, 0));
  globe.add(mesh(sphere(0.035), M.darkIron, 0, -R, 0));
  const glassBall = mesh(geo('globeGlass', () => new THREE.SphereGeometry(R, 24, 16)), M.glass);
  globe.add(glassBall);
  // the pointer: where the last state pointed
  const pointer = new THREE.Group();
  const pmat = new THREE.MeshStandardMaterial({ color: 0xff6a3c, emissive: 0x802010, roughness: 0.3 });
  pointer.add(mesh(cyl(0.012, 0.012, R * 0.8, 8), pmat, 0, R * 0.4, 0), mesh(geo('pcone', () => new THREE.ConeGeometry(0.035, 0.08, 10)), pmat, 0, R * 0.85, 0));
  globe.add(pointer);
  const pl = plate('BLOCH', 0.34, 0.11);
  pl.position.set(0, 0.22, 0.34);
  g.add(globe, pl);
  const lamp = pilot(MACHINE_LOOK.bloch.colour);
  lamp.lamp.position.set(0.3, 0.1, 0.3);
  g.add(lamp.lamp);
  const target = new THREE.Vector3(0, 1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const current = new THREE.Quaternion();
  return {
    group: g,
    anchors: { ...ANCHORS(), a: new THREE.Vector3(-0.72, 0.3, 0), out: new THREE.Vector3(0.72, 0.3, 0) },
    chimney: new THREE.Vector3(0, 1.35, 0),
    update(b, dt, time) {
      const { m, working } = opState(b);
      if (m?.out) {
        const v = parts(m.out).vector;
        target.copy(toWorld(...v)).normalize();
      }
      // the world turns with the machine; the pointer must show algebra directions, so undo the machine's turn
      const local = target.clone().applyQuaternion(g.quaternion.clone().invert());
      current.slerp(new THREE.Quaternion().setFromUnitVectors(up, local), Math.min(1, dt * 4));
      pointer.quaternion.copy(current);
      globe.rotation.y = 0;
      glassBall.rotation.y = time * 0.2;
      lamp.set(working, dt);
    },
  };
}

function detector(): Model {
  const { g, lamp } = chassis('detector', 'A', false);
  // Stern–Gerlach magnet: a wedge pole above, a trough pole below, the beam passing between
  const north = mesh(geo('wedge', () => new THREE.CylinderGeometry(0.0, 0.16, 0.22, 4, 1)), new THREE.MeshStandardMaterial({ color: 0xb03030, metalness: 0.6, roughness: 0.4 }), 0.02, 1.0, 0);
  north.rotation.z = Math.PI;
  north.rotation.y = Math.PI / 4;
  const south = mesh(box(0.3, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x3050b0, metalness: 0.6, roughness: 0.4 }), 0.02, 0.73, 0);
  g.add(north, south, mesh(box(0.06, 0.48, 0.3), M.darkIron, -0.16, 0.9, 0));
  // a screen with two lamps: up and down
  g.add(mesh(box(0.04, 0.4, 0.3), M.darkBrass, 0.22, 0.88, 0));
  const upMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 });
  const downMat = new THREE.MeshStandardMaterial({ color: 0x9ad0ff, emissive: 0x9ad0ff, emissiveIntensity: 0 });
  g.add(mesh(sphere(0.045), upMat, 0.25, 1.0, 0), mesh(sphere(0.045), downMat, 0.25, 0.76, 0));
  let lastOut = '';
  let flashUp = 0;
  let flashDown = 0;
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0.02, 1.2, 0),
    update(b, dt) {
      const { m, working } = opState(b);
      const outKey = m?.out ? String(m.out) : '';
      if (outKey && outKey !== lastOut) {
        if (outKey === 'e₃') flashUp = 1;
        else flashDown = 1;
      }
      lastOut = outKey;
      flashUp = Math.max(0, flashUp - dt * 1.5);
      flashDown = Math.max(0, flashDown - dt * 1.5);
      upMat.emissiveIntensity = flashUp * 3;
      downMat.emissiveIntensity = flashDown * 3;
      lamp.set(working, dt);
    },
  };
}

function orrery(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(cyl(0.34, 0.4, 0.16, 16), M.iron, 0, 0.18, 0));
  port(g, new THREE.Vector3(-1, 0, 0), 0.2, 'A');
  const spout = mesh(cyl(0.08, 0.08, 0.3), M.copper, 0.36, 0.2, 0);
  spout.rotation.z = Math.PI / 2;
  g.add(spout);
  // a tripod holding a brass ring, under which the fibers turn
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(cyl(0.015, 0.02, 0.9, 6), M.brass, Math.cos(a) * 0.28, 0.7, Math.sin(a) * 0.28);
    leg.rotation.z = Math.cos(a) * 0.12;
    leg.rotation.x = -Math.sin(a) * 0.12;
    g.add(leg);
  }
  const crown = mesh(torus(0.3, 0.02), M.brass, 0, 1.16, 0);
  crown.rotation.x = Math.PI / 2;
  g.add(crown, mesh(cyl(0.02, 0.02, 0.5, 8), M.steel, 0, 0.5, 0));
  const pl = plate('HOPF', 0.3, 0.1);
  pl.position.set(0, 0.2, 0.37);
  g.add(pl);
  const fibers = new THREE.Group();
  fibers.position.y = 1.75;
  g.add(fibers);
  let key = '';
  const build = (seen: Multivector[]) => {
    fibers.children.forEach((c) => (c as THREE.Mesh).geometry?.dispose());
    fibers.clear();
    const loops = seen.map((r) => ({ r, pts: fiber(r, 120) }));
    const maxR = Math.max(0.5, ...loops.flatMap((l) => l.pts.map((p) => Math.hypot(...p))));
    const scale = Math.min(0.45, 0.85 / maxR);
    for (const { r, pts } of loops) {
      const v = parts(bloch(r) ?? E3).vector;
      const colour = blochColour(v);
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => toWorld(...p).multiplyScalar(scale)), true);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.018, 6, true), new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.4 }));
      const bead = mesh(sphere(0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: colour, emissiveIntensity: 0.8 }));
      bead.position.copy(toWorld(...project(toQuat(r))).multiplyScalar(scale));
      fibers.add(tube, bead);
    }
  };
  return {
    group: g,
    anchors: { ...ANCHORS(), a: new THREE.Vector3(-0.72, 0.3, 0), out: new THREE.Vector3(0.72, 0.3, 0) },
    chimney: new THREE.Vector3(0, 1.2, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'orrery' ? b : null;
      const k = m ? m.seen.map((s) => s.key()).join('|') : '';
      if (m && k !== key) {
        key = k;
        build(m.seen);
      }
      fibers.rotation.y += dt * 0.25;
    },
  };
}

export function buildModel(kind: MachineType | 'hub' | 'bench'): Model {
  switch (kind) {
    case 'adder':
      return adder();
    case 'wedger':
      return wedger();
    case 'multiplier':
      return multiplier();
    case 'sandwich':
      return sandwich();
    case 'extractor':
      return extractor();
    case 'duct':
      return duct();
    case 'collector':
      return collector();
    case 'hub':
      return hub();
    case 'bench':
      return bench();
    case 'gate':
      return gate();
    case 'bloch':
      return blochProjector();
    case 'detector':
      return detector();
    case 'orrery':
      return orrery();
  }
}

// --- steam -------------------------------------------------------------------------------------

const puffTexture = (() => {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(230,236,240,0.4)');
  grad.addColorStop(1, 'rgba(230,236,240,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();

/** puffs of steam: a small pool of sprites that rise, grow and fade */
export class Steam {
  private sprites: { s: THREE.Sprite; age: number; life: number; v: THREE.Vector3 }[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  puff(at: THREE.Vector3, n = 5) {
    for (let i = 0; i < n; i++) {
      let p = this.sprites.find((x) => x.age >= x.life);
      if (!p) {
        if (this.sprites.length > 120) return;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false }));
        this.group.add(s);
        p = { s, age: 0, life: 1, v: new THREE.Vector3() };
        this.sprites.push(p);
      }
      p.age = 0;
      p.life = 0.9 + Math.random() * 0.6;
      p.s.position.copy(at);
      p.v.set((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
      p.s.visible = true;
    }
  }

  update(dt: number) {
    for (const p of this.sprites) {
      if (p.age >= p.life) {
        p.s.visible = false;
        continue;
      }
      p.age += dt;
      const k = p.age / p.life;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(0.15 + k * 0.5);
      p.s.material.opacity = 0.7 * (1 - k);
    }
  }
}
