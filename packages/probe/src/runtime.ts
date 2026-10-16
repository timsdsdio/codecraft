// Probe runtime. Runs inside the app's page, after the hook stub and before the app. On every React
// commit it walks the fiber tree, builds a Snapshot (components, DOM rects, props, state, scroll
// areas) and a CommitRecord (what rendered and changed), and posts both to the embedding page.
// It also carries out the game's requests: clicks and wheel scrolls at viewport coordinates.
//
// Fiber internals aren't a public API. This targets React 19.
import type { CompNode, ElementInfo, ReadInfo, Rect, ScrollInfo, Snapshot, ValueInfo, ValueKind } from '@codecraft/visuals/2d';
import { SOURCE_GLOBAL, type StaticComponent } from './source';
import { CHANNEL, isGameMessage, type CommitRecord, type Payload, type ProbeMessage } from './protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fiber = any;

const TAG = { Function: 0, Class: 1, HostRoot: 3, Host: 5, Text: 6, ForwardRef: 11, Memo: 14, SimpleMemo: 15 } as const;
const COMPONENT = new Set<number>([TAG.Function, TAG.Class, TAG.ForwardRef, TAG.Memo, TAG.SimpleMemo]);
const PERFORMED_WORK = 1;

// ── identity ──────────────────────────────────────────────────────────────

const ids = new WeakMap<object, string>();
let nextId = 1;
function idOf(f: Fiber): string {
  let id = ids.get(f) ?? (f.alternate ? ids.get(f.alternate) : undefined);
  if (!id) id = `c${nextId++}`;
  ids.set(f, id);
  if (f.alternate) ids.set(f.alternate, id);
  return id;
}

function nameOf(type: any): string {
  if (!type) return 'Anonymous';
  return type.displayName || type.name || type.render?.displayName || type.render?.name || type.type?.displayName || type.type?.name || 'Anonymous';
}

// ── values ────────────────────────────────────────────────────────────────

function kindOf(v: unknown): ValueKind {
  if (v === null || v === undefined) return 'nullish';
  if (Array.isArray(v)) return 'array';
  switch (typeof v) {
    case 'string':
      return 'string';
    case 'number':
    case 'bigint':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'function':
      return 'function';
    case 'object':
      return '$$typeof' in (v as object) ? 'node' : 'object';
    default:
      return 'nullish';
  }
}

function short(v: unknown, depth = 0): string {
  const k = kindOf(v);
  switch (k) {
    case 'string': {
      const s = v as string;
      return JSON.stringify(s.length > 24 ? `${s.slice(0, 23)}…` : s);
    }
    case 'number':
    case 'boolean':
      return String(v);
    case 'nullish':
      return String(v);
    case 'function':
      return `ƒ ${(v as { name?: string }).name || ''}`.trim();
    case 'array':
      return `Array(${(v as unknown[]).length})`;
    case 'node':
      return `<${nameOf((v as { type?: unknown }).type)} />`;
    case 'object': {
      if (depth > 0) return '{…}';
      const entries = Object.entries(v as object);
      const shown = entries.slice(0, 2).map(([key, val]) => `${key}: ${short(val, 1)}`);
      return `{ ${shown.join(', ')}${entries.length > 2 ? ', …' : ''} }`;
    }
  }
}

/** A JSON-safe copy for inspecting: limited depth, list length and string length. */
function copy(v: unknown, depth = 0): unknown {
  switch (kindOf(v)) {
    case 'string':
      return (v as string).length > 200 ? `${(v as string).slice(0, 199)}…` : v;
    case 'number':
    case 'boolean':
      return v;
    case 'nullish':
      return v === undefined ? '(undefined)' : null;
    case 'function':
      return `ƒ ${(v as { name?: string }).name || 'anonymous'}`;
    case 'node':
      return short(v);
    case 'array': {
      if (depth >= 3) return `Array(${(v as unknown[]).length})`;
      const a = (v as unknown[]).slice(0, 20).map((x) => copy(x, depth + 1));
      if ((v as unknown[]).length > 20) a.push(`… ${(v as unknown[]).length - 20} more`);
      return a;
    }
    case 'object': {
      if (depth >= 3) return '{…}';
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as object).slice(0, 20)) o[k] = copy(x, depth + 1);
      return o;
    }
  }
}

const fnIds = new WeakMap<object, number>();
let nextFn = 1;
function fnId(fn: object): number {
  let id = fnIds.get(fn);
  if (!id) fnIds.set(fn, (id = nextFn++));
  return id;
}

