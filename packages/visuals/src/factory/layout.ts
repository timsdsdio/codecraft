// Snapshot → factory layout. Pure maths, no three.js: the wiki's diagrams and the game both use it.
//
// Coordinates: 1 world unit = 100 CSS px (the player is 1 unit = 100 px tall). The screen lies face
// up; screen x → world x, screen y → world z (the top of the app is at −z). The root component's
// floor is at y = 0, each tree level is one floor higher, and the screen is the roof.
import type { ValueKind } from '../palette';

export const PX = 100;
export const FLOOR_H = 1.6;
export const SLAB = 0.08;
export const CASING_H = 0.5;

export type Vec3 = [number, number, number];

/** CSS px, in the app's viewport coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World-space footprint on the floor plane. */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface ValueInfo {
  name: string;
  kind: ValueKind;
  /** short printable preview, e.g. `"Buy milk"` or `Array(10)` */
  preview: string;
}

/** One mounted component instance, as the probe reports it. */
export interface CompNode {
  id: string;
  name: string;
  parent: string | null;
  /** border box of the component's DOM output, in viewport px (after scrolling) */
  rect: Rect;
  /** visible area after every scrolling ancestor clips it (absent = not clipped) */
  clip?: Rect;
  props: ValueInfo[];
  /** useState hooks, in call order */
  state: ValueInfo[];
  /** set when this instance came from a keyed list (`items.map(...)`) */
  key?: string;
  /** false when the component's own JSX paints nothing visible (only lays out children) */
  paints?: boolean;
}

/** A scrollable element and the component whose JSX renders it. */
export interface ScrollInfo {
  owner: string;
  viewport: Rect;
  scrollTop: number;
  scrollHeight: number;
}

export interface Snapshot {
  viewport: { w: number; h: number };
  nodes: CompNode[];
  scrolls: ScrollInfo[];
}

export interface CasingL {
  id: string;
  name: string;
  depth: number;
  /** centre of the casing's base */
  pos: Vec3;
  size: Vec3;
  clip?: Box;
}

export interface TankL {
  id: string;
  owner: string;
  info: ValueInfo;
  pos: Vec3;
  radius: number;
  height: number;
}

export interface PipeL {
  id: string;
  from: string;
  to: string;
  points: Vec3[];
  kind: ValueKind;
  /** function-valued props: events travel down these, from child to owner */
  wire?: boolean;
  props: ValueInfo[];
  clip?: Box;
}

export interface PistonL {
  owner: string;
  /** where the rod leaves the casing */
  base: Vec3;
  heads: { key: string; child: string; pos: Vec3 }[];
  clip?: Box;
}

export interface BeltL {
  owner: string;
  box: Box;
  y: number;
  /** scroll offset in world units */
  offset: number;
}

export interface LinkL {
  id: string;
  from: Vec3;
  rect: Box;
  clip?: Box;
}

export interface FoldL {
  owner: string;
  box: Box;
  /** floors the fold spans: from the owner's floor to the screen */
  y0: number;
  y1: number;
}

