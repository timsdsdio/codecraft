// What an embed can show. Kept free of three.js imports so pages can reference embeds without
// pulling the 3D chunk into the main bundle.
export const SCENE_NAMES = [
  'overview',
  'surface',
  'cutaway',
  'floors',
  'casing',
  'tank',
  'pipe',
  'link',
  'piston',
  'fold',
  'event',
  'wireless',
  'avatar',
] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

export type EmbedSpec = { type: 'scene'; name: SceneName };
