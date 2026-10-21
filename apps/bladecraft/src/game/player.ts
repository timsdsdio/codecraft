// First-person body: an axis-aligned box that walks, jumps and falls, resolved against the voxel
// grid one axis at a time. Positions are in blocks; `pos` is the middle of the feet. Blocks lower
// than half a block (ducts) are stepped onto rather than walked into.
import * as THREE from 'three';
import { SPAWN, heightOf, type Dir, type World } from './world';

const HALF = 0.3;
const TALL = 1.8;
export const EYE = 1.62;
const GRAVITY = 26;
const JUMP = 8.2;
const WALK = 4.6;
const STEP_UP = 0.5;

export class Player {
  pos = new THREE.Vector3(...SPAWN);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = -0.25;
  onGround = false;

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  look(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** the horizontal direction the player faces */
  facing(): Dir {
    const x = -Math.sin(this.yaw);
    const z = -Math.cos(this.yaw);
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 0 : 2;
    return z < 0 ? 1 : 3;
  }

  /** move: forward/right in −1..1, relative to where the player faces */
  step(world: World, dt: number, move: { forward: number; right: number }, wantJump: boolean) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const len = Math.max(1, Math.hypot(move.forward, move.right));
    const f = move.forward / len;
    const r = move.right / len;
    this.vel.x = (-sin * f + cos * r) * WALK;
    this.vel.z = (-cos * f - sin * r) * WALK;
    this.vel.y -= GRAVITY * dt;
    if (wantJump && this.onGround) this.jump();

    const grounded = this.onGround;
    this.onGround = false;
    this.moveAxis(world, 'x', this.vel.x * dt, grounded);
    this.moveAxis(world, 'z', this.vel.z * dt, grounded);
    this.moveAxis(world, 'y', this.vel.y * dt, grounded);
    if (this.pos.y < -24) this.respawn();
  }

  jump(speed = JUMP) {
    this.vel.y = speed;
    this.onGround = false;
  }

  respawn() {
    this.pos.set(SPAWN[0], SPAWN[1] + 2, SPAWN[2]);
    this.vel.set(0, 0, 0);
  }

  /** the first block the body overlaps, with that block's top */
  private overlap(world: World) {
    const box = this.bounds();
    for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x - 1e-9); x++)
      for (let y = Math.floor(box.min.y); y <= Math.floor(box.max.y - 1e-9); y++)
        for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z - 1e-9); z++) {
          const h = heightOf(world.get(x, y, z));
          if (h && box.min.y < y + h - 1e-6) return { x, y, z, top: y + h };
        }
    return null;
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', d: number, grounded: boolean) {
    if (!d) return;
    this.pos[axis] += d;
    const hit = this.overlap(world);
    if (!hit) return;
    if (axis === 'y') {
      if (d < 0) {
        this.pos.y = hit.top;
        this.onGround = true;
      } else this.pos.y = hit.y - TALL - 1e-4;
      this.vel.y = 0;
      return;
    }
    // a low block in the way: step up onto it if there's headroom
    if (grounded && hit.top - this.pos.y <= STEP_UP) {
      const y = this.pos.y;
      this.pos.y = hit.top + 1e-4;
      if (!this.overlap(world)) {
        this.onGround = true;
        return;
      }
      this.pos.y = y;
    }
    const cell = axis === 'x' ? hit.x : hit.z;
    this.pos[axis] = d > 0 ? cell - HALF - 1e-4 : cell + 1 + HALF + 1e-4;
    this.vel[axis] = 0;
  }

  bounds() {
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x - HALF, this.pos.y, this.pos.z - HALF),
      new THREE.Vector3(this.pos.x + HALF, this.pos.y + TALL, this.pos.z + HALF),
    );
  }

  /** would a block at (x, y, z) overlap the body? */
  occupies(x: number, y: number, z: number) {
    return this.bounds().intersectsBox(new THREE.Box3(new THREE.Vector3(x, y, z), new THREE.Vector3(x + 1, y + 1, z + 1)));
  }
}

export interface Hit {
  block: [number, number, number];
  /** the empty cell in front of the face that was hit, where a new block would go */
  before: [number, number, number];
}

/** walks the grid along a ray (Amanatides & Woo) and returns the first block within reach */
export function raycast(world: World, from: THREE.Vector3, dir: THREE.Vector3, reach = 6): Hit | null {
  const cell = [Math.floor(from.x), Math.floor(from.y), Math.floor(from.z)];
  const d = [dir.x, dir.y, dir.z];
  const o = [from.x, from.y, from.z];
  const step = d.map(Math.sign);
  const tMax = d.map((v, i) => (v === 0 ? Infinity : ((v > 0 ? cell[i] + 1 : cell[i]) - o[i]) / v));
  const tDelta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  let prev = [...cell];
  for (let t = 0; t <= reach; ) {
    if (world.solid(cell[0], cell[1], cell[2])) return { block: cell as Hit['block'], before: prev as Hit['before'] };
    prev = [...cell];
    const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    t = tMax[i];
    cell[i] += step[i];
    tMax[i] += tDelta[i];
  }
  return null;
}
