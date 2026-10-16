// Deterministic interface → socket visual mapping (ported from the Socketworld prototype).
// Handler/remote halves of a cable share a visual: the role suffix and @version are stripped.

export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star', 'cross', 'pentagon'] as const;
export type SocketShape = (typeof SHAPES)[number];

export const NEON = ['#00fff0', '#ff00e5', '#ffe600', '#39ff14', '#ff6a00', '#7a5cff', '#ff2050', '#00a2ff'] as const;

/** Block tints by zone. */
export const ZONE_TINT = {
  client: '#00fff0',
  server: '#ff6a00',
  link: '#ff00e5',
  db: '#7d8796',
  fixture: '#00a2ff',
} as const;
export type Zone = keyof typeof ZONE_TINT;

/** FNV-1a 32-bit */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "todo.TodoApi@1:handler" → "todo.TodoApi" */
export function baseName(ifaceId: string): string {
  return ifaceId.split(':')[0].split('@')[0];
}

export function versionOf(ifaceId: string): number {
  const m = /@(\d+)/.exec(ifaceId);
  return m ? Number(m[1]) : 1;
}

export interface SocketVisual {
  shape: SocketShape;
  color: string;
}

/** Manual overrides to resolve visual collisions. */
const OVERRIDES: Record<string, Partial<SocketVisual>> = {
  'ui.Root': { shape: 'pentagon', color: '#39ff14' },
};

export function visualFor(ifaceId: string): SocketVisual {
  const base = baseName(ifaceId);
  const h = fnv1a(base);
  const v: SocketVisual = { shape: SHAPES[h & 7], color: NEON[(h >>> 3) & 7] };
  return { ...v, ...OVERRIDES[base] };
}

export function setVisualOverride(base: string, v: Partial<SocketVisual>) {
  OVERRIDES[base] = v;
}

export type Tool = 'probe' | 'wire' | 'cutter' | 'wrench';

export const TOOL_COLOR: Record<Tool, string> = {
  probe: '#00fff0',
  wire: '#ff00e5',
  cutter: '#ff6a00',
  wrench: '#ffe600',
};
