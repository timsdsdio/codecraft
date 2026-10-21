// Draws the world. Static blocks (lattice, deposits, the bench) go into one merged mesh of their
// visible faces, rebuilt whenever blocks change. Machines, ducts and the hub are their own objects,
// with faces that say what they are: a symbol on top, OUT on the output side, A and B on the inputs.
// Elements riding ducts and waiting in machines are drawn as their glyphs every frame.
import * as THREE from 'three';
import type { Multivector } from '@codecraft/ga';
import { Glyph, parts } from './glyph';
import type { MachineType } from './items';
import { MACHINE_LOOK, hex } from './looks';
import { STEP, opposite, type Block, type Dir, type Machine, type World } from './world';

const PX = 128;

// --- static block faces ------------------------------------------------------------------------

const TILES = ['lattice', 'e1', 'e2', 'e3', 'one', 'other', 'bench', 'benchTop'] as const;
type Tile = (typeof TILES)[number];
const tileIndex = (t: Tile) => TILES.indexOf(t);

const DEPOSIT_LOOK: Record<'e1' | 'e2' | 'e3' | 'one', { colour: number; label: string }> = {
  e1: { colour: 0xff5a5a, label: 'e₁' },
  e2: { colour: 0x5aff8a, label: 'e₂' },
  e3: { colour: 0x5aa8ff, label: 'e₃' },
  one: { colour: 0xfff2b0, label: '1' },
};

