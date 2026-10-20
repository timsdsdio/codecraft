// The game: owns the world, the player, the inventory and achievements, runs the frame loop, and
// tells the React UI when something it shows has changed.
import * as THREE from 'three';
import type { Multivector } from '@codecraft/ga';
import { Achievements, type Achievement, type GameEvent, type Op } from './achievements';
import { parts, toWorld } from './glyph';
import { Inventory, HOTBAR, element, itemName } from './items';
import { Player, raycast, type Hit } from './player';
import { Renderer } from './render';
import { World, blockFor, blockName, drop } from './world';

/** pointer lock returns a promise in newer browsers and nothing in older ones; either may refuse */
function lock(el: HTMLElement) {
  try {
    (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    // not allowed here (e.g. in an iframe without permission): the game still runs, unlocked
  }
}

export type Screen = 'start' | 'play' | 'inventory' | 'bench' | 'achievements';

const SAVE_KEY = 'bladecraft.save.v1';
const PUSH = 2.5; // blocks per second per unit of vector
const SPIN = 1.5; // radians per second per unit of e₁₂

export interface Toast {
  id: number;
  achievement: Achievement;
}

export function apply(op: Op, a: Multivector, b: Multivector | null): Multivector | null {
  if (op === 'reverse') return a.reverse();
  if (!b) return null;
  switch (op) {
    case 'add':
      return a.add(b);
    case 'sub':
      return a.sub(b);
    case 'wedge':
      return a.op(b);
    case 'product':
      return a.gp(b);
    case 'contract':
      return a.lc(b);
    case 'sandwich':
      return a.sandwich(b);
  }
}

export class Game {
  world: World;
  player = new Player();
  inventory = new Inventory();
  achievements = new Achievements();
  selected = 0;
  screen: Screen = 'start';
  target: Hit | null = null;
  toasts: Toast[] = [];
  /** inventory slots in the bench's A and B inputs */
  bench: [number | null, number | null] = [null, null];
  readonly touch = matchMedia('(pointer: coarse)').matches;

  private renderer: Renderer;
  private listeners = new Set<() => void>();
  version = 0;
  private keys = new Set<string>();
  /** touch joystick, −1..1 */
  stick = { forward: 0, right: 0 };
  wantJump = false;
  private dirty = false;
  private lastSave = 0;
  private toastId = 0;
  private targetName = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = this.load() ?? this.fresh();
    this.bindInput(canvas);
    addEventListener('resize', this.resize);
    addEventListener('pagehide', () => this.save());
    this.resize();
    let last = performance.now();
    this.renderer.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.frame(dt, now);
    });
  }

  // --- React glue ------------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.dirty = true;
    this.listeners.forEach((f) => f());
  }

  get targetLabel() {
    return this.targetName;
  }

  // --- world lifecycle -------------------------------------------------------------------------

  private fresh() {
    this.inventory = new Inventory();
    this.inventory.add({ kind: 'bench' }, 1);
    this.inventory.add({ kind: 'lattice' }, 32);
    this.achievements = new Achievements();
    this.player = new Player();
    this.selected = 0;
    return World.generate();
  }

  newWorld() {
    this.world = this.fresh();
    this.bench = [null, null];
    this.save();
    this.changed();
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const world = World.load(s.world);
      this.inventory.load(s.inventory);
      this.achievements.load(s.achievements ?? []);
      this.player.pos.set(...(s.player.pos as [number, number, number]));
      this.player.yaw = s.player.yaw;
      this.player.pitch = s.player.pitch;
      this.selected = s.selected ?? 0;
      return world;
    } catch {
      return null;
    }
  }

  save() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          world: this.world.save(),
          inventory: this.inventory.save(),
          achievements: this.achievements.save(),
          player: { pos: this.player.pos.toArray(), yaw: this.player.yaw, pitch: this.player.pitch },
          selected: this.selected,
        }),
      );
      this.dirty = false;
    } catch {
      // storage full or blocked: the game keeps going, unsaved
    }
  }

  // --- events and achievements -----------------------------------------------------------------

  emit(e: GameEvent) {
    const fresh = this.achievements.notice(e);
    for (const achievement of fresh) {
      const id = ++this.toastId;
      this.toasts = [...this.toasts, { id, achievement }];
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
        this.changed();
      }, 5000);
    }
    if (fresh.length) this.changed();
  }

  private inventoryChanged() {
    this.emit({ type: 'inventory', elements: this.inventory.elements() });
    this.changed();
  }

  // --- actions ---------------------------------------------------------------------------------

  open(screen: Screen) {
    this.screen = screen;
    if (screen !== 'play' && document.pointerLockElement) document.exitPointerLock();
    if (screen !== 'bench') this.bench = [null, null];
    this.keys.clear();
    this.stick = { forward: 0, right: 0 };
    this.changed();
  }

  play(canvas?: HTMLCanvasElement) {
    this.open('play');
    if (!this.touch) lock(canvas ?? this.renderer.renderer.domElement);
  }

  select(slot: number) {
    this.selected = ((slot % HOTBAR) + HOTBAR) % HOTBAR;
    this.changed();
  }

  breakBlock() {
    const t = this.target;
    if (!t) return;
    const b = this.world.get(...t.block);
    if (!b) return;
    this.world.set(...t.block, null);
    this.inventory.add(drop(b));
    this.emit({ type: 'break', block: b });
    this.inventoryChanged();
  }

  /** right click / tap: open a bench, otherwise place the selected item */
  use() {
    const t = this.target;
    if (!t) return;
    if (this.world.get(...t.block)?.kind === 'bench') return this.open('bench');
    const stack = this.inventory.slots[this.selected];
    if (!stack) return;
    const [x, y, z] = t.before;
    if (this.player.occupies(x, y, z) || this.world.solid(x, y, z)) return;
    const item = this.inventory.take(this.selected)!;
    const block = blockFor(item);
    this.world.set(x, y, z, block);
    this.emit({ type: 'place', block });
    this.inventoryChanged();
  }

  /** put an inventory slot into the next free bench input (A, then B) */
  benchPut(slot: number) {
    const [a, b] = this.bench;
    if (this.inventory.slots[slot]?.item.kind !== 'element') return;
    if (a === null) this.bench = [slot, b];
    else if (b === null) this.bench = [a, slot];
    else this.bench = [b, slot];
    this.changed();
  }

  benchClear(which: 0 | 1) {
    const next: [number | null, number | null] = [...this.bench];
    next[which] = null;
    this.bench = next;
    this.changed();
  }

  benchInputs() {
    return this.bench.map((s) => {
      const it = s === null ? null : this.inventory.slots[s]?.item;
      return it?.kind === 'element' ? it.mv : null;
    }) as [Multivector | null, Multivector | null];
  }

  craft(op: Op) {
    const [a, b] = this.benchInputs();
    if (!a) return;
    const result = apply(op, a, b);
    if (!result) return;
    this.emit({ type: 'craft', op, a, b, result });
    if (result.isZero()) return this.changed();
    const [sa, sb] = this.bench;
    // the same slot in both inputs needs two of that item
    const need = op !== 'reverse' && sa === sb ? 2 : 1;
    if ((this.inventory.slots[sa!]?.count ?? 0) < need) return;
    this.inventory.take(sa!);
    if (op !== 'reverse' && sb !== null) this.inventory.take(sb);
    this.inventory.add(element(result));
    // inputs that ran out leave the bench
    this.bench = this.bench.map((s) => (s !== null && this.inventory.slots[s]?.item.kind === 'element' ? s : null)) as typeof this.bench;
    this.inventoryChanged();
  }

  swap(a: number, b: number) {
    this.inventory.swap(a, b);
    this.changed();
  }

  // --- frame -----------------------------------------------------------------------------------

  private frame(dt: number, now: number) {
    if (this.screen === 'play') {
      const move = {
        forward: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + this.stick.forward,
        right: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.stick.right,
      };
      this.machines(dt);
      this.player.step(this.world, dt, move, this.keys.has('Space') || this.wantJump);
    }
    const eye = this.player.eye();
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.lookAt(eye.clone().add(this.player.look()));
    this.target = raycast(this.world, eye, this.player.look());
    this.renderer.select(this.target?.block ?? null);
    const name = this.target ? blockName(this.world.get(...this.target.block)!) : '';
    if (name !== this.targetName) {
      this.targetName = name;
      this.changed();
    }
    this.renderer.sync(this.world);
    this.renderer.render(dt);
    if (this.dirty && now - this.lastSave > 5000) {
      this.lastSave = now;
      this.save();
    }
  }

  /** what the block underfoot does: see the 'machine' achievement for the rules in words */
  private machines(dt: number) {
    const at = this.player.below();
    const b = at && this.world.get(...at);
    if (!at || b?.kind !== 'element') return;
    const p = parts(b.mv);
    const [east, north, up] = p.vector;
    if (east || north) {
      this.player.carry.add(toWorld(east, north, 0).multiplyScalar(PUSH));
      this.emit({ type: 'ride', effect: 'push' });
    }
    const lift = Math.max(0, p.scalar) + Math.max(0, up);
    if (lift > 0) {
      this.player.jump(Math.min(18, 7 * Math.sqrt(lift)));
      this.emit({ type: 'ride', effect: 'bounce' });
    }
    const turn = p.normal[2]; // the e₁₂ coefficient: rotation in the floor plane
    if (turn) {
      const angle = turn * SPIN * dt; // counter-clockwise from above for +e₁₂: east toward north
      const centre = new THREE.Vector3(at[0] + 0.5, 0, at[2] + 0.5);
      const offset = new THREE.Vector3(this.player.pos.x - centre.x, 0, this.player.pos.z - centre.z);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.player.carry.add(new THREE.Vector3(centre.x + offset.x - this.player.pos.x, 0, centre.z + offset.z - this.player.pos.z).divideScalar(dt));
      this.player.yaw += angle;
      this.emit({ type: 'ride', effect: 'spin' });
    }
  }

  // --- input -----------------------------------------------------------------------------------

  private resize = () => this.renderer.resize(innerWidth, innerHeight);

  private bindInput(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') return this.open(this.screen === 'inventory' ? 'play' : 'inventory');
      if (e.code === 'KeyL') return this.open(this.screen === 'achievements' ? 'play' : 'achievements');
      if (e.code === 'Escape' && this.screen !== 'play' && this.screen !== 'start') return this.open('play');
      if (this.screen !== 'play') return;
      if (/^Digit[1-9]$/.test(e.code)) this.select(Number(e.code.slice(5)) - 1);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // mouse (desktop): pointer lock for looking, left breaks, right uses
    canvas.addEventListener('click', () => {
      if (!this.touch && this.screen === 'play' && !document.pointerLockElement) lock(canvas);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.screen === 'play' && !this.touch) this.open('start');
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.turn(e.movementX * 0.0025, e.movementY * 0.0025);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) this.use();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        if (this.screen === 'play') this.select(this.selected + Math.sign(e.deltaY));
      },
      { passive: true },
    );
  }

  /** look by an amount of radians (mouse or touch drag) */
  turn(dx: number, dy: number) {
    this.player.yaw -= dx;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - dy));
  }

  /** for the debug readout and tests */
  get state() {
    return {
      pos: this.player.pos.toArray().map((v) => +v.toFixed(2)),
      target: this.target?.block ?? null,
      held: this.inventory.slots[this.selected] ? itemName(this.inventory.slots[this.selected]!.item) : null,
    };
  }
}
