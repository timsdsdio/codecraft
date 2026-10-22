// The machines as small steampunk contraptions built from primitives: riveted iron, brass and
// copper, with brass plates naming each part. Every model sits on the block's floor, faces local +x
// (its output), and animates from the state the factory leaves in its block:
//   generator        a pump with its sample in a glass jar: its rod strokes and flywheel turns once per blade made
//   duct             a conveyor belt whose surface runs the way it carries, bent round where fed from a side
//   splitter         a pointer that turns to the side the next element goes out of
//   merger           a hopper with a pointer that turns to the input whose turn it is
//   sorter           a glass jar holding its sample, and a flap that swings toward a match's side
//   crossing         two belts crossing under a brass turntable plate
//   charge           a brass ball on an insulator that glows red when positive and blue when negative
//   wire             a copper rod up out of the field, beads of light running along it with the current
//   antenna          a coil and mast whose beads rock up and down with the current, sparking at the top
//   probe            a glass bulb that flashes with each reading, and a gauge showing how strong it is
//   packer           a crate with a hopper whose lid drops each time it packs
//   unpacker         a crate with a comb wheel that turns as it deals out blades
//   mill             an iron cabinet with four card slots on top, its cards standing in them, and a
//                    grid of lamps on its side lighting one per pair of blades as it works
//   card press       a frame with a ram over a bed; the ram hovers low when there is something to press
//   detector         a Stern–Gerlach magnet whose up or down lamp flashes with each measurement
//   orrery           a brass tripod with the Hopf fibers of the states it has seen turning above it
//   store            a banded tank with a gauge window showing how full it is
//   workbench        a wooden bench with a vice and a gear train
import * as THREE from 'three';
import type { Multivector } from '@codecraft/ga';
import { DUCT_SPEED, GENERATE_EVERY, LAMP_TIME, MERGE_ORDER, PACK_TIME, SPLIT_ORDER, WORK_TIME, sortMatches } from './factory';
import { valueOf, type MachineType } from './items';
import { MACHINE_LOOK, hex } from './looks';
import { E3, bloch, fiber, project, toQuat } from './qubit';
import { FREQUENCIES, scalarPart, upPart } from './field';
import { STORE_SLOTS, type Block } from './world';
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
  anchors: Record<string, THREE.Vector3>;
  /** where steam comes out, in the model's frame */
  chimney: THREE.Vector3;
  update(b: Block | undefined, dt: number, time: number): void;
}

const ANCHORS = () => ({
  a: new THREE.Vector3(-0.72, 0.42, 0),
  b: new THREE.Vector3(0, 0.42, 0.72),
  out: new THREE.Vector3(0.72, 0.42, 0),
});

/** the iron cabinet the Mill and the detector are built on */
function chassis(type: MachineType, sides: string) {
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
  const lamp = pilot(MACHINE_LOOK[type].colour);
  lamp.lamp.position.set(-0.32, 0.66, 0.32);
  g.add(lamp.lamp);
  return { g, lamp };
}

