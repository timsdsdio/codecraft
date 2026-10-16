// Connects to the probe inside the app's iframe: receives snapshots and commits, sends requests.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL, isProbeMessage, type GameMessage, type Payload } from '@codecraft/probe';
import { Activity, layoutFactory, type FactoryLayout, type Snapshot } from '@codecraft/visuals';
import { scheduleCommit } from './schedule';

export function useProbe() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const activity = useMemo(() => new Activity(), []);
  const layout = useMemo<FactoryLayout | null>(() => (snapshot ? layoutFactory(snapshot) : null), [snapshot]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isProbeMessage(e.data)) return;
      const m = e.data;
      if (m.type === 'snapshot') {
        setSnapshot(m.snapshot);
        if (m.commit) {
          // schedule against the layout this snapshot produces, so new machines pulse too
          const l = layoutFactory(m.snapshot);
          scheduleCommit(activity, m.commit, l);
        }
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
  const connected = snapshot !== null;
  useEffect(() => {
    if (connected) return;
    const id = window.setInterval(() => send({ type: 'sync' }), 1000);
    return () => window.clearInterval(id);
  }, [connected, send]);

  return { frame, snapshot, layout, activity, editing, send };
}
