// What sits behind the glass: a box as wide and tall as the screen running back into the phone,
// gridded every centimetre, with targets on stalks at different depths (the stalks make depth easy
// to read) and one cube floating in front of the glass.
import * as THREE from 'three';

const CYAN = 0x00fff0;
const GRID = 10; // mm

export function buildBox(w: number, h: number, depth: number) {
  const group = new THREE.Group();

  // grid lines on the four walls and the back
  const pts: number[] = [];
  const seg = (a: number[], b: number[]) => pts.push(...a, ...b);
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, z1 = -depth;
  for (let z = 0; z >= z1; z -= GRID) {
    seg([x0, y0, z], [x1, y0, z]);
    seg([x0, y1, z], [x1, y1, z]);
    seg([x0, y0, z], [x0, y1, z]);
    seg([x1, y0, z], [x1, y1, z]);
  }
  for (let x = x0; x <= x1 + 0.01; x += GRID) {
    seg([x, y0, 0], [x, y0, z1]);
    seg([x, y1, 0], [x, y1, z1]);
    seg([x, y0, z1], [x, y1, z1]);
  }
  for (let y = y0; y <= y1 + 0.01; y += GRID) {
    seg([x0, y, 0], [x0, y, z1]);
    seg([x1, y, 0], [x1, y, z1]);
    seg([x0, y, z1], [x1, y, z1]);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35 }),
  );
  group.add(grid);

  // the rim of the glass, so the edge of the window reads as a frame
  const rim = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, y0, 0),
      new THREE.Vector3(x1, y0, 0),
      new THREE.Vector3(x1, y1, 0),
      new THREE.Vector3(x0, y1, 0),
    ]),
    new THREE.LineBasicMaterial({ color: CYAN }),
  );
  group.add(rim);

  // targets on stalks from the back wall: fractions of width, height, depth
  const targets: [number, number, number, number][] = [
    [-0.28, 0.3, 0.15, 0xff4d8d],
    [0.25, 0.18, 0.35, 0xffc640],
    [-0.15, -0.12, 0.55, 0x7dff6a],
    [0.3, -0.3, 0.75, 0x6aa8ff],
    [0.05, 0.38, 0.9, 0xc78bff],
  ];
  const sphere = new THREE.SphereGeometry(1, 32, 16);
  const r = Math.min(w, h) * 0.06;
  for (const [fx, fy, fz, color] of targets) {
    const p = new THREE.Vector3(fx * w, fy * h, -fz * depth);
    const ball = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }));
    ball.scale.setScalar(r);
    ball.position.copy(p);
    group.add(ball);
    const stalk = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3(p.x, p.y, z1)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    group.add(stalk);
    const foot = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.3, r * 0.45, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    );
    foot.position.set(p.x, p.y, z1 + 0.1);
    group.add(foot);
  }

  // a cube in front of the glass; it only works while it stays inside the frame
  const size = Math.min(w, h) * 0.22;
  const cube = new THREE.Group();
  cube.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: 0x0b2a33, roughness: 0.4, transparent: true, opacity: 0.85 }),
    ),
    new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
      new THREE.LineBasicMaterial({ color: CYAN }),
    ),
  );
  cube.position.set(0, -h * 0.18, size * 0.9);
  group.add(cube);

  return { group, cube };
}

export function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xbfefff, 0x101820, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(60, 120, 200);
  scene.add(key);
}
