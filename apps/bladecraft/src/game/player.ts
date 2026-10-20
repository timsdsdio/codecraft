// First-person body: an axis-aligned box that walks, jumps and falls, resolved against the voxel
// grid one axis at a time. Positions are in blocks; `pos` is the middle of the feet.
import * as THREE from 'three';
import { GROUND, SIZE, type World } from './world';

const HALF = 0.3;
const TALL = 1.8;
export const EYE = 1.62;
const GRAVITY = 26;
const JUMP = 8.2;
const WALK = 4.6;

export class Player {
  pos = new THREE.Vector3(SIZE / 2 + 0.5, GROUND, SIZE / 2 + 0.5);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = -0.2;
  onGround = false;
  /** velocity added this frame by machines (a vector block underfoot); not kept between frames */
  carry = new THREE.Vector3();

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  look(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** the block under the feet, if standing */
  below(): [number, number, number] | null {
    return this.onGround ? [Math.floor(this.pos.x), Math.floor(this.pos.y - 0.01), Math.floor(this.pos.z)] : null;
  }

  jump(speed = JUMP) {
    this.vel.y = speed;
    this.onGround = false;
  }

  /** move: forward/right in −1..1, relative to where the player faces */
  step(world: World, dt: number, move: { forward: number; right: number }, wantJump: boolean) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const len = Math.min(1, Math.hypot(move.forward, move.right));
    const f = len ? move.forward / Math.max(1, Math.hypot(move.forward, move.right)) : 0;
    const r = len ? move.right / Math.max(1, Math.hypot(move.forward, move.right)) : 0;
    this.vel.x = (-sin * f + cos * r) * WALK;
    this.vel.z = (-cos * f - sin * r) * WALK;
    this.vel.y -= GRAVITY * dt;
    if (wantJump && this.onGround) this.jump();

    const dx = (this.vel.x + this.carry.x) * dt;
    const dy = (this.vel.y + this.carry.y) * dt;
    const dz = (this.vel.z + this.carry.z) * dt;
    this.onGround = false;
    this.moveAxis(world, 'x', dx);
    this.moveAxis(world, 'z', dz);
    this.moveAxis(world, 'y', dy);
    this.carry.set(0, 0, 0);

    if (this.pos.y < -24) this.respawn();
  }

  respawn() {
    this.pos.set(SIZE / 2 + 0.5, GROUND + 4, SIZE / 2 + 0.5);
    this.vel.set(0, 0, 0);
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', d: number) {
    if (!d) return;
    this.pos[axis] += d;
    const box = this.bounds();
    for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x - 1e-9); x++)
      for (let y = Math.floor(box.min.y); y <= Math.floor(box.max.y - 1e-9); y++)
        for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z - 1e-9); z++) {
          if (!world.solid(x, y, z)) continue;
          const cell = { x, y, z }[axis];
          if (axis === 'y') {
            if (d < 0) {
              this.pos.y = cell + 1;
              this.onGround = true;
            } else this.pos.y = cell - TALL - 1e-4;
          } else this.pos[axis] = d > 0 ? cell - HALF - 1e-4 : cell + 1 + HALF + 1e-4;
          this.vel[axis] = 0;
          return;
        }
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

/** walks the grid along a ray (Amanatides & Woo) and returns the first solid block within reach */
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
