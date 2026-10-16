// Pure block/socket layout. +Z is the block's front: outputs sit on the front face, inputs on the
// back face, and view-kind inputs (render slots / children) on the top face.
import type { Zone } from './palette';

export type PortKind = 'value' | 'view' | 'cable';
export type PortSide = 'in' | 'out';
export type Face = 'front' | 'back' | 'top';
export type Vec3 = [number, number, number];

export interface PortSpec {
  name: string;
  iface: string;
  side: PortSide;
  kind?: PortKind;
  many?: boolean;
  optional?: boolean;
}

export interface BlockSpec {
  id: string;
  title: string;
  zone: Zone;
  ports: PortSpec[];
}

/** Block edge length (world units ≈ metres). */
export const CUBE = 1.4;
/** Block centre height above the floor (blocks hover slightly). */
export const CUBE_Y = CUBE / 2 + 0.08;

export interface SocketPlacement {
  pos: Vec3;
  normal: Vec3;
  /** rotation that maps local +Z onto `normal` */
  euler: Vec3;
  face: Face;
  female: boolean;
  radius: number;
}

export function portFace(p: PortSpec): Face {
  if (p.side === 'out') return 'front';
  return p.kind === 'view' ? 'top' : 'back';
}

const FRAME: Record<Face, { normal: Vec3; euler: Vec3 }> = {
  front: { normal: [0, 0, 1], euler: [0, 0, 0] },
  back: { normal: [0, 0, -1], euler: [0, Math.PI, 0] },
  top: { normal: [0, 1, 0], euler: [-Math.PI / 2, 0, 0] },
};

export function socketRadius(kind: PortKind | undefined): number {
  return kind === 'cable' ? 0.2 : 0.13;
}

/** Block-local socket placement; ports sharing a face are spread across it in a grid. */
export function socketLocal(block: BlockSpec, portName: string): SocketPlacement | null {
  const port = block.ports.find((p) => p.name === portName);
  if (!port) return null;
  const face = portFace(port);
  const list = block.ports.filter((p) => portFace(p) === face);
  const n = Math.max(1, list.length);
  const i = Math.max(0, list.indexOf(port));
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const span = CUBE * 0.78;
  const u = (col - (cols - 1) / 2) * (span / cols);
  const v = ((rows - 1) / 2 - row) * (span / Math.max(rows, 1));
  const h = CUBE / 2;
  const pos: Vec3 =
    face === 'front' ? [u, CUBE_Y + v, h] : face === 'back' ? [-u, CUBE_Y + v, -h] : [u, CUBE_Y + h, -v];
  return { pos, ...FRAME[face], face, female: port.side === 'in', radius: socketRadius(port.kind) };
}

/** World-space socket anchor for a block standing at floor position `at` = [x, z]. */
export function socketAt(block: BlockSpec, at: [number, number], portName: string): { pos: Vec3; normal: Vec3 } | null {
  const p = socketLocal(block, portName);
  if (!p) return null;
  return { pos: [at[0] + p.pos[0], p.pos[1], at[1] + p.pos[2]], normal: p.normal };
}