function generator(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  // a glass jar at the back holding the sample it copies
  g.add(mesh(cyl(0.13, 0.13, 0.03, 20), M.darkBrass, -0.33, 0.115, 0));
  g.add(mesh(geo('jar', () => new THREE.CylinderGeometry(0.13, 0.13, 0.3, 20, 1, true)), M.glass, -0.33, 0.28, 0));
  g.add(mesh(cyl(0.13, 0.13, 0.04, 20), M.brass, -0.33, 0.45, 0));
  const feed = mesh(cyl(0.035, 0.035, 0.2, 8), M.copper, -0.2, 0.42, 0);
  feed.rotation.z = Math.PI / 2;
  g.add(feed);
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
  // seated half its length into the housing, so its foot stays hidden at the top of the stroke
  const ROD_BASE = 0.47;
  rod.position.set(0, ROD_BASE, 0);
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
  const pl = plate('GENERATE', 0.42, 0.12);
  pl.position.set(0, 0.32, -0.31);
  pl.rotation.y = Math.PI;
  g.add(pl);
  const lamp = pilot(MACHINE_LOOK.generator.colour);
  lamp.lamp.position.set(0.3, 0.1, 0.34);
  g.add(lamp.lamp);
  return {
    group: g,
    anchors: { ...ANCHORS(), out: new THREE.Vector3(0.72, 0.36, 0), sample: new THREE.Vector3(-0.33, 0.28, 0) },
    chimney: new THREE.Vector3(-0.2, 1.08, -0.2),
    update(b, dt, time) {
      const m = b?.kind === 'machine' && b.type === 'generator' ? b : null;
      const phase = m ? m.timer / GENERATE_EVERY : 0;
      const running = !!m && m.timer > 0;
      rod.position.y = ROD_BASE + (running ? 0.1 * (1 - Math.cos(phase * Math.PI * 2)) : 0);
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

/**
 * A point on a corner belt, in its frame: `r` from the corner it turns about, at angle `a` from 0 where
 * it comes in to π/2 at its front. `zs` is −1 for a belt fed from its left, 1 from its right.
 */
export function curvePoint(zs: number, r: number, a: number): [number, number] {
  return [0.5 - r * Math.cos(a), zs * (0.5 - r * Math.sin(a))];
}

/** the belt surface of a corner: a quarter ring whose texture runs along the arc at the same pace as a straight belt */
function cornerBeltGeometry(zs: number) {
  return geo(`corner${zs}`, () => {
    const N = 20;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * (Math.PI / 2);
      for (const [k, r] of [[0, 0.25], [1, 0.75]]) {
        const [x, z] = curvePoint(zs, r, a);
        pos.push(x, 0.315, z);
        // the middle of the belt is π/4 long, so this spacing matches the straight belt's texture
        uv.push((i / N) * (Math.PI / 4), k);
      }
    }
    for (let i = 0; i < N; i++) {
      const [a0, b0, a1, b1] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
      // wind each triangle so it faces up, whichever way the corner turns
      if (zs < 0) idx.push(a0, b0, a1, b0, b1, a1);
      else idx.push(a0, a1, b0, b0, a1, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** a belt that comes in from its left (zs −1) or right (zs 1) and bends round to leave by its front */
function cornerDuct(zs: number): Model {
  const g = new THREE.Group();
  g.add(mesh(cornerBeltGeometry(zs), beltMat));
  // rails: quarter rings about the corner, turned to sweep from the side in to the front
  for (const r of [0.22, 0.78]) {
    const rail = new THREE.Group();
    const ring = mesh(geo(`rail${r}`, () => new THREE.TorusGeometry(r, 0.03, 6, 24, Math.PI / 2)), M.iron);
    ring.rotation.x = Math.PI / 2;
    rail.add(ring);
    rail.position.set(0.5, 0.29, zs * 0.5);
    rail.rotation.y = zs < 0 ? -Math.PI / 2 : Math.PI;
    g.add(rail);
    for (const a of [0.15, Math.PI / 2 - 0.15]) {
      const [x, z] = curvePoint(zs, r, a);
      g.add(mesh(box(0.05, 0.25, 0.05), M.darkIron, x, 0.12, z));
    }
  }
  const entry = mesh(cyl(0.05, 0.05, 0.54, 12), M.steel, 0, 0.29, zs * 0.47);
  entry.rotation.z = Math.PI / 2;
  const exit = mesh(cyl(0.05, 0.05, 0.54, 12), M.steel, 0.47, 0.29, 0);
  exit.rotation.x = Math.PI / 2;
  g.add(entry, exit);
  return { group: g, anchors: ANCHORS(), chimney: new THREE.Vector3(), update() {} };
}

// --- logistics ---------------------------------------------------------------------------------

/** a belt `len` long whose texture keeps the straight belt's scale */
function beltPiece(len: number) {
  return geo(`beltPiece${len}`, () => {
    const g = new THREE.BoxGeometry(len, 0.03, 0.5);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    return g;
  });
}

/** a short run of belt through side r (0 front, 1 left, 2 back, 3 right), running in or out */
function stub(g: THREE.Group, r: number, inward: boolean) {
  const s = new THREE.Group();
  const belt = mesh(beltPiece(0.24), beltMat, 0.38, 0.3, 0);
  if (inward) belt.rotation.y = Math.PI;
  s.add(belt);
  for (const z of [-0.27, 0.27]) s.add(mesh(box(0.24, 0.1, 0.05), M.iron, 0.38, 0.27, z));
  s.add(mesh(box(0.05, 0.25, 0.05), M.darkIron, 0.45, 0.12, 0.27), mesh(box(0.05, 0.25, 0.05), M.darkIron, 0.45, 0.12, -0.27));
  s.rotation.y = (r * Math.PI) / 2;
  g.add(s);
}

/** the low iron box the splitter, merger and sorter are built on, with belts through the given sides */
function crate(type: MachineType, ins: number[], outs: number[]) {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(box(0.54, 0.36, 0.54), M.iron, 0, 0.28, 0));
  g.add(mesh(box(0.6, 0.05, 0.6), M.brass, 0, 0.485, 0));
  for (const [x, z] of [[0.28, 0.28], [0.28, -0.28], [-0.28, 0.28], [-0.28, -0.28]]) g.add(mesh(cyl(0.035, 0.035, 0.42, 8), M.brass, x, 0.3, z));
  rivets(g, 0.515, 0.26, 2);
  for (const r of ins) stub(g, r, true);
  for (const r of outs) stub(g, r, false);
  const sym = plate(MACHINE_LOOK[type].symbol, 0.24, 0.1);
  sym.rotation.x = -Math.PI / 2;
  sym.rotation.z = -Math.PI / 2;
  sym.position.set(-0.2, 0.511, 0);
  g.add(sym);
  return g;
}

/** a brass pointer on a spindle that turns to face one side, standing on a gear */
function pointer(g: THREE.Group, y: number, length: number) {
  const arm = new THREE.Group();
  arm.add(mesh(box(length, 0.04, 0.05), M.brass, length / 2, 0, 0));
  const tip = mesh(geo('pointerTip', () => new THREE.ConeGeometry(0.045, 0.1, 10)), M.copper, length + 0.04, 0, 0);
  tip.rotation.z = -Math.PI / 2;
  arm.add(tip, mesh(cyl(0.04, 0.04, 0.06, 12), M.darkBrass));
  const cog = mesh(gear(0.11, 10, 0.03), M.darkBrass, 0, -0.05, 0);
  cog.rotation.x = Math.PI / 2;
  arm.add(cog);
  arm.position.set(0.04, y, 0);
  g.add(arm, mesh(cyl(0.02, 0.02, y - 0.5, 8), M.steel, 0.04, (y + 0.5) / 2, 0));
  // turn the short way round toward side r (0 front, 1 left, 2 back, 3 right)
  let angle = 0;
  return (r: number, dt: number) => {
    const target = (r * Math.PI) / 2;
    const d = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    angle += d * Math.min(1, dt * 10);
    arm.rotation.y = angle;
  };
}

/** a point beside side r of a block, `d` out from its middle, at height y */
const sideAnchor = (r: number, d: number, y: number) => new THREE.Vector3(Math.cos((r * Math.PI) / 2) * d, y, -Math.sin((r * Math.PI) / 2) * d);

const logisticAnchors = (y: number) => ({ ...ANCHORS(), ...Object.fromEntries([0, 1, 2, 3].map((r) => [`s${r}`, sideAnchor(r, 0.3, y)])) });

function splitter(): Model {
  const g = crate('splitter', [2], [0, 1, 3]);
  const turn = pointer(g, 0.62, 0.18);
  return {
    group: g,
    anchors: { ...logisticAnchors(0.62), item: new THREE.Vector3(0.04, 0.86, 0) },
    chimney: new THREE.Vector3(0, 0.8, 0),
    update(b, dt) {
      // the pointer shows where the next element goes
      if (b?.kind === 'machine' && b.type === 'splitter') turn(SPLIT_ORDER[b.next], dt);
    },
  };
}

function merger(): Model {
  const g = crate('merger', [1, 2, 3], [0]);
  // a copper hopper the inputs tip into
  const rim = mesh(torus(0.2, 0.018), M.brass, 0.04, 0.72, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(mesh(cyl(0.2, 0.08, 0.2, 20, true), M.copper, 0.04, 0.62, 0), rim);
  const turn = pointer(g, 0.78, 0.2);
  return {
    group: g,
    anchors: logisticAnchors(0.66),
    chimney: new THREE.Vector3(0, 0.9, 0),
    update(b, dt) {
      // the pointer shows whose turn it is
      if (b?.kind === 'machine' && b.type === 'merger') turn(MERGE_ORDER[b.next], dt);
    },
  };
}

function sorter(): Model {
  const g = crate('sorter', [2], [0, 1, 3]);
  // a glass jar holding the sample, so you can see what it sorts by
  g.add(mesh(cyl(0.15, 0.15, 0.03, 20), M.darkBrass, 0.04, 0.525, 0));
  g.add(mesh(geo('jar', () => new THREE.CylinderGeometry(0.13, 0.13, 0.3, 20, 1, true)), M.glass, 0.04, 0.69, 0));
  g.add(mesh(cyl(0.15, 0.15, 0.04, 20), M.brass, 0.04, 0.86, 0), mesh(sphere(0.03), M.brass, 0.04, 0.9, 0));
  // a lamp on each side; the lit one is where matches go
  const lamps = { 1: pilot(MACHINE_LOOK.sorter.colour), 3: pilot(MACHINE_LOOK.sorter.colour) };
  lamps[1].lamp.position.set(0.24, 0.51, -0.24);
  lamps[3].lamp.position.set(0.24, 0.51, 0.24);
  g.add(lamps[1].lamp, lamps[3].lamp);
  // a flap in front of the jar that swings toward where the element in hand will go
  const flap = new THREE.Group();
  flap.add(mesh(box(0.16, 0.12, 0.02), M.brass, 0.08, 0, 0));
  flap.position.set(0.2, 0.6, 0);
  g.add(flap, mesh(cyl(0.012, 0.012, 0.14, 6), M.steel, 0.2, 0.58, 0));
  let angle = 0;
  return {
    group: g,
    anchors: { ...logisticAnchors(0.62), filter: new THREE.Vector3(0.04, 0.69, 0), item: new THREE.Vector3(0.3, 0.8, 0) },
    chimney: new THREE.Vector3(0, 1, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'sorter' ? b : null;
      const toSide = !!m?.item && sortMatches(m.mode, m.filter, m.item);
      const target = toSide ? (m!.side === 1 ? 1 : -1) * (Math.PI / 2.5) : 0;
      angle += (target - angle) * Math.min(1, dt * 10);
      flap.rotation.y = angle;
      lamps[1].set(m?.side === 1, dt);
      lamps[3].set(m?.side === 3, dt);
    },
  };
}

function crossing(): Model {
  const g = new THREE.Group();
  for (const [x, z] of [[0.36, 0.36], [0.36, -0.36], [-0.36, 0.36], [-0.36, -0.36]]) {
    g.add(mesh(box(0.06, 0.28, 0.06), M.darkIron, x, 0.14, z));
    g.add(mesh(box(0.28, 0.08, 0.05), M.iron, x, 0.27, z > 0 ? 0.27 : -0.27), mesh(box(0.05, 0.08, 0.28), M.iron, x > 0 ? 0.27 : -0.27, 0.27, z));
  }
  g.add(mesh(box(1, 0.03, 0.5), beltMat, 0, 0.3, 0));
  const across = mesh(box(1, 0.03, 0.5), beltMat, 0, 0.305, 0);
  across.rotation.y = Math.PI / 2;
  g.add(across);
  // a brass turntable plate where the two belts meet
  g.add(mesh(cyl(0.2, 0.2, 0.02, 24), M.brass, 0, 0.325, 0));
  rivets(g, 0.335, 0.12, 1);
  return { group: g, anchors: logisticAnchors(0.5), chimney: new THREE.Vector3(), update() {} };
}

function store(): Model {
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
    // what its first slot holds floats above the lid
    anchors: { ...ANCHORS(), show0: new THREE.Vector3(0, 1.6, 0) },
    chimney: new THREE.Vector3(0, 1.05, 0),
    update(b) {
      const m = b?.kind === 'machine' && b.type === 'store' ? b : null;
      const fill = m ? m.slots.filter(Boolean).length / STORE_SLOTS : 0;
      level.scale.y = Math.max(0.001, fill * 0.5);
      level.position.y = 0.21 + fill * 0.25;
    },
  };
}

function workbench(): Model {
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
  const pl = plate('WORKBENCH', 0.5, 0.14);
  pl.position.set(0, 0.84, 0.502);
  g.add(pl);
  const sym = plate('∧  ⌋  ×', 0.4, 0.16);
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

// --- the Mill, the Card Press and packing ------------------------------------------------------

/** a brass card standing in a slot, punched in the grade-card layout */
function standingCard() {
  const c = new THREE.Group();
  c.add(mesh(box(0.02, 0.2, 0.16), M.brass, 0, 0.1, 0));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) c.add(mesh(box(0.022, 0.018, 0.018), M.darkIron, 0, 0.16 - j * 0.07, -0.055 + i * 0.037));
  return c;
}

function mill(): Model {
  const { g, lamp } = chassis('mill', 'LIVE');
  // four card slots on top: deck one nearer the input, deck two nearer the output
  const slots = [
    [-0.12, -0.16],
    [-0.12, 0.16],
    [0.16, -0.16],
    [0.16, 0.16],
  ];
  const cards = slots.map(([x, z]) => {
    g.add(mesh(box(0.06, 0.03, 0.22), M.darkIron, x, 0.675, z));
    const c = standingCard();
    c.position.set(x, 0.69, z);
    g.add(c);
    return c;
  });
  const deck = plate('1      2', 0.4, 0.08);
  deck.rotation.x = -Math.PI / 2;
  deck.rotation.z = -Math.PI / 2;
  deck.position.set(0.02, 0.664, 0);
  g.add(deck);
  // a grid of lamps on the side: one lights per pair of blades multiplied out
  const lampMat = Array.from({ length: 9 }, () => new THREE.MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb020, emissiveIntensity: 0 }));
  const face = new THREE.Group();
  face.add(mesh(box(0.3, 0.3, 0.02), M.darkBrass, 0, 0, 0));
  lampMat.forEach((mat, i) => face.add(mesh(sphere(0.028), mat, -0.09 + (i % 3) * 0.09, 0.09 - Math.floor(i / 3) * 0.09, 0.02)));
  face.position.set(0.02, 0.36, 0.415);
  g.add(face);
  const lever = new THREE.Group();
  lever.add(mesh(cyl(0.012, 0.012, 0.22, 6), M.steel, 0, 0.11, 0), mesh(sphere(0.03), M.brass, 0, 0.22, 0));
  lever.position.set(-0.32, 0.66, -0.3);
  g.add(lever);
  return {
    group: g,
    anchors: { ...ANCHORS(), side: new THREE.Vector3(0, 0.42, 0.72) },
    chimney: new THREE.Vector3(0, 1.0, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'mill' ? b : null;
      cards.forEach((c, i) => (c.visible = m?.cards[i]?.item.kind === 'card'));
      lever.rotation.z = m?.live ? 0.6 : -0.6;
      const working = !!m?.x && (!m.live || !!m.side) && !m.out;
      const total = Math.min(9, m?.lamps ?? 0);
      const lit = working && m!.lamps ? Math.min(total, Math.floor((m!.work / (m!.lamps * LAMP_TIME)) * total) + 1) : 0;
      lampMat.forEach((mat, i) => (mat.emissiveIntensity = i < lit ? 2.2 : i < total ? 0.15 : 0));
      lamp.set(working, dt);
    },
  };
}

function press(): Model {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.1, 1), M.darkIron, 0, 0.05, 0));
  g.add(mesh(box(0.7, 0.16, 0.6), M.iron, 0, 0.18, 0));
  // the bed, where the multivector lies in its grade card
  g.add(mesh(box(0.44, 0.03, 0.26), M.brass, 0, 0.275, 0));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.add(mesh(box(0.08, 0.008, 0.08), M.darkBrass, -0.15 + i * 0.1, 0.294, -0.05 + j * 0.1));
  for (const z of [-0.26, 0.26]) g.add(mesh(box(0.08, 0.9, 0.08), M.darkIron, 0, 0.71, z));
  g.add(mesh(box(0.16, 0.1, 0.66), M.darkIron, 0, 1.18, 0));
  const ram = new THREE.Group();
  ram.add(mesh(cyl(0.04, 0.04, 0.3, 10), M.steel, 0, 0.15, 0), mesh(box(0.46, 0.08, 0.24), M.brass, 0, 0, 0));
  ram.position.set(0, 0.8, 0);
  g.add(ram);
  const pl = plate('PRESS', 0.3, 0.1);
  pl.position.set(0, 0.18, 0.301);
  g.add(pl);
  const verb = plate('VERB', 0.2, 0.08, 0x0a3a50);
  verb.position.set(0, 0.96, 0.31);
  g.add(verb);
  let shown = '';
  return {
    group: g,
    anchors: { ...ANCHORS(), bed: new THREE.Vector3(0, 0.55, 0) },
    chimney: new THREE.Vector3(0, 1.3, 0),
    update(b, dt, time) {
      const m = b?.kind === 'machine' && b.type === 'press' ? b : null;
      const label = m?.plate?.item.kind === 'plate' ? m.plate.item.verb.toUpperCase() : '—';
      if (label !== shown) {
        shown = label;
        verb.material = plate(label, 0.2, 0.08, 0x0a3a50).material;
      }
      // ready to press: the ram hovers low and trembles
      const ready = !!m?.plate && !!m.blank;
      const target = ready ? 0.42 + Math.sin(time * 8) * 0.01 : 0.8;
      ram.position.y += (target - ram.position.y) * Math.min(1, dt * 6);
    },
  };
}

function packer(): Model {
  const g = crate('packer', [1, 2, 3], [0]);
  const hopper = mesh(cyl(0.2, 0.09, 0.22, 20, true), M.copper, 0.04, 0.62, 0);
  const lid = mesh(cyl(0.21, 0.21, 0.03, 20), M.brass, 0.04, 0.75, 0);
  const sign = plate('+', 0.12, 0.12);
  sign.position.set(0.04, 0.62, 0.21);
  g.add(hopper, lid, sign);
  let wasFull = false;
  let drop = 0;
  return {
    group: g,
    anchors: logisticAnchors(0.66),
    chimney: new THREE.Vector3(0, 0.9, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'packer' ? b : null;
      const full = !!m?.out;
      if (full && !wasFull) drop = 1;
      wasFull = full;
      drop = Math.max(0, drop - dt / PACK_TIME);
      lid.position.y = 0.75 - Math.sin(drop * Math.PI) * 0.1;
    },
  };
}

function unpacker(): Model {
  const g = crate('unpacker', [2], [0]);
  const comb = new THREE.Group();
  const wheel = mesh(gear(0.16, 8, 0.04), M.brass);
  comb.add(wheel);
  comb.position.set(0.04, 0.72, 0);
  g.add(comb, mesh(box(0.04, 0.2, 0.04), M.darkIron, 0.04, 0.6, 0));
  return {
    group: g,
    anchors: { ...logisticAnchors(0.66), item: new THREE.Vector3(-0.3, 0.7, 0) },
    chimney: new THREE.Vector3(0, 0.9, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'unpacker' ? b : null;
      if (m?.queue.length) wheel.rotation.z -= dt * 3;
    },
  };
}

// --- qubit machines ----------------------------------------------------------------------------

/** a colour for a point on the Bloch sphere: hue from its longitude, light at the top and dark at the bottom */
export function blochColour([x, y, z]: number[]) {
  const hue = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
  return new THREE.Color().setHSL(hue, 0.85, 0.42 + 0.22 * z);
}

function detector(): Model {
  const { g, lamp } = chassis('detector', 'A');
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
      const m = b?.kind === 'machine' && b.type === 'detector' ? b : null;
      const working = !!m?.a && !m.out;
      const outKey = m?.out ? String(valueOf(m.out)) : '';
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

// --- the field ---------------------------------------------------------------------------------

const ceramic = new THREE.MeshStandardMaterial({ color: 0xece4d4, metalness: 0, roughness: 0.25 });

/** a stack of ceramic insulator discs from y0 up to y1 */
function insulator(g: THREE.Group, x: number, z: number, y0: number, y1: number, r = 0.09) {
  g.add(mesh(cyl(r * 0.45, r * 0.45, y1 - y0, 10), ceramic, x, (y0 + y1) / 2, z));
  for (let y = y0 + 0.04; y < y1; y += 0.07) g.add(mesh(cyl(r, r, 0.025, 14), ceramic, x, y, z));
}

/** the iron foot every field machine stands on, with a plate naming it */
function fieldBase(type: MachineType, label: string) {
  const g = new THREE.Group();
  g.add(mesh(box(1, 0.125, 1), M.darkIron, 0, 0.0625, 0), mesh(box(0.5, 0.08, 0.5), M.iron, 0, 0.165, 0));
  rivets(g, 0.21, 0.22, 2);
  const pl = plate(label, 0.3, 0.1, 0x2a1a08);
  pl.position.set(0, 0.165, 0.251);
  g.add(pl);
  const lamp = pilot(MACHINE_LOOK[type].colour);
  lamp.lamp.position.set(-0.32, 0.125, 0.32);
  g.add(lamp.lamp);
  return { g, lamp };
}

/** beads of light running along a vertical rod, showing a current: up for positive, down for negative */
function currentBeads(g: THREE.Group, y0: number, y1: number, colour: number) {
  const mat = new THREE.MeshBasicMaterial({ color: colour });
  const beads = Array.from({ length: 5 }, () => mesh(sphere(0.035), mat));
  g.add(...beads);
  let travel = 0;
  return (speed: number, dt: number) => {
    travel += speed * dt;
    beads.forEach((b, i) => {
      const t = (((travel + i / beads.length) % 1) + 1) % 1;
      b.position.set(0, y0 + t * (y1 - y0), 0);
      b.visible = Math.abs(speed) > 0.01;
    });
  };
}

function charge(): Model {
  const { g, lamp } = fieldBase('charge', 'CHARGE');
  insulator(g, 0, 0, 0.2, 0.62);
  // a brass ball that glows red when positive and blue when negative
  const glow = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.25, emissive: 0x000000 });
  const band = mesh(torus(0.2, 0.015), M.darkBrass, 0, 0.8, 0);
  band.rotation.x = Math.PI / 2;
  g.add(mesh(sphere(0.2), glow, 0, 0.8, 0), band);
  const red = new THREE.Color(0xff3020);
  const blue = new THREE.Color(0x2060ff);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.1, 0),
    update(b, dt, time) {
      const q = b?.kind === 'machine' && b.type === 'charge' ? scalarPart(b.slot) : 0;
      glow.emissive.copy(q >= 0 ? red : blue);
      glow.emissiveIntensity = Math.min(1.5, Math.abs(q) * 0.6) * (0.85 + 0.15 * Math.sin(time * 3));
      lamp.set(q !== 0, dt);
    },
  };
}