/** Where a function prop came from: the state tank it dispatches to, or the component that created it. */
function originOf(fn: unknown, f: Fiber): { component: string; tank?: string } | undefined {
  for (let a = f.return; a; a = a.return) {
    if (!COMPONENT.has(a.tag)) continue;
    let i = 0;
    for (let h = a.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
      const q = h.queue;
      if (q && typeof q.dispatch === 'function' && 'lastRenderedReducer' in q) {
        if (q.dispatch === fn) return { component: idOf(a), tank: `${idOf(a)}:state${i}` };
        i++;
      }
    }
    const passedDown = Object.values((a.memoizedProps ?? {}) as object).some((v) => Object.is(v, fn));
    if (!passedDown) return { component: idOf(a) };
  }
  return undefined;
}

function info(name: string, v: unknown, f?: Fiber): ValueInfo {
  const kind = kindOf(v);
  const out: ValueInfo = { name, kind, preview: short(v), value: copy(v) };
  if (kind === 'array') out.size = (v as unknown[]).length;
  if (kind === 'function') {
    out.fnId = fnId(v as object);
    if (f) out.origin = originOf(v, f);
  }
  return out;
}

function readPath(scope: Record<string, unknown>, path: string): unknown {
  let v: unknown = scope;
  for (const key of path.split('.')) v = v == null ? undefined : (v as Record<string, unknown>)[key];
  return v;
}

// ── hooks ─────────────────────────────────────────────────────────────────

/** State hooks (useState / useReducer) in call order: they're the hooks with a dispatch queue. */
function stateHooks(f: Fiber): unknown[] {
  if (f.tag === TAG.Class) return f.memoizedState ? [f.memoizedState] : [];
  const out: unknown[] = [];
  for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
    const q = h.queue;
    if (q && typeof q.dispatch === 'function' && 'lastRenderedReducer' in q) out.push(h.memoizedState);
  }
  return out;
}

/** Hook variable names, read from the component's source in dev: `const [todos, setTodos] = useState(`. */
const namesCache = new WeakMap<object, string[]>();
function stateNames(type: any): string[] {
  const fn = typeof type === 'function' ? type : type?.render ?? type?.type;
  if (typeof fn !== 'function') return [];
  const hit = namesCache.get(fn);
  if (hit) return hit;
  const names: string[] = [];
  const re = /\[\s*([A-Za-z_$][\w$]*)\s*,\s*[A-Za-z_$][\w$]*\s*\]\s*=\s*(?:\w+\.)?use(?:State|Reducer)\b/g;
  try {
    for (const m of Function.prototype.toString.call(fn).matchAll(re)) names.push(m[1]);
  } catch {
    /* native or proxied function */
  }
  namesCache.set(fn, names);
  return names;
}

// ── DOM ───────────────────────────────────────────────────────────────────

/** The component's top-level DOM elements: descend through components, stop at the first host nodes. */
function topHosts(f: Fiber, out: Element[] = []): Element[] {
  for (let c = f.child; c; c = c.sibling) {
    if (c.tag === TAG.Host) out.push(c.stateNode as Element);
    else if (c.tag !== TAG.Text) topHosts(c, out);
  }
  return out;
}

const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

