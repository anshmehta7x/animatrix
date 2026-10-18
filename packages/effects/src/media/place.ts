/** Draw a source image onto a canvas with fit / scale / rotate / pan, bilinear, 2×2 AA. */
import type { Canvas } from "@anshmehta7x/animatrix-core";
import type { GreyImage } from "./decode.js";

/** Placement of a source image on the canvas. */
export interface Placement {
  fit: "contain" | "cover" | "stretch";
  /** Extra zoom on top of the fit. */
  scale: number;
  /** Degrees clockwise. */
  rotate: number;
  /** Offset as a fraction of canvas width/height (-1..1). */
  panX: number;
  panY: number;
}

/** Default placement: contain, centred. */
export const DEFAULT_PLACEMENT: Placement = {
  fit: "contain",
  scale: 1,
  rotate: 0,
  panX: 0,
  panY: 0,
};

function sample(src: GreyImage, x: number, y: number): number {
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const fx = x - 0.5 - x0;
  const fy = y - 0.5 - y0;
  let acc = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const sx = x0 + i;
      const sy = y0 + j;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const o = (sy * src.width + sx) * 2;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      acc += w * src.data[o]! * (src.data[o + 1]! / 255);
    }
  }
  return acc;
}

/** Draw `src` into `canvas` (overwrites every pixel). */
export function placeImage(canvas: Canvas, src: GreyImage, p: Placement = DEFAULT_PLACEMENT): void {
  const W = canvas.width;
  const H = canvas.height;
  const fitX = W / src.width;
  const fitY = H / src.height;
  const base =
    p.fit === "stretch"
      ? { x: fitX, y: fitY }
      : p.fit === "cover"
        ? { x: Math.max(fitX, fitY), y: Math.max(fitX, fitY) }
        : { x: Math.min(fitX, fitY), y: Math.min(fitX, fitY) };
  const sx = base.x * p.scale;
  const sy = base.y * p.scale;
  const rad = (-p.rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = W / 2 + p.panX * W;
  const cy = H / 2 + p.panY * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const dx = x + 0.25 + i * 0.5 - cx;
          const dy = y + 0.25 + j * 0.5 - cy;
          const rx = dx * cos - dy * sin;
          const ry = dx * sin + dy * cos;
          acc += sample(src, rx / sx + src.width / 2, ry / sy + src.height / 2);
        }
      }
      canvas.data[y * W + x] = acc / 4;
    }
  }
}