function wire(): Model {
  const { g, lamp } = fieldBase('wire', 'WIRE');
  // a copper rod running up out of the field, held by insulators top and bottom
  g.add(mesh(cyl(0.035, 0.035, 1.5, 10), M.copper, 0, 0.95, 0));
  insulator(g, 0, 0, 0.2, 0.4, 0.08);
  g.add(mesh(box(0.06, 0.06, 0.4), M.darkIron, 0, 1.55, 0.2), mesh(box(0.06, 1.5, 0.06), M.darkIron, 0, 0.95, 0.4));
  const top = mesh(cyl(0.06, 0.06, 0.06, 12), ceramic, 0, 1.55, 0);
  g.add(top);
  const beads = currentBeads(g, 0.25, 1.65, 0xffd080);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.7, 0),
    update(b, dt) {
      const i = b?.kind === 'machine' && b.type === 'wire' ? upPart(b.slot) : 0;
      beads(i * 0.8, dt);
      lamp.set(i !== 0, dt);
    },
  };
}

function antenna(): Model {
  const { g, lamp } = fieldBase('antenna', 'ANTENNA');
  // a coil at the foot drives a mast with a crossbar and a spark ball at the top
  for (let k = 0; k < 5; k++) {
    const turn = mesh(torus(0.11, 0.018), M.copper, 0, 0.25 + k * 0.045, 0);
    turn.rotation.x = Math.PI / 2;
    g.add(turn);
  }
  g.add(mesh(cyl(0.08, 0.08, 0.24, 12), M.darkIron, 0, 0.33, 0));
  g.add(mesh(cyl(0.025, 0.03, 1.25, 8), M.iron, 0, 1.07, 0));
  const bar = mesh(cyl(0.015, 0.015, 0.6, 6), M.brass, 0, 1.6, 0);
  bar.rotation.x = Math.PI / 2;
  g.add(bar, mesh(sphere(0.045), M.brass, 0, 1.6, 0.3), mesh(sphere(0.045), M.brass, 0, 1.6, -0.3));
  const spark = new THREE.MeshStandardMaterial({ color: 0xeeddff, emissive: 0xb080ff, emissiveIntensity: 0 });
  g.add(mesh(sphere(0.06), spark, 0, 1.72, 0));
  const beads = currentBeads(g, 0.45, 1.6, 0xd7a6ff);
  return {
    group: g,
    anchors: ANCHORS(),
    chimney: new THREE.Vector3(0, 1.8, 0),
    update(b, dt, time) {
      const m = b?.kind === 'machine' && b.type === 'antenna' ? b : null;
      const amp = m ? upPart(m.slot) : 0;
      const swing = m ? Math.cos(2 * Math.PI * FREQUENCIES[m.frequency] * time) : 0;
      // the beads rock up and down with the current
      beads(amp * swing * 1.2, dt);
      spark.emissiveIntensity = Math.abs(amp) * Math.abs(swing) * 2;
      lamp.set(amp !== 0, dt);
    },
  };
}

