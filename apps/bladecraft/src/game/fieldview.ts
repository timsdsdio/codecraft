// Draws field plates and the field above them. A field can cover hundreds of plates, so everything
// here is instanced: one mesh for the plates, one for the E arrows and one for the IB discs, whatever
// the field's size. Each frame every plate's arrow and disc are set from the field there:
//   plate   an iron slab that glows brighter where the field holds more energy, E² + B²
//   E       an orange arrow, pointing the way E points, longer for a stronger field
//   IB      a translucent blue disc lying in the plane of the bivector IB, so at right angles to the
//           way B points, wider for a stronger field
import * as THREE from 'three';
import type { Field } from './field';
import type { World } from './world';

const ARROW_HEIGHT = 0.55;
const DIM = new THREE.Color(0x1e2a33);
const BRIGHT = new THREE.Color(0x5ab4e8);
const UP = new THREE.Vector3(0, 1, 0);

/** a texture for the plate's top: dark steel inside a brass border, with a faint cross at its centre */
function plateTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#c0c8d0';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#e8c070';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(32, 22);
  g.lineTo(32, 42);
  g.moveTo(22, 32);
  g.lineTo(42, 32);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** an arrow one unit long from its foot at the origin up +y */
function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6);
  shaft.translate(0, 0.375, 0);
  const head = new THREE.ConeGeometry(0.07, 0.25, 8);
  head.translate(0, 0.875, 0);
  const g = new THREE.BufferGeometry();
  const parts = [shaft, head].map((p) => p.toNonIndexed());
  for (const name of ['position', 'normal'] as const) {
    const arrays = parts.map((p) => p.getAttribute(name).array as Float32Array);
    const merged = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) merged.set(a, (o += a.length) - a.length);
    g.setAttribute(name, new THREE.BufferAttribute(merged, 3));
  }
  return g;
}

export class FieldView {
  private plates: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private discs: THREE.InstancedMesh;
  private cells: [number, number, number][] = [];
  private scene: THREE.Scene;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const plateMat = typeof document === 'undefined' ? new THREE.MeshStandardMaterial() : new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 0.6, roughness: 0.5 });
    this.plates = this.make(new THREE.BoxGeometry(1, 0.125, 1), plateMat, 0);
    this.arrows = this.make(arrowGeometry(), new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0x7a2a00, roughness: 0.4 }), 0);
    this.discs = this.make(
      new THREE.CylinderGeometry(1, 1, 0.015, 24),
      new THREE.MeshStandardMaterial({ color: 0x5aa8ff, emissive: 0x10305a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      0,
    );
  }

  private make(geo: THREE.BufferGeometry, mat: THREE.Material, n: number) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    mesh.count = n;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  /** find the plates again after blocks change */
  rebuild(world: World) {
    this.cells = [];
    for (const [x, y, z] of world.active.values()) {
      const b = world.get(x, y, z);
      if (b?.kind === 'machine' && b.type === 'plate') this.cells.push([x, y, z]);
    }
    const n = this.cells.length;
    if (n > this.plates.instanceMatrix.count) {
      // grow with room to spare, so laying plates one by one doesn't rebuild every time
      const size = Math.ceil(n * 1.5) + 16;
      for (const key of ['plates', 'arrows', 'discs'] as const) {
        const old = this[key];
        this.scene.remove(old);
        old.dispose();
        this[key] = this.make(old.geometry, old.material as THREE.Material, size);
      }
    }
    for (const mesh of [this.plates, this.arrows, this.discs]) mesh.count = n;
    this.cells.forEach(([x, y, z], i) => {
      this.m.makeTranslation(x + 0.5, y + 0.0625, z + 0.5);
      this.plates.setMatrixAt(i, this.m);
    });
    this.plates.instanceMatrix.needsUpdate = true;
  }

  /** set every arrow, disc and glow from the field as it is now */
  update(field: Field) {
    const { m, q, v, s, p, c } = this;
    this.cells.forEach(([x, y, z], i) => {
      const f = field.at(x, y, z);
      p.set(x + 0.5, y + ARROW_HEIGHT, z + 0.5);
      // algebra (a, b, up) is world (a, up, −b)
      v.set(f.e[0], f.e[2], -f.e[1]);
      const e = v.length();
      if (e < 0.03) m.makeScale(0, 0, 0);
      else {
        const len = (0.85 * e) / (e + 1);
        v.normalize();
        q.setFromUnitVectors(UP, v);
        m.compose(p.clone().addScaledVector(v, -len / 2), q, s.set(1, len, 1));
      }
      this.arrows.setMatrixAt(i, m);
      v.set(f.b[0], f.b[2], -f.b[1]);
      const b = v.length();
      if (b < 0.03) m.makeScale(0, 0, 0);
      else {
        const r = (0.4 * b) / (b + 0.8);
        // the disc's axis is B, so its face is the plane of IB
        q.setFromUnitVectors(UP, v.normalize());
        m.compose(p, q, s.set(r, 1, r));
      }
      this.discs.setMatrixAt(i, m);
      const energy = e * e + b * b;
      this.plates.setColorAt(i, c.copy(DIM).lerp(BRIGHT, energy / (energy + 0.6)));
    });
    this.arrows.instanceMatrix.needsUpdate = true;
    this.discs.instanceMatrix.needsUpdate = true;
    if (this.plates.instanceColor) this.plates.instanceColor.needsUpdate = true;
  }
}
