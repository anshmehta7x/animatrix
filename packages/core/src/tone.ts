/**
 * Tone adjustments applied to a canvas before mapping: brightness, contrast, gamma, invert,
 * threshold and dithering.
 */
import type { Canvas } from "./canvas.js";

/** Dithering algorithm. */
export type DitherMode = "none" | "ordered" | "floyd-steinberg";

/** Tone options. Every field is optional; defaults leave the image unchanged. */
export interface ToneOptions {
  /** Multiplier, 0..4 (default 1). */
  brightness?: number;
  /** Contrast around mid-grey, 0..4 (default 1). */
  contrast?: number;
  /** Gamma exponent, 0.1..5 (default 1; >1 darkens mid-tones). */
  gamma?: number;
  /** Invert before anything else. */
  invert?: boolean;
  /** If set (0..255), output is binary: >= threshold → 255, else 0. Applied after the LUT. */
  threshold?: number | null;
  /** Quantise with dithering to `levels` grey levels (default `none`). */
  dither?: DitherMode;
  /** Grey levels for dithering, 2..256 (default 2). */
  levels?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Build a 256-entry lookup table for invert/contrast/brightness/gamma. */
export function toneLut(opts: ToneOptions): Uint8Array {
  const brightness = clamp(opts.brightness ?? 1, 0, 4);
  const contrast = clamp(opts.contrast ?? 1, 0, 4);
  const gamma = clamp(opts.gamma ?? 1, 0.1, 5);
  return Uint8Array.from({ length: 256 }, (_, i) => {
    let v = (opts.invert ? 255 - i : i) / 255;
    v = (v - 0.5) * contrast + 0.5;
    v = clamp(v * brightness, 0, 1);
    return Math.round(Math.pow(v, gamma) * 255);
  });
}

/** True when the options would not change any pixel. */
export function isIdentityTone(opts: ToneOptions): boolean {
  return (
    (opts.brightness ?? 1) === 1 &&
    (opts.contrast ?? 1) === 1 &&
    (opts.gamma ?? 1) === 1 &&
    !opts.invert &&
    (opts.threshold ?? null) === null &&
    (opts.dither ?? "none") === "none"
  );
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Apply tone options to a canvas in place and return it. */
export function applyTone(canvas: Canvas, opts: ToneOptions): Canvas {
  if (isIdentityTone(opts)) return canvas;
  const lut = toneLut(opts);
  const { data, width, height } = canvas;
  for (let i = 0; i < data.length; i++) data[i] = lut[data[i]!]!;
  const threshold = opts.threshold ?? null;
  if (threshold !== null) {
    for (let i = 0; i < data.length; i++) data[i] = data[i]! >= threshold ? 255 : 0;
    return canvas;
  }
  const levels = clamp(Math.round(opts.levels ?? 2), 2, 256);
  const step = 255 / (levels - 1);
  const quant = (v: number): number => clamp(Math.round(v / step) * step, 0, 255);
  if (opts.dither === "ordered") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bias = (BAYER4[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * step;
        data[y * width + x] = quant(data[y * width + x]! + bias);
      }
    }
  } else if (opts.dither === "floyd-steinberg") {
    const buf = Float32Array.from(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const q = quant(buf[i]!);
        const err = buf[i]! - q;
        data[i] = q;
        if (x + 1 < width) buf[i + 1]! += (err * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) buf[i + width - 1]! += (err * 3) / 16;
          buf[i + width]! += (err * 5) / 16;
          if (x + 1 < width) buf[i + width + 1]! += err / 16;
        }
      }
    }
  }
  return canvas;
}

/**
 * Apply software brightness (0..1) and gamma to a frame, returning a new buffer. Used by the
 * daemon on top of hardware brightness.
 */
export function scaleFrame(frame: Uint8Array, brightness: number, gamma = 1): Uint8Array {
  if (brightness === 1 && gamma === 1) return frame;
  const lut = toneLut({ brightness, gamma });
  return frame.map((v) => lut[v]!);
}
