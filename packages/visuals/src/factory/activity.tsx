// Live activity on its own clock. The game schedules what happens when (renders, items travelling
// through ducts, calls zapping through space) and machines read it every frame. The clock can be
// paused or slowed, so a moment of data flow can be frozen and inspected.
import { createContext, useContext } from 'react';
import type { ValueKind } from '../palette';
import type { Vec3 } from './layout';

/** What an item or zap is carrying, for the inspector. */
export interface Cargo {
  label: string;
  kind: ValueKind;
  value?: unknown;
}

export interface Shipment extends Cargo {
  /** when the item enters the duct (activity time) */
  t: number;
}

export interface Zap extends Cargo {
  from: Vec3;
  to: Vec3;
  t: number;
}

/** Item speed inside ducts, world units per second of activity time. */
export const DUCT_SPEED = 2.2;
export const ZAP_TIME = 0.55;

export class Activity {
  /** activity time in seconds; advances with real time × speed unless paused */
  time = 0;
  speed = 1;
  paused = false;
  private pulses = new Map<string, number>();
  private shipments = new Map<string, Shipment[]>();
  zaps: Zap[] = [];

  now() {
    return this.time;
  }
  advance(dt: number) {
    if (!this.paused) this.time += dt * this.speed;
  }
  /** how fast animations should run right now (0 when paused) */
  rate() {
    return this.paused ? 0 : this.speed;
  }

  /** pulse `key` (a casing, tank or display link) at activity time `t` */
  schedule(key: string, t: number) {
    this.pulses.set(key, t);
  }
  /** the most recent pulse for `key` that has already happened */
  latest(key: string): number | undefined {
    const t = this.pulses.get(key);
    return t !== undefined && t <= this.time ? t : undefined;
  }

  /** send an item through duct `key` */
  ship(key: string, s: Shipment) {
    const list = this.shipments.get(key) ?? [];
    list.push(s);
    this.shipments.set(key, list);
  }
  /** items in duct `key`, pruning ones that left more than `keepFor` seconds ago */
  shipmentsIn(key: string, travel: number, keepFor = 0.2): Shipment[] {
    const list = this.shipments.get(key);
    if (!list) return [];
    const live = list.filter((s) => this.time - s.t < travel + keepFor || s.t > this.time);
    if (live.length !== list.length) this.shipments.set(key, live);
    return live;
  }

  zap(z: Zap) {
    this.zaps.push(z);
  }
  liveZaps(): Zap[] {
    this.zaps = this.zaps.filter((z) => this.time - z.t < ZAP_TIME + 0.4 || z.t > this.time);
    return this.zaps;
  }
}

const ActivityContext = createContext<Activity | null>(null);
export const ActivityProvider = ActivityContext.Provider;
export const useActivity = () => useContext(ActivityContext);
