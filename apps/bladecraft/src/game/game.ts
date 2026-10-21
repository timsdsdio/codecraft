// The game: owns the world, the player, the inventory, the factory and achievements, runs the frame
// loop, and tells the React UI when something it shows has changed.
import type { Multivector } from '@codecraft/ga';
import { Achievements, type GameEvent } from './achievements';
import { Factory } from './factory';
import { guide } from './guide';
import { Inventory, HOTBAR, element, itemName, placeable, type Item } from './items';
import { apply, type Op } from './ops';
import { ORDERS } from './orders';
import { Player, raycast, type Hit } from './player';
import { GATES, bloch, type GateId } from './qubit';
import { build, type Recipe } from './recipes';
import { Renderer } from './render';
import { HUB, SINGLE_INPUT, STEP, World, blockName, contents, drop, newMachine, opposite, usable, DIR_NAMES, type Block, type Dir, type Machine } from './world';

/** pointer lock returns a promise in newer browsers and nothing in older ones; either may refuse */
function lock(el: HTMLElement) {
  try {
    (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    // not allowed here (e.g. in an iframe without permission): the game still runs, unlocked
  }
}

export type Screen = 'start' | 'play' | 'inventory' | 'bench' | 'machine' | 'hub' | 'achievements';

const SAVE_KEY = 'bladecraft.save.v2';
const MINE_COOLDOWN = 250; // ms between elements taken from a deposit by hand

export interface Toast {
  id: number;
  title: string;
  kind: 'achievement' | 'order' | 'note';
}

export interface Prompt {
  /** what the crosshair is on */
  name: string;
  /** what the buttons would do, e.g. "Break: take one e₁" */
  actions: string[];
}

export class Game {
  world: World;
  player = new Player();
  inventory = new Inventory();
  achievements = new Achievements();
  factory: Factory;
  selected = 0;
  screen: Screen = 'start';
  target: Hit | null = null;
  toasts: Toast[] = [];
  /** quarter turns added to the player's facing when placing */
  turn = 0;
  /** the block whose panel is open (machine or hub screens) */
  panel: [number, number, number] | null = null;
  /** inventory slots in the bench's A and B inputs */
  bench: [number | null, number | null] = [null, null];
  /** anything has ever reached the hub */
  delivered = false;
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
  private lastMine = 0;
  private toastId = 0;
  private promptKey = '';
  prompt: Prompt | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = World.generate();
    this.factory = this.makeFactory({ order: 0, delivered: 0 });
    if (!this.load()) this.fresh();
    this.bindInput(canvas);
    addEventListener('resize', this.resize);
    addEventListener('pagehide', () => this.save());
    this.resize();
    let last = performance.now();
    this.renderer.renderer.setAnimationLoop((now) => {
      // the factory keeps real time on a slow device; movement steps are kept short so collisions hold
      const elapsed = Math.min((now - last) / 1000, 0.25);
      last = now;
      this.frame(elapsed, now);
    });
  }

  // --- React glue ------------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    this.dirty = true;
    this.listeners.forEach((f) => f());
  }

  get guide() {
    return guide({ world: this.world, inventory: this.inventory, hub: this.factory.hub, delivered: this.delivered });
  }

  // --- world lifecycle -------------------------------------------------------------------------

  private makeFactory(hub: { order: number; delivered: number }) {
    return new Factory(this.world, hub, {
      craft: (op, a, b, result) => result && this.emit({ type: 'craft', by: 'machine', op, a, b, result }),
      deliver: (mv) => {
        if (!this.delivered) {
          this.delivered = true;
          this.changed();
        }
        this.emit({ type: 'deliver', mv });
        if (this.screen === 'hub' || this.screen === 'play') this.changed();
      },
      qubit: (kind, input, result) => this.emit({ type: 'qubit', kind, input, result }),
      orrery: (seen) => this.emit({ type: 'orrery', seen }),
      orderDone: (order, next) => {
        this.inventory.add({ kind: 'lattice' }, 16);
        this.toast(next ? `Order done: ${order.want}. Next: ${next.want}` : `All ${ORDERS.length} orders done!`, 'order');
        this.emit({ type: 'order', index: this.factory.hub.order - 1 });
        this.changed();
      },
    });
  }

  private fresh() {
    this.world = World.generate();
    this.inventory = new Inventory();
    this.inventory.add({ kind: 'bench' }, 1);
    this.inventory.add({ kind: 'lattice' }, 32);
    this.achievements = new Achievements();
    this.player = new Player();
    this.selected = 0;
    this.turn = 0;
    this.delivered = false;
    this.factory = this.makeFactory({ order: 0, delivered: 0 });
  }

  newWorld() {
    this.fresh();
    this.bench = [null, null];
    this.save();
    this.changed();
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.world = World.load(s.world);
      this.inventory.load(s.inventory);
      this.achievements.load(s.achievements ?? []);
      this.player.pos.set(...(s.player.pos as [number, number, number]));
      this.player.yaw = s.player.yaw;
      this.player.pitch = s.player.pitch;
      this.selected = s.selected ?? 0;
      this.delivered = !!s.delivered;
      this.factory = this.makeFactory(s.hub ?? { order: 0, delivered: 0 });
      return true;
    } catch {
      return false;
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
          hub: this.factory.hub,
          delivered: this.delivered,
        }),
      );
      this.dirty = false;
    } catch {
      // storage full or blocked: the game keeps going, unsaved
    }
  }

  // --- events, achievements, toasts ------------------------------------------------------------

  emit(e: GameEvent) {
    const fresh = this.achievements.notice(e);
    for (const a of fresh) this.toast(a.title, 'achievement');
    if (fresh.length) this.changed();
  }

  toast(title: string, kind: Toast['kind'] = 'note') {
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, title, kind }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.changed();
    }, kind === 'note' ? 3500 : 5000);
    this.changed();
  }

  private inventoryChanged() {
    this.emit({ type: 'inventory', elements: this.inventory.elements() });
    this.changed();
  }

  // --- screens ---------------------------------------------------------------------------------

  open(screen: Screen) {
    this.screen = screen;
    if (screen !== 'play' && document.pointerLockElement) document.exitPointerLock();
    if (screen !== 'bench') this.bench = [null, null];
    if (screen !== 'machine' && screen !== 'hub') this.panel = null;
    this.keys.clear();
    this.stick = { forward: 0, right: 0 };
    this.wantJump = false;
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

  get held(): Item | null {
    return this.inventory.slots[this.selected]?.item ?? null;
  }

  // --- acting on the world ---------------------------------------------------------------------

  get targetBlock(): Block | undefined {
    return this.target ? this.world.get(...this.target.block) : undefined;
  }

  breakBlock() {
    const t = this.target;
    const b = this.targetBlock;
    if (!t || !b) return;
    if (b.kind === 'hub') return this.toast('The hub can’t be broken.');
    if (b.kind === 'deposit') {
      const now = performance.now();
      if (now - this.lastMine < MINE_COOLDOWN) return;
      this.lastMine = now;
      this.inventory.add(element(b.mv));
      this.emit({ type: 'break', block: b });
      return this.inventoryChanged();
    }
    this.world.set(...t.block, null);
    const d = drop(b);
    if (d) this.inventory.add(d);
    if (b.kind === 'machine') for (const mv of contents(b)) this.inventory.add(element(mv));
    this.emit({ type: 'break', block: b });
    this.inventoryChanged();
  }

  /** right click or the Use button: open a usable block, otherwise place the held item */
  use() {
    const b = this.targetBlock;
    if (b && usable(b)) {
      if (b.kind === 'bench') return this.open('bench');
      this.panel = this.target!.block;
      return this.open(b.kind === 'hub' ? 'hub' : 'machine');
    }
    this.place();
  }

  /** where and which way the held item would go, and whether it can */
  placement(): { cell: [number, number, number]; facing: Dir | null; ok: boolean } | null {
    const t = this.target;
    const item = this.held;
    if (!t || !item || !placeable(item)) return null;
    const cell = t.before;
    const ok = !this.world.solid(...cell) && !this.player.occupies(...cell) && cell[1] < 31;
    if (item.kind !== 'machine') return { cell, facing: null, ok };
    return { cell, facing: this.facingFor(item.type, cell), ok };
  }

  private facingFor(type: string, cell: [number, number, number]): Dir {
    if (type === 'extractor') {
      // back against a deposit: the one aimed at first, then any neighbour
      const [bx, , bz] = this.target!.block;
      const candidates: Dir[] = [0, 1, 2, 3];
      for (const d of candidates) {
        const [dx, dz] = STEP[d];
        if (cell[0] + dx === bx && cell[2] + dz === bz && this.world.get(bx, cell[1], bz)?.kind === 'deposit') return opposite(d);
      }
      for (const d of candidates) {
        const [dx, dz] = STEP[d];
        if (this.world.get(cell[0] + dx, cell[1], cell[2] + dz)?.kind === 'deposit') return opposite(d);
      }
    }
    return ((this.player.facing() + this.turn) % 4) as Dir;
  }

  place() {
    const p = this.placement();
    const item = this.held;
    if (!p || !item) {
      if (item?.kind === 'element') this.toast('Elements go into machines: open a machine to set its B, or feed it by duct.');
      return;
    }
    if (!p.ok) return;
    this.inventory.take(this.selected);
    const block: Block = item.kind === 'machine' ? newMachine(item.type, p.facing!) : (item as Block);
    this.world.set(...p.cell, block);
    this.emit({ type: 'place', block });
    this.inventoryChanged();
  }

  rotate() {
    this.turn = (this.turn + 1) % 4;
    this.changed();
  }

  // --- bench -----------------------------------------------------------------------------------

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
    this.emit({ type: 'craft', by: 'hand', op, a, b, result });
    if (result.isZero()) return this.changed();
    const [sa, sb] = this.bench;
    const need = op !== 'reverse' && sa === sb ? 2 : 1;
    if ((this.inventory.slots[sa!]?.count ?? 0) < need) return;
    this.inventory.take(sa!);
    if (op !== 'reverse' && sb !== null) this.inventory.take(sb);
    this.inventory.add(element(result));
    this.bench = this.bench.map((s) => (s !== null && this.inventory.slots[s]?.item.kind === 'element' ? s : null)) as typeof this.bench;
    this.inventoryChanged();
  }

  buildMachine(r: Recipe) {
    if (!build(this.inventory, r)) return;
    this.toast(`Built ${r.count > 1 ? `${r.count} × ` : ''}${itemName({ kind: 'machine', type: r.makes })}`);
    this.emit({ type: 'build', machine: r.makes });
    this.bench = [null, null];
    this.inventoryChanged();
  }

  // --- machine panels --------------------------------------------------------------------------

  get panelBlock(): Block | undefined {
    return this.panel ? this.world.get(...this.panel) : undefined;
  }

  /** set an operation machine's fixed B from an inventory slot; the previous one comes back unless it was a preset gate */
  setFixed(slot: number | null) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || !('fixed' in m)) return;
    if (m.fixed && !m.preset) this.inventory.add(element(m.fixed));
    m.fixed = null;
    m.preset = null;
    if (slot !== null) {
      const it = this.inventory.take(slot);
      if (it?.kind === 'element') {
        m.fixed = it.mv;
        // anything waiting in B would never be used now
        if (m.b) this.inventory.add(element(m.b));
        m.b = null;
      }
    }
    this.inventoryChanged();
  }

  /** set a gate machine to one of the preset gates, which cost nothing */
  setGate(id: GateId) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'gate') return;
    this.setFixed(null);
    m.fixed = GATES[id].rotor;
    m.preset = id;
    if (m.b) this.inventory.add(element(m.b));
    m.b = null;
    this.changed();
  }

  clearOrrery() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'orrery') return;
    m.seen = [];
    this.changed();
  }

  rotatePanel() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || !this.panel) return;
    m.facing = ((m.facing + 1) % 4) as Dir;
    this.world.set(...this.panel, m); // re-set so the renderer redraws it
    this.changed();
  }

  takeCollected() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'collector') return;
    for (const s of m.stored) this.inventory.add(element(s.mv), s.count);
    m.stored = [];
    this.inventoryChanged();
  }

  swap(a: number, b: number) {
    this.inventory.swap(a, b);
    this.changed();
  }

  shuttle(slot: number) {
    this.inventory.shuttle(slot, this.selected);
    this.changed();
  }

  // --- frame -----------------------------------------------------------------------------------

  private frame(elapsed: number, now: number) {
    const dt = Math.min(elapsed, 0.05);
    if (this.screen === 'play') {
      const move = {
        forward: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + this.stick.forward,
        right: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.stick.right,
      };
      this.player.step(this.world, dt, move, this.keys.has('Space') || this.wantJump);
    }
    this.factory.step(elapsed);
    const eye = this.player.eye();
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.lookAt(eye.clone().add(this.player.look()));
    this.target = raycast(this.world, eye, this.player.look());
    this.renderer.select(this.target?.block ?? null);
    const p = this.screen === 'play' ? this.placement() : null;
    this.renderer.preview(p?.cell ?? null, p?.facing ?? null, p?.ok ?? false);
    // a count that only goes up: orders completed and elements toward the current one
    const order = this.factory.order;
    // a state order shows where the state should point
    const shows = order ? ((order.kind ?? 'exact') === 'exact' ? order.want : bloch(order.want)) : null;
    this.renderer.hubWants(HUB, shows, this.factory.hub.order * 1000 + this.factory.hub.delivered);
    this.updatePrompt(p);
    this.renderer.sync(this.world);
    this.renderer.render(dt);
    // open panels show live contents
    if ((this.screen === 'machine' || this.screen === 'hub') && Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) this.changed();
    if (this.dirty && now - this.lastSave > 5000) {
      this.lastSave = now;
      this.save();
    }
  }

  private updatePrompt(p: ReturnType<Game['placement']>) {
    const b = this.targetBlock;
    let prompt: Prompt | null = null;
    if (b) {
      const actions: string[] = [];
      if (b.kind === 'deposit') actions.push(`Break: take one ${b.mv}`);
      else if (b.kind !== 'hub') actions.push('Break: pick up');
      if (usable(b)) actions.push(b.kind === 'hub' ? 'Use: see orders' : 'Use: open');
      const item = this.held;
      if (p && item) actions.push(`Place: ${itemName(item)}${p.facing !== null ? ` facing ${DIR_NAMES[p.facing]}` : ''}`);
      prompt = { name: describeBlock(b, this.world, this.target!.block), actions };
    }
    const key = JSON.stringify(prompt);
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt = prompt;
      this.changed();
    }
  }

  // --- input -----------------------------------------------------------------------------------

  private resize = () => this.renderer.resize(innerWidth, innerHeight);

  private bindInput(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') return this.open(this.screen === 'inventory' ? 'play' : 'inventory');
      if (e.code === 'KeyL') return this.open(this.screen === 'achievements' ? 'play' : 'achievements');
      if (e.code === 'Escape' && this.screen !== 'play' && this.screen !== 'start') return this.play();
      if (this.screen !== 'play') return;
      if (/^Digit[1-9]$/.test(e.code)) this.select(Number(e.code.slice(5)) - 1);
      if (e.code === 'KeyR') this.rotate();
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.touch && this.screen === 'play' && !document.pointerLockElement) lock(canvas);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.screen === 'play' && !this.touch) this.open('start');
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.turnView(e.movementX * 0.0025, e.movementY * 0.0025);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) {
        if (e.shiftKey) this.place();
        else this.use();
      }
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
  turnView(dx: number, dy: number) {
    this.player.yaw -= dx;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - dy));
  }

  /** for tests and the console */
  get state() {
    return {
      pos: this.player.pos.toArray().map((v) => +v.toFixed(2)),
      target: this.target?.block ?? null,
      held: this.held ? itemName(this.held) : null,
      hub: { ...this.factory.hub },
    };
  }
}

