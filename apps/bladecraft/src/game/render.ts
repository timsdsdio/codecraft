// Draws the world. Lattice and deposits go into one merged mesh of their visible faces, rebuilt
// whenever blocks change. Machines and the Workbench are animated models (models.ts), driven
// every frame by what the factory left in their blocks. Elements riding belts and waiting in machines
// are drawn as their glyphs, and finished operations let off steam. A duct fed only from one side
// is drawn as a corner, and elements coming in from a side ride round the bend.
import * as THREE from 'three';
import type { Multivector } from '@codecraft/ga';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Glyph, parts } from './glyph';
import { hex } from './looks';
import { relative, rel, outputs } from './factory';
import { FieldView } from './fieldview';
import type { Field } from './field';
import { Steam, buildModel, curvePoint, scrollBelts, type Model, type ModelKind } from './models';
import { STEP, opposite, type Block, type Dir, type Machine, type World } from './world';
import { valueOf, type Stack } from './items';

const PX = 128;

// --- static block faces ------------------------------------------------------------------------

const TILES = ['lattice', 'e1', 'e2', 'e3', 'one', 'other'] as const;
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

const faceTile = (b: Block): Tile => (b.kind === 'deposit' ? depositTile(b.mv) : 'lattice');

// each face: its normal and its four corners (counter-clockwise seen from outside)
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const isStatic = (b: Block) => b.kind === 'lattice' || b.kind === 'deposit';

// --- the renderer ------------------------------------------------------------------------------

interface Shown {
  model: Model;
  /** small glyphs for what a machine holds, by slot */
  held: Map<string, { key: string; glyph: Glyph }>;
  /** the last state seen, to notice an operation finishing */
  last: { work: number; timer: number };
}

