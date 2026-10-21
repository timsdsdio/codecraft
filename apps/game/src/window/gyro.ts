// The phone's orientation, integrated from the gyroscope. Camera results arrive 60-150 ms after the
// frame was captured, and a phone turning in the hand moves the eye across the screen faster than
// that. Holding the eye in a frame that doesn't turn with the phone, and turning it back into the
// phone's frame every render, lets the gyroscope (which reports almost at once) cover the gap.
import { Quaternion, Vector3 } from 'three';

const DEG = Math.PI / 180;
const KEEP_MS = 1000;

export class GyroFrame {
  /** phone → reference frame (where the phone pointed when readings began); drifts slowly */
  readonly q = new Quaternion();
  active = false;
  private t: number | null = null;
  private history: { t: number; q: Quaternion }[] = [];
  private dq = new Quaternion();
  private axis = new Vector3();
  private inverse = new Quaternion();

  update(e: DeviceMotionEvent) {
    const r = e.rotationRate;
    if (!r || r.alpha == null || r.beta == null || r.gamma == null) return;
    const now = performance.now();
    const dt = this.t === null ? 0 : Math.min((now - this.t) / 1000, 0.1);
    this.t = now;
    this.active = true;
    // rotation rates are about the phone's own axes: beta about x, gamma about y, alpha about z
    const wx = r.beta * DEG;
    const wy = r.gamma * DEG;
    const wz = r.alpha * DEG;
    const w = Math.hypot(wx, wy, wz);
    if (w * dt > 1e-7) {
      this.dq.setFromAxisAngle(this.axis.set(wx / w, wy / w, wz / w), w * dt);
      this.q.multiply(this.dq).normalize();
    }
    this.history.push({ t: now, q: this.q.clone() });
    while (this.history.length && now - this.history[0].t > KEEP_MS) this.history.shift();
  }

  /** orientation at an earlier time (the latest reading at or before it) */
  at(t: number) {
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].t <= t) return this.history[i].q;
    return this.history[0]?.q ?? this.q;
  }

  /** a vector measured in the phone's frame at time t → the reference frame */
  toReference(v: Vector3, t: number) {
    return v.applyQuaternion(this.at(t));
  }

  /** a vector in the reference frame → the phone's frame now */
  toPhone(v: Vector3) {
    return v.applyQuaternion(this.inverse.copy(this.q).invert());
  }
}
