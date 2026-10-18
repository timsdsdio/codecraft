// Finds the viewer's eyes in the front camera with MediaPipe Face Landmarker and turns them into a
// position in millimetres. Only position matters for the window effect, not where the eyes look.
// Distance comes from the gap between the two iris centres, which is close to the same for most
// adults (about 63 mm); sideways and vertical offsets follow from distance and the camera's field
// of view.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Vec3 } from './projection';

// keep in step with the @mediapipe/tasks-vision version in package.json
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const IRIS_CENTRES = [468, 473] as const;

export interface FaceSettings {
  /** field of view across the long side of the camera image, degrees */
  fovDeg: number;
  /** distance between the viewer's pupils, mm */
  ipdMm: number;
}

export interface FaceSample {
  /** eye midpoint relative to the camera lens, in screen axes (+x right, +y up, +z toward the viewer) */
  eye: Vec3;
  /** iris centres in normalised image coordinates, for the preview */
  irises: [number, number][];
  /** time the frame was detected (performance.now()) */
  t: number;
  /** time spent in detection, ms */
  ms: number;
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private running = false;
  readonly video: HTMLVideoElement;

  constructor(
    private settings: () => FaceSettings,
    private onSample: (s: FaceSample | null) => void,
  ) {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  /** Must be called from a tap so the browser lets the camera start */
  async start(onStatus: (msg: string) => void) {
    onStatus('Asking for the camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
    this.video.srcObject = stream;
    await this.video.play();

    onStatus('Loading the face model (about 4 MB)…');
    const files = await FilesetResolver.forVisionTasks(WASM);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO' as const,
      numFaces: 1,
    });
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(files, options('CPU'));
    }
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }

  private loop = () => {
    if (!this.running) return;
    this.detect();
    if ('requestVideoFrameCallback' in this.video) this.video.requestVideoFrameCallback(this.loop);
    else requestAnimationFrame(this.loop);
  };

  private detect() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(v, t0);
    const t = performance.now();
    const face = result.faceLandmarks[0];
    if (!face) return this.onSample(null);

    const w = v.videoWidth;
    const h = v.videoHeight;
    const [a, b] = IRIS_CENTRES.map((i) => face[i]);
    const gapPx = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
    const { fovDeg, ipdMm } = this.settings();
    const f = Math.max(w, h) / 2 / Math.tan((fovDeg * Math.PI) / 360);
    const z = (f * ipdMm) / gapPx;
    const u = ((a.x + b.x) / 2) * w - w / 2;
    const vy = ((a.y + b.y) / 2) * h - h / 2;
    // the camera sees the viewer face to face, so its image is mirrored relative to the screen
    this.onSample({
      eye: { x: (-u * z) / f, y: (-vy * z) / f, z },
      irises: [
        [a.x, a.y],
        [b.x, b.y],
      ],
      t,
      ms: t - t0,
    });
  }
}