function probe(): Model {
  const { g, lamp } = fieldBase('probe', 'PROBE');
  // a glass bulb at the field's height, a gauge whose needle shows how strong the reading is, and an output spout
  g.add(mesh(cyl(0.04, 0.05, 0.3, 10), M.brass, 0, 0.35, 0));
  g.add(mesh(geo('bulb', () => new THREE.SphereGeometry(0.13, 16, 12)), M.glass, 0, 0.6, 0));
  const filament = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7dff6a, emissiveIntensity: 0 });
  const collar = mesh(torus(0.13, 0.012), M.brass, 0, 0.6, 0);
  collar.rotation.x = Math.PI / 2;
  g.add(mesh(sphere(0.04), filament, 0, 0.6, 0), collar);
  const gauge = new THREE.Group();
  const face = mesh(cyl(0.1, 0.1, 0.02, 20), M.gaugeFace);
  face.rotation.x = Math.PI / 2;
  const needle = mesh(box(0.012, 0.085, 0.006), M.needle, 0, 0.035, 0.012);
  const pivot = new THREE.Group();
  pivot.add(needle);
  gauge.add(face, mesh(torus(0.1, 0.014), M.brass), pivot);
  gauge.position.set(-0.22, 0.42, 0);
  gauge.rotation.y = -Math.PI / 2;
  g.add(gauge, mesh(box(0.04, 0.2, 0.04), M.darkIron, -0.22, 0.27, 0));
  const spout = mesh(cyl(0.07, 0.07, 0.26), M.copper, 0.33, 0.28, 0);
  spout.rotation.z = Math.PI / 2;
  const flange = mesh(torus(0.08, 0.025), M.brass, 0.46, 0.28, 0);
  flange.rotation.y = Math.PI / 2;
  g.add(spout, flange);
  let angle = 0;
  let flash = 0;
  let last: Multivector | null = null;
  return {
    group: g,
    anchors: { ...ANCHORS(), out: new THREE.Vector3(0.72, 0.3, 0), reading: new THREE.Vector3(0, 1.15, 0) },
    chimney: new THREE.Vector3(0, 0.9, 0),
    update(b, dt) {
      const m = b?.kind === 'machine' && b.type === 'probe' ? b : null;
      const r = m?.reading ?? null;
      if (r && r !== last) flash = 1;
      last = r;
      // the needle swings further for a bigger reading, out to three quarters of the dial
      const size = r ? Math.sqrt([...r.terms.values()].reduce((n, c) => n + (c.n / c.d) ** 2, 0)) : 0;
      angle += ((size / (size + 1)) * 4 - angle) * Math.min(1, dt * 6);
      pivot.rotation.z = 2 - angle;
      flash = Math.max(0, flash - dt * 2);
      filament.emissiveIntensity = 0.3 + flash * 2;
      lamp.set(!!r && !r.isZero(), dt);
    },
  };
}

/** what a block is drawn as: a duct fed only from one side is drawn as a corner */
export type ModelKind = MachineType | 'workbench' | 'duct-left' | 'duct-right';

export function buildModel(kind: ModelKind): Model {
  switch (kind) {
    case 'duct-left':
      return cornerDuct(-1);
    case 'duct-right':
      return cornerDuct(1);
    case 'splitter':
      return splitter();
    case 'merger':
      return merger();
    case 'sorter':
      return sorter();
    case 'crossing':
      return crossing();
    case 'charge':
      return charge();
    case 'wire':
      return wire();
    case 'antenna':
      return antenna();
    case 'probe':
      return probe();
    case 'plate':
      // plates are drawn all together (fieldview.ts)
      return { group: new THREE.Group(), anchors: ANCHORS(), chimney: new THREE.Vector3(), update() {} };
    case 'generator':
      return generator();
    case 'duct':
      return duct();
    case 'store':
      return store();
    case 'packer':
      return packer();
    case 'unpacker':
      return unpacker();
    case 'mill':
      return mill();
    case 'press':
      return press();
    case 'workbench':
      return workbench();
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
