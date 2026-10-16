// Canvas-texture labels using the bundled CSS fonts (no network). Redrawn once fonts load.
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

export interface LabelOpts {
  text: string;
  sub?: string;
  color?: string;
  subColor?: string;
  font?: 'Orbitron' | 'JetBrains Mono';
  weight?: number;
  px?: number;
  glow?: number;
  /** dark translucent plate behind the text */
  backing?: boolean;
}

function fontString(o: LabelOpts, px: number, family = o.font ?? 'Orbitron', weight = o.weight ?? 700) {
  return `${weight} ${px}px "${family}", "JetBrains Mono", ui-monospace, sans-serif`;
}

type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string };

function draw(canvas: HTMLCanvasElement, o: LabelOpts): number {
  const px = o.px ?? 64;
  const subPx = Math.round(px * 0.5);
  const ctx = canvas.getContext('2d') as Ctx2D;
  const main = fontString(o, px);
  const sub = fontString(o, subPx, 'JetBrains Mono', 500);
  ctx.font = main;
  const spacing = px * 0.08;
  const w1 = ctx.measureText(o.text).width + spacing * o.text.length;
  ctx.font = sub;
  const w2 = o.sub ? ctx.measureText(o.sub).width : 0;
  const pad = px * 0.5;
  const W = Math.ceil(Math.max(w1, w2) + pad * 2);
  const H = Math.ceil(px * 1.5 + (o.sub ? subPx * 1.5 : 0) + pad * 0.4);
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  if (o.backing) {
    const r = Math.min(H * 0.25, 18);
    ctx.fillStyle = 'rgba(2,5,12,0.88)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(1, 1, W - 2, H - 2, r);
    else ctx.rect(1, 1, W - 2, H - 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const color = o.color ?? '#bff9ff';
  ctx.font = main;
  ctx.letterSpacing = `${spacing}px`;
  ctx.shadowColor = color;
  ctx.shadowBlur = o.glow ?? px * 0.3;
  ctx.fillStyle = color;
  const y1 = pad * 0.2 + px * 0.75;
  ctx.fillText(o.text, W / 2, y1);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(o.text, W / 2, y1);
  ctx.globalAlpha = 1;
  if (o.sub) {
    ctx.letterSpacing = '0px';
    ctx.font = sub;
    ctx.fillStyle = o.subColor ?? 'rgba(180,220,235,0.8)';
    ctx.fillText(o.sub, W / 2, y1 + px * 0.75 + subPx * 0.7);
  }
  return W / H;
}

/** Builds (and redraws on font load) a label texture. */
export function useLabelTexture(o: LabelOpts): { texture: THREE.CanvasTexture; aspect: number } {
  const key = JSON.stringify(o);
  const [, bump] = useState(0);
  const res = useMemo(() => {
    const canvas = document.createElement('canvas');
    const aspect = { current: draw(canvas, o) };
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, aspect };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    let dead = false;
    const px = o.px ?? 64;
    Promise.all([
      document.fonts.load(fontString(o, px)).catch(() => undefined),
      o.sub ? document.fonts.load(fontString(o, Math.round(px * 0.5), 'JetBrains Mono', 500)).catch(() => undefined) : null,
    ])
      .then(() => document.fonts.ready)
      .then(() => {
        if (dead) return;
        res.aspect.current = draw(res.texture.image as HTMLCanvasElement, o);
        // canvas size may change → dispose the GPU copy so it re-uploads at the new size
        res.texture.dispose();
        res.texture.needsUpdate = true;
        bump((n) => n + 1);
      }, () => undefined);
    return () => {
      dead = true;
      res.texture.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);
  return { texture: res.texture, aspect: res.aspect.current };
}

/** Billboard sprite label. `height` = world height. */
export function Label({
  position,
  height = 0.4,
  opacity = 1,
  intensity = 1.2,
  renderOrder = 10,
  depthTest = true,
  ...o
}: LabelOpts & {
  position: [number, number, number];
  height?: number;
  opacity?: number;
  intensity?: number;
  renderOrder?: number;
  depthTest?: boolean;
}) {
  const { texture, aspect } = useLabelTexture(o);
  const color = useMemo(() => new THREE.Color(intensity, intensity, intensity), [intensity]);
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={renderOrder} raycast={() => null}>
      <spriteMaterial map={texture} color={color} transparent opacity={opacity} depthWrite={false} depthTest={depthTest} toneMapped={false} />
    </sprite>
  );
}

/** Flat label (on the floor or a panel). Plane faces +Z in local space. */
export function FlatLabel({
  height = 1,
  opacity = 1,
  intensity = 1,
  position,
  rotation,
  ...o
}: LabelOpts & {
  height?: number;
  opacity?: number;
  intensity?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const { texture, aspect } = useLabelTexture(o);
  const color = useMemo(() => new THREE.Color(intensity, intensity, intensity), [intensity]);
  return (
    <mesh position={position} rotation={rotation} scale={[height * aspect, height, 1]} raycast={() => null}>
      <planeGeometry />
      <meshBasicMaterial map={texture} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
