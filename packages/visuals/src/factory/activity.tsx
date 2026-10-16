// Live activity: when each machine should next pulse. The game schedules pulses from React commits
// (renders, changed props, state changes, events); machines read them every frame by key.
// Times are performance.now() seconds.
import { createContext, useContext } from 'react';

export class Activity {
  private at = new Map<string, number>();
  /** pulse `key` at time `t` (seconds, performance clock) */
  schedule(key: string, t: number) {
    this.at.set(key, t);
  }
  /** the most recent pulse time for `key` that has already arrived, if any */
  latest(key: string, now = performance.now() / 1000): number | undefined {
    const t = this.at.get(key);
    return t !== undefined && t <= now ? t : undefined;
  }
}

const ActivityContext = createContext<Activity | null>(null);
export const ActivityProvider = ActivityContext.Provider;
export const useActivity = () => useContext(ActivityContext);

export const perfNow = () => performance.now() / 1000;