const at = (x: number, y: number, z: number) => `${x},${y},${z}`;

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  private terrain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ map: atlas(), vertexColors: true }));
  private shown = new Map<string, Shown>();
  private riders = new Map<number, Rider>();
  private selection: THREE.LineSegments;
  private ghost: THREE.Group;
  private ghostBox: THREE.LineSegments;
  private ghostArrow: THREE.Mesh;
  private steam: Steam;
  private fieldView: FieldView;
  private world: World | null = null;
  private builtVersion = -1;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x03070f);
    this.scene.fog = new THREE.Fog(0x03070f, 24, 70);
    // a soft room to reflect, so brass and copper read as metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    this.scene.add(new THREE.HemisphereLight(0xcff6ff, 0x0a1420, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun, this.terrain);
    this.steam = new Steam(this.scene);
    this.fieldView = new FieldView(this.scene);

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

  sync(world: World, field: Field) {
    this.world = world;
    if (world.version !== this.builtVersion) this.rebuild(world);
    this.syncContents(world);
    this.fieldView.update(field);
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
        seen.add(at(x, y, z));
        this.show(x, y, z, b, world);
        continue;
      }
      for (const f of FACES) {
        const n = world.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        if (n && isStatic(n)) continue;
        const tile = tileIndex(faceTile(b));
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
    for (const [key, s] of this.shown) {
      if (seen.has(key)) continue;
      this.remove(s);
      this.shown.delete(key);
    }
    this.fieldView.rebuild(world);
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
    this.scene.remove(s.model.group);
    s.held.forEach((h) => h.glyph.dispose());
  }

  /** the model for a machine or the Workbench; rebuilt when its type changes, turned when its facing does */
  private show(x: number, y: number, z: number, b: Block, world: World) {
    // plates are drawn all together by the field view
    const kind: ModelKind | null =
      b.kind === 'machine'
        ? b.type === 'plate'
          ? null
          : b.type === 'duct'
            ? ductKind(world, x, y, z, b.facing)
            : b.type
        : b.kind === 'workbench'
          ? b.kind
          : null;
    const key = at(x, y, z);
    if (!kind) {
      const old = this.shown.get(key);
      if (old) this.remove(old), this.shown.delete(key);
      return;
    }
    let s = this.shown.get(key);
    if (s && s.model.group.userData.kind !== kind) {
      this.remove(s);
      s = undefined;
    }
    if (!s) {
      const model = buildModel(kind);
      model.group.userData.kind = kind;
      model.group.position.set(x + 0.5, y, z + 0.5);
      this.scene.add(model.group);
      s = { model, held: new Map(), last: { work: 0, timer: 0 } };
      this.shown.set(key, s);
    }
    s.model.group.rotation.y = b.kind === 'machine' ? b.facing * (Math.PI / 2) : 0;
  }

  /** elements riding belts and waiting in machines, and steam when an operation finishes */
  private syncContents(world: World) {
    const riding = new Set<number>();
    for (const [x, y, z] of world.active.values()) {
      const b = world.get(x, y, z);
      if (b?.kind !== 'machine') continue;
      if (b.type === 'duct' && b.item) {
        riding.add(b.item.id);
        let g = this.riders.get(b.item.id);
        if (!g) {
          g = riderFor(b.item.stack);
          this.riders.set(b.item.id, g);
          this.scene.add(g);
        }
        g.position.copy(ridePosition(x, y, z, b.facing, b.item.from, b.item.t));
      }
      const s = this.shown.get(at(x, y, z));
      if (!s) continue;
      this.syncHeld(s, b);
      this.noticeFinished(s, b);
    }
    for (const [id, g] of this.riders) {
      if (riding.has(id)) continue;
      this.scene.remove(g);
      g.dispose();
      this.riders.delete(id);
    }
  }

  private noticeFinished(s: Shown, m: Machine) {
    const work = 'work' in m ? m.work : 0;
    const timer = m.type === 'generator' ? m.timer : 0;
    // an operation that just finished resets its work; a generator that just made a blade resets its timer
    const finished = (s.last.work > 0.5 && work === 0) || (s.last.timer > 0.5 && timer < s.last.timer);
    if (finished) this.steam.puff(s.model.group.localToWorld(s.model.chimney.clone()), m.type === 'generator' ? 3 : 6);
    s.last = { work, timer };
  }

  /** small glyphs of what a machine holds, at its ports: what came in at the back and sides, what waits at the front */
  private syncHeld(s: Shown, m: Machine) {
    const want = new Map<string, Multivector>();
    const put = (slot: string, st: Stack | null | undefined) => {
      const mv = st ? shownMv(st) : null;
      if (mv && !mv.isZero()) want.set(slot, mv);
    };
    switch (m.type) {
      case 'generator':
        put('sample', m.sample);
        put('out', m.out);
        break;
      case 'detector':
      case 'orrery':
        put('a', m.a);
        put('out', m.out);
        break;
      case 'mill':
        put('a', m.x);
        put('side', m.side);
        put('out', m.out);
        break;
      case 'packer':
        m.slots.forEach((st, r) => put(`s${r}`, st));
        put('out', m.out);
        break;
      case 'unpacker':
        put('item', m.item ?? m.queue[0]);
        break;
      case 'press':
        put('bed', m.bed);
        break;
      case 'splitter':
        put('item', m.item);
        break;
      case 'sorter':
        put('item', m.item);
        if (m.filter) want.set('filter', m.filter);
        break;
      case 'probe':
        // the last reading floats above it
        if (m.reading && !m.reading.isZero()) want.set('reading', m.reading);
        put('out', m.out);
        break;
      case 'charge':
      case 'wire':
      case 'antenna':
        put('fixed', m.slot);
        break;
      // merger slots are kept by side relative to its facing, crossing slots by the side they came in from
      case 'merger':
        m.slots.forEach((st, r) => put(`s${r}`, st));
        break;
      case 'crossing':
        m.slots.forEach((st, d) => put(`s${relative(m.facing, d as Dir)}`, st));
        break;
    }
    for (const [slot, h] of s.held) {
      const mv = want.get(slot);
      if (mv && mv.key() === h.key) continue;
      s.model.group.remove(h.glyph);
      h.glyph.dispose();
      s.held.delete(slot);
    }
    for (const [slot, mv] of want) {
      if (s.held.has(slot)) continue;
      const glyph = new Glyph(mv, slot === 'fixed' ? 0.6 : slot === 'filter' ? 0.3 : 0.42);
      glyph.position.copy(s.model.anchors[slot] ?? s.model.anchors.out);
      s.model.group.add(glyph);
      s.held.set(slot, { key: mv.key(), glyph });
    }
  }

  render(dt: number) {
    this.time += dt;
    scrollBelts(dt);
    for (const [key, s] of this.shown) {
      const [x, y, z] = key.split(',').map(Number);
      s.model.update(this.world?.get(x, y, z), dt, this.time);
      for (const h of s.held.values()) h.glyph.tick(dt);
    }
    for (const g of this.riders.values()) g.tick(dt);
    this.steam.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

/** a duct bends when it is fed from one side only, with nothing feeding it from behind */
function ductKind(world: World, x: number, y: number, z: number, facing: Dir): ModelKind {
  const feeds = (r: number) => {
    const d = rel(facing, r);
    const [dx, dz] = STEP[d];
    const n = world.get(x + dx, y, z + dz);
    return n?.kind === 'machine' && outputs(n).includes(opposite(d));
  };
  if (feeds(2)) return 'duct';
  const left = feeds(1);
  const right = feeds(3);
  return left && !right ? 'duct-left' : right && !left ? 'duct-right' : 'duct';
}

/**
 * Where an element is along a belt, riding on it. From the back it goes straight through; from a side
 * it follows the quarter circle a corner belt draws, from the middle of that side round to the front.
 */
function ridePosition(x: number, y: number, z: number, facing: Dir, from: Dir | null, t: number) {
  const c = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  const side = from === null ? 2 : relative(facing, from);
  if (side === 1 || side === 3) {
    const [lx, lz] = curvePoint(side === 1 ? -1 : 1, 0.5, t * (Math.PI / 2));
    // turn from the belt's frame into the world's, as its model is turned
    const phi = facing * (Math.PI / 2);
    return c.add(new THREE.Vector3(lx * Math.cos(phi) + lz * Math.sin(phi), 0, -lx * Math.sin(phi) + lz * Math.cos(phi)));
  }
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

/** the multivector to draw for a stack: an element's value, a reading or a card's multivector */
function shownMv(s: Stack): Multivector | null {
  if (s.item.kind === 'element') return valueOf(s);
  if (s.item.kind === 'reading') return s.item.mv;
  if (s.item.kind === 'card') return s.item.mv;
  return null;
}

type Rider = THREE.Object3D & { tick(dt: number): void; dispose(): void };

/** what rides a duct: the glyph of its multivector, or a small brass crate for anything else */
function riderFor(s: Stack): Rider {
  const mv = shownMv(s);
  if (mv) return new Glyph(mv, 0.5);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.4 }));
  return Object.assign(crate, {
    tick(dt: number) {
      crate.rotation.y += dt;
    },
    dispose() {
      crate.geometry.dispose();
      (crate.material as THREE.Material).dispose();
    },
  });
}
