// Colours shared by the factory and the wiki.

export const NEON = ['#00fff0', '#ff00e5', '#ffe600', '#39ff14', '#ff6a00', '#7a5cff', '#ff2050', '#00a2ff'] as const;

/** FNV-1a 32-bit */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** What a value is, as far as the factory cares. Decides pipe/fluid colour. */
export type ValueKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function' | 'node' | 'nullish';

export const KIND_COLOR: Record<ValueKind, string> = {
  string: '#00fff0',
  number: '#ffb000',
  boolean: '#39ff14',
  array: '#ff00e5',
  object: '#00a2ff',
  function: '#ff2050',
  node: '#7a5cff',
  nullish: '#7d8796',
};

/** Calls travelling back down the ducts toward where the function was defined. */
export const CALL_COLOR = '#ff8a1f';

/** Factory materials (Create-ish: brass, andesite, dark steel) and the logic-casing green. */
export const FACTORY = {
  brass: '#c8963e',
  copper: '#c4683a',
  andesite: '#4a4f52',
  steel: '#151c25',
  casing: '#19ff8a',
  link: '#d8f6ff',
  fold: '#cfd8ff',
} as const;
