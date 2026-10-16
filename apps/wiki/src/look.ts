// The wiki-wide 3D look (tron / brass), remembered per browser.
import { useSyncExternalStore } from 'react';
import { LOOKS, type Look } from '@codecraft/visuals/2d';

const KEY = 'codecraft:look';
const listeners = new Set<() => void>();

function read(): Look {
  try {
    const v = localStorage.getItem(KEY);
    return (LOOKS as readonly string[]).includes(v ?? '') ? (v as Look) : 'tron';
  } catch {
    return 'tron';
  }
}

let current = read();

export function setLook(l: Look) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: keep it for this page only */
  }
  listeners.forEach((f) => f());
}

export function useWikiLook(): Look {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => current,
    () => 'tron',
  );
}
