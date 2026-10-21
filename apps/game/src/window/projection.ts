// Off-axis ("window") projection. The phone's screen is a pane of glass at z = 0 in a frame measured
// in millimetres: origin at the centre of the visible page, +x right, +y up, +z out of the glass
// toward the viewer. The camera sits at the viewer's eye and looks straight down -z; the frustum is
// sheared so its edges pass through the edges of the glass, which makes the scene behind it hold
// still in space as the eye moves.
import type { PerspectiveCamera } from 'three';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function aimThroughGlass(camera: PerspectiveCamera, eye: Vec3, glassW: number, glassH: number, near = 5, far = 4000) {
  const z = Math.max(eye.z, near * 2);
  const k = near / z;
  const left = (-glassW / 2 - eye.x) * k;
  const right = (glassW / 2 - eye.x) * k;
  const bottom = (-glassH / 2 - eye.y) * k;
  const top = (glassH / 2 - eye.y) * k;
  camera.position.set(eye.x, eye.y, z);
  camera.quaternion.identity();
  camera.updateMatrixWorld();
  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/** One Euro filter (Casiez et al.): smooths jitter when still, follows quickly when moving */
export class OneEuro {
  private prev: number | null = null;
  private dPrev = 0;
  private tPrev = 0;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, t: number) {
    if (this.prev === null) {
      this.prev = v;
      this.tPrev = t;
      return v;
    }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-3);
    const d = (v - this.prev) / dt;
    this.dPrev += OneEuro.alpha(this.dCutoff, dt) * (d - this.dPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dPrev);
    this.prev += OneEuro.alpha(cutoff, dt) * (v - this.prev);
    this.tPrev = t;
    return this.prev;
  }
  reset() {
    this.prev = null;
    this.dPrev = 0;
  }
}