function frame(g: CanvasRenderingContext2D, x: number, fill: string, edge: string, w: number) {
  g.fillStyle = fill;
  g.fillRect(x, 0, PX, PX);
  g.strokeStyle = edge;
  g.lineWidth = w;
  g.strokeRect(x + w / 2, w / 2, PX - w, PX - w);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, colour: string) {
  g.fillStyle = colour;
  g.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

function atlas() {
  const cv = document.createElement('canvas');
  cv.width = PX * TILES.length;
  cv.height = PX;
  const g = cv.getContext('2d')!;
  let x = tileIndex('lattice') * PX;
  frame(g, x, '#060d16', 'rgba(0,255,240,0.55)', 3);
  g.strokeStyle = 'rgba(0,255,240,0.12)';
  g.lineWidth = 2;
  for (const t of [32, 64, 96]) {
    g.beginPath();
    g.moveTo(x + t, 0);
    g.lineTo(x + t, PX);
    g.moveTo(x, t);
    g.lineTo(x + PX, t);
    g.stroke();
  }
  for (const k of ['e1', 'e2', 'e3', 'one'] as const) {
    const { colour, label: text } = DEPOSIT_LOOK[k];
    const c = new THREE.Color(colour);
    x = tileIndex(k) * PX;
    frame(g, x, `rgb(${(c.r * 60) | 0},${(c.g * 60) | 0},${(c.b * 60) | 0})`, hex(colour), 8);
    label(g, text, x + PX / 2, PX / 2 + 4, 64, hex(colour));
  }
  x = tileIndex('other') * PX;
  frame(g, x, '#202020', '#ffffff', 8);
  x = tileIndex('bench') * PX;
  frame(g, x, '#0b1420', '#ffd25a', 8);
  label(g, 'BENCH', x + PX / 2, PX / 2, 24, '#ffd25a');
  x = tileIndex('benchTop') * PX;
  frame(g, x, '#0b1420', '#ffd25a', 8);
  label(g, '∧ +', x + PX / 2, PX / 2 + 2, 48, '#ffd25a');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const depositTile = (mv: Multivector): Tile => {
  const p = parts(mv);
  if (mv.terms.size !== 1) return 'other';
  if (p.scalar === 1) return 'one';
  if (p.vector[0] === 1) return 'e1';
  if (p.vector[1] === 1) return 'e2';
  if (p.vector[2] === 1) return 'e3';
  return 'other';
};

function faceTile(b: Block, normalY: number): Tile {
  if (b.kind === 'deposit') return depositTile(b.mv);
  if (b.kind === 'bench') return normalY === 1 ? 'benchTop' : 'bench';
  return 'lattice';
}

// each face: its normal and its four corners (counter-clockwise seen from outside)
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const isStatic = (b: Block) => b.kind === 'lattice' || b.kind === 'deposit' || b.kind === 'bench';

// --- machine faces -----------------------------------------------------------------------------

const faceCache = new Map<string, THREE.MeshLambertMaterial>();

/** a face texture: a frame in the machine's colour with a word or symbol, and optionally an arrow */
function face(colour: number, text: string, opts: { size?: number; arrow?: boolean; dim?: boolean } = {}) {
  const key = `${colour}|${text}|${opts.size}|${opts.arrow}|${opts.dim}`;
  let m = faceCache.get(key);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const g = cv.getContext('2d')!;
  frame(g, 0, opts.dim ? '#05090f' : '#0a1722', hex(colour), 8);
  if (opts.arrow) {
    // an arrow pointing toward the texture's right edge, which faces the output on the top face
    g.fillStyle = hex(colour);
    g.globalAlpha = 0.35;
    g.beginPath();
    g.moveTo(PX - 14, PX / 2);
    g.lineTo(PX - 44, PX / 2 - 26);
    g.lineTo(PX - 44, PX / 2 + 26);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }
  if (text) label(g, text, PX / 2, PX / 2 + 3, opts.size ?? 40, hex(colour));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  m = new THREE.MeshLambertMaterial({ map: tex });
  faceCache.set(key, m);
  return m;
}

/** materials for a box in BoxGeometry order (+x, −x, +y, −y, +z, −z), local +x being the output */
function machineFaces(type: MachineType) {
  const { colour, symbol } = MACHINE_LOOK[type];
  const top = face(colour, symbol, { size: symbol.length > 4 ? 26 : 40, arrow: type !== 'collector' });
  const plain = face(colour, '', { dim: true });
  if (type === 'extractor') return [face(colour, 'OUT ▶', { size: 34 }), face(colour, 'DEPOSIT', { size: 22 }), top, plain, plain, plain];
  if (type === 'collector') {
    const side = face(colour, 'IN', { size: 40 });
    return [side, side, top, plain, side, side];
  }
  const b = face(colour, 'B', { size: 64 });
  return [face(colour, 'OUT ▶', { size: 34 }), face(colour, 'A', { size: 64 }), top, plain, b, b];
}

// --- the renderer ------------------------------------------------------------------------------

interface Shown {
  group: THREE.Group;
  /** small glyphs for what a machine holds, by slot */
  held: Map<string, { key: string; glyph: Glyph }>;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  private terrain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ map: atlas(), vertexColors: true }));
  private shown = new Map<string, Shown>();
  private riders = new Map<number, Glyph>();
  private selection: THREE.LineSegments;
  private ghost: THREE.Group;
  private ghostBox: THREE.LineSegments;
  private ghostArrow: THREE.Mesh;
  private beacon: { key: string; glyph: Glyph } | null = null;
  private builtVersion = -1;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x03070f);
    this.scene.fog = new THREE.Fog(0x03070f, 24, 70);
    this.scene.add(new THREE.HemisphereLight(0xcff6ff, 0x0a1420, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun, this.terrain);

    this.selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.ghost = new THREE.Group();
    this.ghostBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.98, 0.98)), new THREE.LineBasicMaterial({ color: 0x7dff6a }));
    this.ghostArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.8 }));
    this.ghostArrow.rotation.z = -Math.PI / 2; // cone points +x, the local output direction
    this.ghostArrow.position.set(0.25, 0, 0);
    this.ghost.add(this.ghostBox, this.ghostArrow);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  select(cell: [number, number, number] | null) {
    this.selection.visible = !!cell;
    if (cell) this.selection.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
  }

  /** the outline of what would be placed, or null; `facing` shows an arrow; red when it can't go there */
  preview(cell: [number, number, number] | null, facing: Dir | null, ok: boolean) {
    this.ghost.visible = !!cell;
    if (!cell) return;
    this.ghost.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
    this.ghost.rotation.y = (facing ?? 0) * (Math.PI / 2);
    this.ghostArrow.visible = facing !== null;
    const colour = ok ? 0x7dff6a : 0xff4d6a;
    (this.ghostBox.material as THREE.LineBasicMaterial).color.setHex(colour);
    (this.ghostArrow.material as THREE.MeshBasicMaterial).color.setHex(colour);
  }

  /** the element the hub's current order wants, floating above it */
  hubWants(at: [number, number, number], want: Multivector | null) {
    const key = want?.key() ?? '';
    if (this.beacon?.key === key) return;
    if (this.beacon) {
      this.scene.remove(this.beacon.glyph);
      this.beacon.glyph.dispose();
      this.beacon = null;
    }
    if (!want) return;
    const glyph = new Glyph(want, 1.3);
    glyph.position.set(at[0] + 0.5, at[1] + 1.9, at[2] + 0.5);
    this.scene.add(glyph);
    this.beacon = { key, glyph };
  }

  sync(world: World) {
    if (world.version !== this.builtVersion) this.rebuild(world);
    this.syncContents(world);
  }

  private rebuild(world: World) {
    this.builtVersion = world.version;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const seen = new Set<string>();

    for (const [x, y, z, b] of world.entries()) {
      if (!isStatic(b)) {
        const at = `${x},${y},${z}`;
        seen.add(at);
        this.show(at, x, y, z, b);
        continue;
      }
      for (const f of FACES) {
        const n = world.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        if (n && isStatic(n)) continue;
        const tile = tileIndex(faceTile(b, f.n[1]));
        const shade = f.n[1] === 1 ? 1 : f.n[1] === -1 ? 0.45 : f.n[0] ? 0.85 : 0.7;
        const base = pos.length / 3;
        f.c.forEach(([cx, cy, cz], i) => {
          pos.push(x + cx, y + cy, z + cz);
          nor.push(...f.n);
          uv.push((tile + (i === 1 || i === 2 ? 1 : 0)) / TILES.length, i >= 2 ? 1 : 0);
          col.push(shade, shade, shade);
        });
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    for (const [at, s] of this.shown) {
      if (seen.has(at)) continue;
      this.remove(s);
      this.shown.delete(at);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.terrain.geometry.dispose();
    this.terrain.geometry = geo;
  }

  private remove(s: Shown) {
    this.scene.remove(s.group);
    s.held.forEach((h) => h.glyph.dispose());
  }

  /** the object for a machine or the hub; rebuilt when its type or facing changes */
  private show(at: string, x: number, y: number, z: number, b: Block) {
    const sig = b.kind === 'machine' ? `${b.type}:${b.facing}` : b.kind;
    const existing = this.shown.get(at);
    if (existing && existing.group.userData.sig === sig) return;
    if (existing) this.remove(existing);
    const group = new THREE.Group();
    group.userData.sig = sig;
    group.position.set(x + 0.5, y, z + 0.5);
    if (b.kind === 'hub') {
      const gold = 0xffd25a;
      const side = face(gold, 'HUB', { size: 44 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [side, side, face(gold, '★', { size: 60 }), side, side, side]);
      box.position.y = 0.5;
      group.add(box);
    } else if (b.kind === 'machine' && b.type === 'duct') {
      group.add(ductModel());
      group.rotation.y = b.facing * (Math.PI / 2);
    } else if (b.kind === 'machine') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), machineFaces(b.type));
      box.position.y = 0.5;
      group.add(box);
      group.rotation.y = b.facing * (Math.PI / 2);
    }
    this.scene.add(group);
    this.shown.set(at, { group, held: new Map() });
  }

  /** elements riding ducts and waiting in machines */
  private syncContents(world: World) {
    const riding = new Set<number>();
    for (const [x, y, z] of world.active.values()) {
      const b = world.get(x, y, z);
      if (b?.kind !== 'machine') continue;
      if (b.type === 'duct' && b.item) {
        riding.add(b.item.id);
        let g = this.riders.get(b.item.id);
        if (!g) {
          g = new Glyph(b.item.mv, 0.55);
          this.riders.set(b.item.id, g);
          this.scene.add(g);
        }
        g.position.copy(ridePosition(x, y, z, b.facing, b.item.from, b.item.t));
      }
      const s = this.shown.get(`${x},${y},${z}`);
      if (s) this.syncHeld(s, b);
    }
    for (const [id, g] of this.riders) {
      if (riding.has(id)) continue;
      this.scene.remove(g);
      g.dispose();
      this.riders.delete(id);
    }
  }

  /** small glyphs on a machine's faces: A at the back, B at a side, the output at the front, a fixed B above */
  private syncHeld(s: Shown, m: Machine) {
    const want = new Map<string, Multivector>();
    if (m.type === 'extractor' && m.out) want.set('out', m.out.mv);
    if (m.type === 'adder' || m.type === 'wedger' || m.type === 'multiplier' || m.type === 'sandwich') {
      if (m.a) want.set('a', m.a);
      if (m.b) want.set('b', m.b);
      if (m.out) want.set('out', m.out);
      if (m.fixed) want.set('fixed', m.fixed);
    }
    const place: Record<string, [number, number, number]> = { a: [-0.72, 0.5, 0], b: [0, 0.5, 0.72], out: [0.72, 0.5, 0], fixed: [0, 1.45, 0] };
    for (const [slot, h] of s.held) {
      const mv = want.get(slot);
      if (mv && mv.key() === h.key) continue;
      s.group.remove(h.glyph);
      h.glyph.dispose();
      s.held.delete(slot);
    }
    for (const [slot, mv] of want) {
      if (s.held.has(slot)) continue;
      const glyph = new Glyph(mv, slot === 'fixed' ? 0.8 : 0.42);
      glyph.position.set(...place[slot]);
      s.group.add(glyph);
      s.held.set(slot, { key: mv.key(), glyph });
    }
  }

  render(dt: number) {
    this.time += dt;
    for (const s of this.shown.values()) for (const h of s.held.values()) h.glyph.tick(dt);
    for (const g of this.riders.values()) g.tick(dt);
    if (this.beacon) {
      this.beacon.glyph.tick(dt);
      this.beacon.glyph.rotation.y += dt * 0.8;
      this.beacon.glyph.position.y += Math.sin(this.time * 2) * 0.002;
    }
    this.renderer.render(this.scene, this.camera);
  }
}