export interface FactoryLayout {
  floors: number;
  /** world width (x) and depth (z) of the screen */
  size: [number, number];
  screenY: number;
  casings: CasingL[];
  tanks: TankL[];
  pipes: PipeL[];
  pistons: PistonL[];
  belts: BeltL[];
  links: LinkL[];
  folds: FoldL[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function floorY(depth: number) {
  return (depth - 1) * FLOOR_H;
}

export function layoutFactory(snap: Snapshot): FactoryLayout {
  const { w: vw, h: vh } = snap.viewport;
  const wx = (px: number) => (px - vw / 2) / PX;
  const wz = (py: number) => (py - vh / 2) / PX;
  const toBox = (r: Rect): Box => ({ x0: wx(r.x), x1: wx(r.x + r.w), z0: wz(r.y), z1: wz(r.y + r.h) });

  const byId = new Map(snap.nodes.map((n) => [n.id, n]));
  const depthOf = new Map<string, number>();
  const depth = (n: CompNode): number => {
    const d = depthOf.get(n.id);
    if (d !== undefined) return d;
    const p = n.parent ? byId.get(n.parent) : undefined;
    const v = p ? depth(p) + 1 : 1;
    depthOf.set(n.id, v);
    return v;
  };
  const floors = Math.max(1, ...snap.nodes.map(depth));
  const screenY = floors * FLOOR_H;
  const scrollOf = new Map(snap.scrolls.map((s) => [s.owner, s]));

  // ── casings ──
  const casings = new Map<string, CasingL>();
  for (const n of snap.nodes) {
    const d = depth(n);
    const size: Vec3 = [clamp((n.rect.w / PX) * 0.6, 0.32, 1.1), CASING_H, clamp((n.rect.h / PX) * 0.7, 0.26, 0.7)];
    const scroll = scrollOf.get(n.id);
    let cx = wx(n.rect.x + n.rect.w / 2);
    let cz = wz(n.rect.y + n.rect.h / 2);
    if (scroll) {
      // a scroll owner sits at the near edge of its scroll area; its list rod runs through it
      cx = wx(scroll.viewport.x + scroll.viewport.w / 2);
      cz = wz(scroll.viewport.y) + size[2] / 2 + 0.04;
    }
    casings.set(n.id, { id: n.id, name: n.name, depth: d, pos: [cx, floorY(d) + SLAB, cz], size, clip: n.clip ? toBox(n.clip) : undefined });
  }

  // ── state tanks: in a row beside the casing (−x side) ──
  const tanks: TankL[] = [];
  for (const n of snap.nodes) {
    const c = casings.get(n.id)!;
    n.state.forEach((info, i) => {
      const r = 0.13;
      tanks.push({
        id: `${n.id}:state${i}`,
        owner: n.id,
        info,
        radius: r,
        height: 0.46,
        pos: [c.pos[0] - c.size[0] / 2 - r - 0.06 - i * (2 * r + 0.08), c.pos[1], c.pos[2]],
      });
    });
  }

  // ── children: plain children get a pipe each; keyed children hang off a piston ──
  const pipes: PipeL[] = [];
  const pistons: PistonL[] = [];
  const belts: BeltL[] = [];
  const folds: FoldL[] = [];
  const kids = new Map<string, CompNode[]>();
  for (const n of snap.nodes) if (n.parent) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);

  for (const parent of snap.nodes) {
    const children = kids.get(parent.id) ?? [];
    if (!children.length) continue;
    const pc = casings.get(parent.id)!;
    const top = pc.pos[1] + pc.size[1];
    const childY = floorY(depth(parent) + 1) + SLAB;
    const plain = children.filter((c) => c.key === undefined);
    const keyed = children.filter((c) => c.key !== undefined);

    plain.forEach((child, i) => {
      const cc = casings.get(child.id)!;
      const lane = childY - 0.22 - i * 0.06;
      const sx = pc.pos[0] + (i - (plain.length - 1) / 2) * 0.09;
      const sz = pc.pos[2];
      const data = child.props.filter((p) => p.kind !== 'function');
      const fns = child.props.filter((p) => p.kind === 'function');
      const route = (dx: number): Vec3[] => [
        [sx + dx, top, sz],
        [sx + dx, lane, sz],
        [cc.pos[0] + dx, lane, sz],
        [cc.pos[0] + dx, lane, cc.pos[2]],
        [cc.pos[0] + dx, childY, cc.pos[2]],
      ];
      pipes.push({ id: `${parent.id}>${child.id}`, from: parent.id, to: child.id, points: route(0), kind: bundleKind(data), props: data, clip: cc.clip });
      if (fns.length)
        pipes.push({ id: `${child.id}~>${parent.id}`, from: child.id, to: parent.id, points: route(0.07).reverse(), kind: 'function', wire: true, props: fns, clip: cc.clip });
    });

    if (keyed.length) {
      const scroll = scrollOf.get(parent.id);
      const fold = scroll ? toBox(scroll.viewport) : undefined;
      const rodY = floorY(depth(parent)) + SLAB + 0.2;
      const rodX = pc.pos[0];
      const base: Vec3 = [rodX, rodY, pc.pos[2] + pc.size[2] / 2];
      const heads = keyed.map((child) => {
        const cc = casings.get(child.id)!;
        return { key: child.key!, child: child.id, pos: [rodX, rodY, cc.pos[2]] as Vec3 };
      });
      pistons.push({ owner: parent.id, base, heads, clip: fold });
      // each head feeds its item through a pipe that leaves the side, rises, and comes back over
      keyed.forEach((child, i) => {
        const cc = casings.get(child.id)!;
        const h = heads[i].pos;
        const out = rodX + 0.42;
        const lane = childY - 0.22;
        const data = child.props.filter((p) => p.kind !== 'function');
        const fns = child.props.filter((p) => p.kind === 'function');
        const route = (dx: number, dz: number): Vec3[] => [
          [rodX + 0.12, h[1], h[2] + dz],
          [out + dx, h[1], h[2] + dz],
          [out + dx, lane - dx, h[2] + dz],
          [cc.pos[0] + dx, lane - dx, h[2] + dz],
          [cc.pos[0] + dx, childY, cc.pos[2] + dz],
        ];
        pipes.push({ id: `${parent.id}>${child.id}`, from: parent.id, to: child.id, points: route(0, 0), kind: bundleKind(data), props: data, clip: cc.clip ?? fold });
        if (fns.length)
          pipes.push({ id: `${child.id}~>${parent.id}`, from: child.id, to: parent.id, points: route(0.07, 0.06).reverse(), kind: 'function', wire: true, props: fns, clip: cc.clip ?? fold });
      });
      if (scroll && fold) {
        const bw = 0.5;
        belts.push({ owner: parent.id, box: { x0: rodX - bw / 2, x1: rodX + bw / 2, z0: fold.z0, z1: fold.z1 }, y: floorY(depth(parent)) + SLAB, offset: scroll.scrollTop / PX });
        folds.push({ owner: parent.id, box: fold, y0: floorY(depth(parent)), y1: screenY });
      }
    }
  }

  // ── display links: a beam from each painting casing up to its patch of screen ──
  const links: LinkL[] = [];
  for (const n of snap.nodes) {
    if (n.paints === false) continue;
    const c = casings.get(n.id)!;
    links.push({ id: n.id, from: [c.pos[0], c.pos[1] + c.size[1], c.pos[2]], rect: toBox(n.rect), clip: c.clip });
  }

  return {
    floors,
    size: [vw / PX, vh / PX],
    screenY,
    casings: [...casings.values()],
    tanks,
    pipes,
    pistons,
    belts,
    links,
    folds,
  };
}

/** A pipe carries a bundle of props; it takes the colour of the most interesting one. */
function bundleKind(props: ValueInfo[]): ValueKind {
  const order: ValueKind[] = ['array', 'object', 'string', 'number', 'boolean', 'node', 'nullish'];
  for (const k of order) if (props.some((p) => p.kind === k)) return k;
  return 'nullish';
}
