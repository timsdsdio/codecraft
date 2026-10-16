// Probe runtime. Runs inside the app's page, after the hook stub and before the app. On every React
// commit it walks the fiber tree, builds a Snapshot (components, DOM rects, props, state, scroll
// areas) and a CommitRecord (what rendered and changed), and posts both to the embedding page.
// It also carries out the game's requests: clicks and wheel scrolls at viewport coordinates.
//
// Fiber internals aren't a public API. This targets React 19.
import type { CompNode, Rect, ScrollInfo, Snapshot, ValueInfo, ValueKind } from '@codecraft/visuals/2d';
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

function info(name: string, v: unknown): ValueInfo {
  const kind = kindOf(v);
  return { name, kind, preview: short(v), ...(kind === 'array' ? { size: (v as unknown[]).length } : {}) };
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
let lastCause: { type: string; component: string; at: number } | null = null;

function snapshot(withCommit: boolean): { snapshot: Snapshot; commit?: CommitRecord } {
  const nodes: CompNode[] = [];
  const rendered: string[] = [];
  const changedProps: Record<string, string[]> = {};
  const changedState: string[] = [];
  const nextSeen = new Map<string, Fiber>();

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
          .map(([k, v]) => info(k, v)),
        state: states.map((v, i) => info(names[i] ?? `state ${i + 1}`, v)),
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
            // functions travel down event wires, not up pipes, so they don't count as changed data
            const diff = [...keys].filter((k) => k !== 'children' && typeof props[k] !== 'function' && !Object.is(props[k], was[k]));
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

  const snap: Snapshot = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    nodes,
    scrolls: scrollAreas(),
  };
  if (!withCommit) return { snapshot: snap };

  const mounted = [...nextSeen.keys()].filter((id) => !seen.has(id));
  const unmounted = [...seen.keys()].filter((id) => !nextSeen.has(id));
  seen = nextSeen;
  const cause = lastCause && performance.now() - lastCause.at < 600 ? { type: lastCause.type, component: lastCause.component } : undefined;
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
      if (comp) lastCause = { type, component: idOf(comp), at: performance.now() };
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
