// Three-free input state shared by WalkControls (inside the canvas) and DOM touch controls.

/** Written by keyboard/touch handlers, read every frame by <WalkControls>. */
export const walkInput = {
  /** joystick: x = strafe right, y = forward, each −1..1 */
  stick: { x: 0, y: 0 },
  /** accumulated look deltas in px since the last frame */
  look: { x: 0, y: 0 },
  /** pending level changes: +1 = up a level, −1 = down */
  level: 0,
  sprint: false,
};

/** touch drags are scaled up by this before being added to `walkInput.look` */
export const TOUCH_LOOK_SCALE = 2;

export const isCoarsePointer = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
