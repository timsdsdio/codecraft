// What an embed can show. Kept free of three.js imports so pages can reference embeds without
// pulling the 3D chunk into the main bundle.
export type EmbedSpec =
  | { type: 'block'; id: string; portLabels?: boolean; title?: boolean }
  | { type: 'tool'; tool: 'probe' | 'wire' | 'cutter' | 'wrench' }
  | { type: 'scene'; name: SceneName };

export const SCENE_NAMES = ['wiring', 'link', 'missing', 'replace', 'monitor', 'monitor-missing', 'shapes', 'faces', 'demand'] as const;
export type SceneName = (typeof SCENE_NAMES)[number];
