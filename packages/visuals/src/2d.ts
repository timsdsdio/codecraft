// three.js-free entry: palette, factory layout maths and the 2D (SVG) swatches.
// Import this from code that must stay out of the 3D chunk.
export * from './palette';
export * from './factory/layout';
export { KindSwatch, CogIcon } from './icons';
export { LOOKS, LookProvider, useLook, useMetal, type Look, type MetalRole } from './factory/look';
export { walkInput, TOUCH_LOOK_SCALE, isCoarsePointer } from './input';