/** what the crosshair shows for a block: its name and, for machines, what it holds or lacks */
function describeBlock(b: Block, world: World, at: [number, number, number]) {
  const name = blockName(b);
  if (b.kind !== 'machine') return name;
  return `${name} facing ${DIR_NAMES[b.facing]}${machineNote(b, world, at)}`;
}

function machineNote(m: Machine, world: World, [x, y, z]: [number, number, number]) {
  if (m.type === 'extractor') {
    const [dx, dz] = STEP[opposite(m.facing)];
    return world.get(x + dx, y, z + dz)?.kind === 'deposit' ? '' : ' · no deposit behind it';
  }
  if (m.type === 'collector') return ` · holds ${m.stored.reduce((n, s) => n + s.count, 0)}`;
  if (m.type === 'duct') return '';
  if (m.type === 'orrery') return ` · ${m.seen.length} fiber${m.seen.length === 1 ? '' : 's'} shown`;
  if (SINGLE_INPUT.includes(m.type)) return ` · A ${m.a ?? 'empty'}`;
  const b = m.preset ? `gate ${m.preset}` : m.fixed ? `B fixed to ${m.fixed}` : m.b ? `B ${m.b}` : 'B empty';
  return ` · A ${m.a ?? 'empty'} · ${b}`;
}
