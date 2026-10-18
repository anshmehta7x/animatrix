/** Layout helpers shared by text-like effects. */
import type { Canvas, Rect } from "@anshmehta7x/animatrix-core";

/** Lowest visible row in each column (−1 if the column is invisible). */
export function columnBottoms(visible: Uint8Array, width: number, height: number): Int16Array {
  const out = new Int16Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (visible[y * width + x]) {
        out[x] = y;
        break;
      }
    }
  }
  return out;
}

/** Top-left to centre a `w`×`h` box in `r` (falls back to the canvas if it doesn't fit). */
export function centreIn(r: Rect, c: Canvas, w: number, h: number): { x: number; y: number } {
  const box = w <= r.width ? r : { x: 0, y: r.y, width: c.width, height: r.height };
  return {
    x: Math.round(box.x + (box.width - w) / 2),
    y: Math.round(box.y + Math.max(0, (box.height - h) / 2)),
  };
}

/** Blank columns left of `x0` within rows [y, y + h) so scrolling text exits cleanly. */
export function clipLeft(c: Canvas, x0: number, y: number, h: number): void {
  if (x0 > 0) c.rect(0, y, x0, h, 0);
}

/** First column from which rows [y, y + h) are all visible (0 if fully visible). */
export function bandLeft(visible: Uint8Array, width: number, y: number, h: number): number {
  let left = 0;
  for (let row = Math.max(0, y); row < y + h; row++) {
    let x = 0;
    while (x < width && !visible[row * width + x]) x++;
    if (x < width) left = Math.max(left, x);
  }
  return left;
}
