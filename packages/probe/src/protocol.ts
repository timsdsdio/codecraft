// Messages between the probe (inside the app's page) and the game (the page embedding it).
// Everything is plain JSON so it can cross window boundaries, or later a network.
import type { Snapshot } from '@codecraft/visuals/2d';

export const CHANNEL = 'codecraft';

/** One function call made while an event was being handled. */
export interface CallRecord {
  /** the callee as written at the call site: `onToggle`, `todos.map` */
  label: string;
  /** JSON-safe copies of the arguments */
  args: unknown[];
  /** nesting: calls made from inside an earlier call have a larger depth */
  depth: number;
  /** a state setter, a prop of the component whose handler ran, or anything else */
  kind: 'setter' | 'prop' | 'other';
  /** kind 'prop': the prop's name in the handling component */
  prop?: string;
  /** setter: the component holding the state; prop: the component that created the function */
  origin?: string;
  /** setter: the state tank's id */
  tank?: string;
  /** the function's own name, when it has one */
  defined?: string;
}

/** What happened in one React commit. Ids are component ids from the snapshot. */
export interface CommitRecord {
  index: number;
  /** the user event that caused this commit: the component and element whose handler ran, and the
   *  calls that handler made, in order */
  cause?: { type: string; component: string; element?: string; calls: CallRecord[] };
  /** components that ran their render function */
  rendered: string[];
  /** pipe id (`parent>child`) → names of the props whose values changed */
  changedProps: Record<string, string[]>;
  /** tank ids (`component:stateN`) whose value changed */
  changedState: string[];
  mounted: string[];
  unmounted: string[];
}

export type ProbeMessage =
  | { channel: typeof CHANNEL; type: 'hello' }
  /** a full snapshot; `commit` is absent for layout-only updates (scroll, resize) */
  | { channel: typeof CHANNEL; type: 'snapshot'; snapshot: Snapshot; commit?: CommitRecord }
  /** an editable element got focus: the game should hand the keyboard to the app */
  | { channel: typeof CHANNEL; type: 'editing'; editing: boolean };

export type GameMessage =
  /** ask for a full snapshot now (sent until the first one arrives) */
  | { channel: typeof CHANNEL; type: 'sync' }
  /** press whatever is at viewport point (x, y) */
  | { channel: typeof CHANNEL; type: 'click'; x: number; y: number }
  /** scroll whatever scrolls at (x, y) */
  | { channel: typeof CHANNEL; type: 'wheel'; x: number; y: number; dy: number }
  /** stop editing: blur the focused element */
  | { channel: typeof CHANNEL; type: 'release' };

/** A message without its channel field (distributes over the union). */
export type Payload<M> = M extends unknown ? Omit<M, 'channel'> : never;

export function isProbeMessage(d: unknown): d is ProbeMessage {
  return typeof d === 'object' && d !== null && (d as { channel?: unknown }).channel === CHANNEL;
}
export const isGameMessage = isProbeMessage as unknown as (d: unknown) => d is GameMessage;