/** a duct: a low glass tube along local +x with chevrons showing the way it carries */
function ductModel() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.34, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0a2a33, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  tube.position.y = 0.19;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.34, 0.5)), new THREE.LineBasicMaterial({ color: 0x00fff0 }));
  edges.position.y = 0.19;
  g.add(tube, edges);
  const chevron = new THREE.Shape();
  chevron.moveTo(-0.08, -0.16);
  chevron.lineTo(0.12, 0);
  chevron.lineTo(-0.08, 0.16);
  chevron.lineTo(-0.02, 0);
  chevron.closePath();
  const geo = new THREE.ShapeGeometry(chevron);
  for (const x of [-0.28, 0.12]) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x00fff0, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; // lie flat on top, pointing +x
    m.position.set(x, 0.365, 0);
    g.add(m);
  }
  return g;
}

/** where an element is along a duct, riding just above it: in from its entry side to the middle, then out the front */
function ridePosition(x: number, y: number, z: number, facing: Dir, from: Dir | null, t: number) {
  const c = new THREE.Vector3(x + 0.5, y + 0.62, z + 0.5);
  const [ox, oz] = STEP[facing];
  const entry = from ?? opposite(facing);
  const [ix, iz] = STEP[entry];
  if (t < 0.5) {
    const k = 0.5 - t; // 0.5 at the entry edge, 0 at the middle
    return c.add(new THREE.Vector3(ix * k, 0, iz * k));
  }
  const k = t - 0.5;
  return c.add(new THREE.Vector3(ox * k, 0, oz * k));
}

