// Draws the world. Opaque blocks (lattice, deposits, benches) go into one merged mesh of their
// visible faces, rebuilt whenever the world changes; at this size that takes a few milliseconds.
// Machine blocks are glass cubes holding the element's glyph.
import * as THREE from 'three';
import { Glyph, parts, vectorColour } from './glyph';
import { opaque, type Block, type World } from './world';

const TILE = { lattice: 0, deposit: 1, bench: 2, benchTop: 3 } as const;
const TILES = 4;

/** the face textures, drawn once onto a canvas: grid lines in the CodeCraft cyan on near-black */
function atlas() {
  const px = 64;
  const cv = document.createElement('canvas');
  cv.width = px * TILES;
  cv.height = px;
  const g = cv.getContext('2d')!;
  const frame = (i: number, fill: string, edge: string, w: number) => {
    g.fillStyle = fill;
    g.fillRect(i * px, 0, px, px);
    g.strokeStyle = edge;
    g.lineWidth = w;
    g.strokeRect(i * px + w / 2, w / 2, px - w, px - w);
  };
  frame(TILE.lattice, '#060d16', 'rgba(0,255,240,0.55)', 2);
  g.strokeStyle = 'rgba(0,255,240,0.12)';
  g.lineWidth = 1;
  for (const t of [16, 32, 48]) {
    g.beginPath();
    g.moveTo(t, 0);
    g.lineTo(t, px);
    g.moveTo(0, t);
    g.lineTo(px, t);
    g.stroke();
  }
  // deposits are drawn white and tinted by vertex colour
  frame(TILE.deposit, '#2a2a2a', '#ffffff', 3);
  g.fillStyle = '#ffffff';
  g.beginPath();
  const cx = TILE.deposit * px + px / 2;
  g.moveTo(cx, 14);
  g.lineTo(cx + 18, 32);
  g.lineTo(cx, 50);
  g.lineTo(cx - 18, 32);
  g.closePath();
  g.fill();
  frame(TILE.bench, '#0b1420', 'rgba(255,210,90,0.9)', 3);
  frame(TILE.benchTop, '#0b1420', 'rgba(255,210,90,0.9)', 3);
  g.fillStyle = 'rgba(255,210,90,0.95)';
  g.font = 'bold 30px ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('∧', TILE.bench * px + px / 2, px / 2 + 2);
  g.fillText('AB', TILE.benchTop * px + px / 2, px / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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

function faceTile(b: Block, normalY: number) {
  if (b.kind === 'deposit') return TILE.deposit;
  if (b.kind === 'bench') return normalY === 1 ? TILE.benchTop : TILE.bench;
  return TILE.lattice;
}

function faceColour(b: Block, shade: number) {
  const c = new THREE.Color(b.kind === 'deposit' ? depositColour(b) : 0xffffff);
  return c.multiplyScalar(shade);
}

const depositColour = (b: Extract<Block, { kind: 'deposit' }>) => {
  const p = parts(b.mv);
  return p.scalar ? 0xfff2b0 : vectorColour(p.vector);
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  private terrain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ map: atlas(), vertexColors: true }));
  private machines = new Map<string, { key: string; group: THREE.Group; glyph: Glyph }>();
  private selection: THREE.LineSegments;
  private builtVersion = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x03070f);
    this.scene.fog = new THREE.Fog(0x03070f, 24, 70);
    this.scene.add(new THREE.HemisphereLight(0xcff6ff, 0x0a1420, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun, this.terrain);
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    this.selection.visible = false;
    this.scene.add(this.selection);
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

  sync(world: World) {
    if (world.version === this.builtVersion) return;
    this.builtVersion = world.version;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const seen = new Set<string>();

    for (const [x, y, z, b] of world.entries()) {
      if (b.kind === 'element') {
        const at = `${x},${y},${z}`;
        seen.add(at);
        this.placeMachine(at, x, y, z, b);
        continue;
      }
      for (const f of FACES) {
        if (opaque(world.get(x + f.n[0], y + f.n[1], z + f.n[2]))) continue;
        const tile = faceTile(b, f.n[1]);
        // simple directional shading so the grid reads in 3D without real shadows
        const shade = f.n[1] === 1 ? 1 : f.n[1] === -1 ? 0.45 : f.n[0] ? 0.8 : 0.65;
        const colour = faceColour(b, shade);
        const base = pos.length / 3;
        f.c.forEach(([cx, cy, cz], i) => {
          pos.push(x + cx, y + cy, z + cz);
          nor.push(...f.n);
          uv.push((tile + (i === 1 || i === 2 ? 1 : 0)) / TILES, i >= 2 ? 1 : 0);
          col.push(colour.r, colour.g, colour.b);
        });
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    for (const [at, m] of this.machines) {
      if (seen.has(at)) continue;
      this.scene.remove(m.group);
      m.glyph.dispose();
      this.machines.delete(at);
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

  private placeMachine(at: string, x: number, y: number, z: number, b: Extract<Block, { kind: 'element' }>) {
    const key = b.mv.key();
    const existing = this.machines.get(at);
    if (existing?.key === key) return;
    if (existing) {
      this.scene.remove(existing.group);
      existing.glyph.dispose();
    }
    const group = new THREE.Group();
    group.position.set(x + 0.5, y + 0.5, z + 0.5);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x0a2a33, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x00fff0 }));
    const glyph = new Glyph(b.mv);
    group.add(glass, edges, glyph);
    this.scene.add(group);
    this.machines.set(at, { key, group, glyph });
  }

  render(dt: number) {
    for (const m of this.machines.values()) m.glyph.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