function union(rs: DOMRect[]): Rect {
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rs) {
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const clips = (el: Element) => {
  const s = getComputedStyle(el);
  return s.overflowX !== 'visible' || s.overflowY !== 'visible';
};

/** Intersection of every clipping ancestor's box (absent when nothing clips). */
function clipOf(el: Element | undefined): Rect | undefined {
  let r: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (let a = el?.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    if (!clips(a)) continue;
    const b = a.getBoundingClientRect();
    r = r
      ? { x0: Math.max(r.x0, b.left), y0: Math.max(r.y0, b.top), x1: Math.min(r.x1, b.right), y1: Math.min(r.y1, b.bottom) }
      : { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
  }
  return r ? { x: r.x0, y: r.y0, w: Math.max(0, r.x1 - r.x0), h: Math.max(0, r.y1 - r.y0) } : undefined;
}

/** Does this element draw anything itself (background, border, text, or a form control)? */
function paints(el: Element): boolean {
  if (/^(INPUT|BUTTON|IMG|SVG|CANVAS|VIDEO|TEXTAREA|SELECT)$/i.test(el.tagName)) return true;
  const s = getComputedStyle(el);
  const bg = s.backgroundColor;
  if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return true;
  if (parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0) return true;
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return true;
  return false;
}

const sourceOf = (name: string): StaticComponent | undefined => (globalThis as any)[SOURCE_GLOBAL]?.[name];

/** element → its id in the latest snapshot (so an event can name the element it started on) */
let elementIds = new WeakMap<Element, string>();

/** Host elements in the component's own JSX that the source analysis says read data or handle events. */
function elementsOf(f: Fiber, id: string, props: Record<string, unknown>, states: unknown[], ids: WeakMap<Element, string>): ElementInfo[] | undefined {
  const src = sourceOf(nameOf(f.type));
  if (!src?.elements.length) return undefined;
  const scope: Record<string, unknown> = { ...props };
  src.state.forEach((s, i) => (scope[s.name] = states[i]));
  const setterTank = new Map(src.state.map((s, i) => [s.setter, `${id}:state${i}`]));
  const read = (path: string): ReadInfo => ({ path, ...info(path, readPath(scope, path)) });

  const out: ElementInfo[] = [];
  const counts = new Map<string, number>();
  const visit = (c: Fiber) => {
    for (; c; c = c.sibling) {
      if (COMPONENT.has(c.tag)) continue;
      if (c.tag === TAG.Host) {
        const el = c.stateNode as Element;
        const cc = el.getAttribute('data-cc');
        const spec = cc ? src.elements.find((e) => e.id === cc) : undefined;
        if (cc && spec) {
          const n = counts.get(cc) ?? 0;
          counts.set(cc, n + 1);
          const eid = `${id}:${cc}:${n}`;
          ids.set(el, eid);
          out.push({
            id: eid,
            tag: spec.tag,
            rect: toRect(el.getBoundingClientRect()),
            clip: clipOf(el),
            slots: spec.slots.map((sl) => ({ name: sl.name, reads: sl.reads.map(read) })),
            handlers: spec.handlers.map((h) => ({
              event: h.event,
              calls: h.calls.map((call) => ({
                fn: call.fn,
                args: call.args.map(read),
                target: setterTank.has(call.fn)
                  ? { component: id, tank: setterTank.get(call.fn) }
                  : typeof props[call.fn] === 'function'
                    ? originOf(props[call.fn], f)
                    : undefined,
              })),
            })),
          });
        }
      }
      visit(c.child);
    }
  };
  visit(f.child);
  return out;
}

function fiberOfElement(el: Element): Fiber | undefined {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  return key ? (el as any)[key] : undefined;
}

function componentAbove(f: Fiber | undefined): Fiber | undefined {
  for (let c = f; c; c = c.return) if (COMPONENT.has(c.tag)) return c;
  return undefined;
}

function scrollAreas(): ScrollInfo[] {
  const out: ScrollInfo[] = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const owner = componentAbove(fiberOfElement(el));
    if (!owner) continue;
    const b = el.getBoundingClientRect();
    out.push({
      owner: idOf(owner),
      viewport: { x: b.left + el.clientLeft, y: b.top + el.clientTop, w: el.clientWidth, h: el.clientHeight },
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
    });
  }
  return out;
}

// ── snapshot + commit record ──────────────────────────────────────────────

let root: any = null;
let commitIndex = 0;
/** fiber object last seen per id: an identical object means React reused it without rendering */
let seen = new Map<string, Fiber>();
let lastCause: { type: string; component: string; element?: string; at: number } | null = null;

function snapshot(withCommit: boolean): { snapshot: Snapshot; commit?: CommitRecord } {
  const nodes: CompNode[] = [];
  const rendered: string[] = [];
  const changedProps: Record<string, string[]> = {};
  const changedState: string[] = [];
  const nextSeen = new Map<string, Fiber>();
  const nextIds = new WeakMap<Element, string>();

  const visit = (f: Fiber, parent: string | null) => {
    let here = parent;
    if (COMPONENT.has(f.tag)) {
      const id = idOf(f);
      here = id;
      nextSeen.set(id, f);
      const hosts = topHosts(f);
      const props = (f.memoizedProps ?? {}) as Record<string, unknown>;
      const states = stateHooks(f);
      const names = stateNames(f.type);
      nodes.push({
        id,
        name: nameOf(f.type),
        parent,
        rect: union(hosts.map((h) => h.getBoundingClientRect())),
        clip: clipOf(hosts[0]),
        props: Object.entries(props)
          .filter(([k, v]) => k !== 'children' || v !== undefined)
          .map(([k, v]) => info(k, v, f)),
        state: states.map((v, i) => info(names[i] ?? `state ${i + 1}`, v)),
        elements: elementsOf(f, id, props, states, nextIds),
        ...(f.key != null ? { key: String(f.key) } : {}),
        paints: hosts.some(paints),
      });

      if (withCommit) {
        const prev = seen.get(id);
        const didRender = !f.alternate || (prev !== f && (f.flags & PERFORMED_WORK) !== 0);
        if (didRender) {
          rendered.push(id);
          const old = f.alternate;
          if (old && parent) {
            const was = (old.memoizedProps ?? {}) as Record<string, unknown>;
            const keys = new Set([...Object.keys(props), ...Object.keys(was)]);
            const diff = [...keys].filter((k) => k !== 'children' && !Object.is(props[k], was[k]));
            if (diff.length) changedProps[`${parent}>${id}`] = diff;
          }
          if (old) {
            const before = stateHooks(old);
            states.forEach((v, i) => {
              if (!Object.is(v, before[i])) changedState.push(`${id}:state${i}`);
            });
          }
        }
      }
    }
    for (let c = f.child; c; c = c.sibling) visit(c, here);
  };
  if (root?.current) visit(root.current, null);

  elementIds = nextIds;
  const snap: Snapshot = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    nodes,
    scrolls: scrollAreas(),
  };
  if (!withCommit) return { snapshot: snap };

  const mounted = [...nextSeen.keys()].filter((id) => !seen.has(id));
  const unmounted = [...seen.keys()].filter((id) => !nextSeen.has(id));
  seen = nextSeen;
  const cause = lastCause && performance.now() - lastCause.at < 600 ? { type: lastCause.type, component: lastCause.component, element: lastCause.element } : undefined;
  lastCause = null;
  return { snapshot: snap, commit: { index: commitIndex++, cause, rendered, changedProps, changedState, mounted, unmounted } };
}

