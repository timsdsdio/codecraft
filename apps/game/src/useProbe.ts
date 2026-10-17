// Connects to the probe inside the app's iframe: receives snapshots and commits, sends requests,
// and keeps the last commit so it can be replayed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL, isProbeMessage, type CommitRecord, type GameMessage, type Payload } from '@codecraft/probe';
import { Activity, layoutFactory, type Snapshot } from '@codecraft/visuals';
import { scheduleCommit, type Frame } from './schedule';

export function useProbe() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [current, setCurrent] = useState<Frame | null>(null);
  const [editing, setEditing] = useState(false);
  const activity = useMemo(() => new Activity(), []);
  const latest = useRef<Frame | null>(null);
  const last = useRef<{ commit: CommitRecord; prev: Frame | null; next: Frame } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isProbeMessage(e.data)) return;
      const m = e.data;
      if (m.type === 'snapshot') {
        const next: Frame = { snapshot: m.snapshot as Snapshot, layout: layoutFactory(m.snapshot) };
        if (m.commit) {
          const prev = latest.current;
          last.current = { commit: m.commit, prev, next };
          scheduleCommit(activity, m.commit, prev, next);
        }
        latest.current = next;
        setCurrent(next);
      } else if (m.type === 'editing') {
        setEditing(m.editing);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activity]);

  const send = useCallback((msg: Payload<GameMessage>) => {
    frame.current?.contentWindow?.postMessage({ channel: CHANNEL, ...msg }, '*');
  }, []);

  // handshake: keep asking for a snapshot until one arrives, so a missed first message can't strand us
  const connected = current !== null;
  useEffect(() => {
    if (connected) return;
    const id = window.setInterval(() => send({ type: 'sync' }), 1000);
    return () => window.clearInterval(id);
  }, [connected, send]);

  /** Forget the previous app's frames (after loading a different app into the iframe). */
  const reset = useCallback(() => {
    latest.current = null;
    last.current = null;
  }, []);

  /** Play the most recent commit again from now. */
  const replay = useCallback(() => {
    const l = last.current;
    if (l) scheduleCommit(activity, l.commit, l.prev, l.next);
  }, [activity]);

  return { frame, snapshot: current?.snapshot ?? null, layout: current?.layout ?? null, activity, editing, send, replay, reset };
}