// ── messaging ─────────────────────────────────────────────────────────────

function post(msg: Payload<ProbeMessage>) {
  if (window.parent === window) return;
  window.parent.postMessage({ channel: CHANNEL, ...msg }, '*');
}

function onCommit(r: any) {
  root = r;
  // DOM is up to date by the time the commit hook runs
  post({ type: 'snapshot', ...snapshot(true) });
}

let layoutQueued = false;
function postLayout() {
  if (layoutQueued || !root) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    post({ type: 'snapshot', ...snapshot(false) });
  });
}

// events in the app: remember where they started, so the next commit can name its cause
for (const type of ['click', 'input', 'submit', 'keydown', 'change']) {
  document.addEventListener(
    type,
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const comp = target ? componentAbove(fiberOfElement(target)) : undefined;
      const tagged = target?.closest('[data-cc]');
      if (comp) lastCause = { type, component: idOf(comp), element: tagged ? elementIds.get(tagged) : undefined, at: performance.now() };
    },
    true,
  );
}
document.addEventListener('scroll', postLayout, true);
window.addEventListener('resize', postLayout);

const editable = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset)$/.test(el.type)) || (el as HTMLElement).isContentEditable);

document.addEventListener('focusin', () => post({ type: 'editing', editing: editable(document.activeElement) }));
document.addEventListener('focusout', () => setTimeout(() => post({ type: 'editing', editing: editable(document.activeElement) }), 0));
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur?.();
  },
  true,
);

// requests from the game
window.addEventListener('message', (e) => {
  if (!isGameMessage(e.data)) return;
  const m = e.data;
  if (m.type === 'sync') {
    if (root) post({ type: 'snapshot', ...snapshot(false) });
  } else if (m.type === 'click') {
    const el = document.elementFromPoint(m.x, m.y) as HTMLElement | null;
    if (!el) return;
    const init = { bubbles: true, cancelable: true, composed: true, clientX: m.x, clientY: m.y, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    if (editable(el)) el.focus();
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    el.click(); // runs default actions: toggles checkboxes, submits forms
  } else if (m.type === 'wheel') {
    for (let el = document.elementFromPoint(m.x, m.y); el; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
        el.scrollBy({ top: m.dy });
        break;
      }
    }
  } else if (m.type === 'release') {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
});

(window as any).__CODECRAFT_PROBE__ = { onCommit };
post({ type: 'hello' });
