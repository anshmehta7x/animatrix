/**
 * Canvas → LED frame mapping.
 *
 * - **planar**: the canvas covers the panel's physical rectangle with (near-)square pixels; each
 *   LED averages an N×N supersampled footprint at its real position.
 * - **diagonal**: G-Helper-style 45° mode. The staggered lattice is a square grid rotated 45°;
 *   each canvas pixel is exactly one LED (`row = x + y`, `u = x - y` in half-pitch units).
 */
import { Canvas } from "./canvas.js";
import { latticeFor, type Lattice } from "./geometry.js";
import { InvalidArgumentError } from "./errors.js";
import type { ModelProfile } from "./profile.js";

/** Mapping mode. */
export type MappingMode = "planar" | "diagonal";

/** Options for {@link Mapper}. */
export interface MapperOptions {
  /** Default `planar`. */
  mode?: MappingMode;
  /** Planar supersampling factor per axis (default 3, 1 = point sampling). */
  supersample?: number;
  /** Planar canvas size override; defaults to the profile's logical canvas. */
  width?: number;
  height?: number;
}

/** Converts canvases of a fixed size into frames for one profile. */
export class Mapper {
  readonly lattice: Lattice;
  readonly mode: MappingMode;
  /** Canvas width this mapper expects. */
  readonly width: number;
  /** Canvas height this mapper expects. */
  readonly height: number;
  /** Samples per LED. */
  private readonly per: number;
  /** Flattened canvas indices, `per` per LED, -1 = outside. */
  private readonly samples: Int32Array;

  constructor(profile: ModelProfile, opts: MapperOptions = {}) {
    this.lattice = latticeFor(profile);
    this.mode = opts.mode ?? "planar";
    if (this.mode === "diagonal") {
      const d = diagonalLayout(this.lattice);
      this.width = d.width;
      this.height = d.height;
      this.per = 1;
      this.samples = Int32Array.from(this.lattice.leds, (_, i) => d.pixel[i]!);
    } else {
      const n = Math.max(1, Math.round(opts.supersample ?? 3));
      this.width = opts.width ?? profile.canvas.width;
      this.height = opts.height ?? profile.canvas.height;
      this.per = n * n;
      this.samples = planarSamples(this.lattice, this.width, this.height, n);
    }
  }

  /** A blank canvas of the right size. */
  createCanvas(): Canvas {
    return new Canvas(this.width, this.height);
  }

  /** Map a canvas to a frame (writes into `out` if given). */
  map(canvas: Canvas, out?: Uint8Array): Uint8Array {
    if (canvas.width !== this.width || canvas.height !== this.height) {
      throw new InvalidArgumentError(
        `canvas is ${canvas.width}×${canvas.height}, mapper expects ${this.width}×${this.height}`,
      );
    }
    const frame = out ?? this.lattice.createFrame();
    const max = this.lattice.profile.maxValue;
    const { leds } = this.lattice;
    for (let i = 0; i < leds.length; i++) {
      let sum = 0;
      for (let k = 0; k < this.per; k++) {
        const idx = this.samples[i * this.per + k]!;
        if (idx >= 0) sum += canvas.data[idx]!;
      }
      frame[leds[i]!.index] = Math.min(max, Math.round(sum / this.per));
    }
    return frame;
  }

  /** Canvas position of each LED's centre (for previews and tests), in LED order. */
  ledCentres(): { x: number; y: number }[] {
    if (this.mode === "diagonal") {
      return Array.from(this.samples, (idx) => ({
        x: (idx % this.width) + 0.5,
        y: Math.floor(idx / this.width) + 0.5,
      }));
    }
    const { sx, sy } = planarScale(this.lattice, this.width, this.height);
    const { pitchCm } = this.lattice.profile;
    return this.lattice.leds.map((l) => ({
      x: (l.xCm + pitchCm.x / 2) / sx,
      y: (l.yCm + pitchCm.y / 2) / sy,
    }));
  }
}

function planarScale(lattice: Lattice, w: number, h: number): { sx: number; sy: number } {
  return { sx: lattice.widthCm / w, sy: lattice.heightCm / h };
}

function planarSamples(lattice: Lattice, w: number, h: number, n: number): Int32Array {
  const { sx, sy } = planarScale(lattice, w, h);
  const { pitchCm } = lattice.profile;
  const out = new Int32Array(lattice.leds.length * n * n);
  lattice.leds.forEach((led, i) => {
    const cx = led.xCm + pitchCm.x / 2;
    const cy = led.yCm + pitchCm.y / 2;
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const px = Math.floor((cx + ((k + 0.5) / n - 0.5) * pitchCm.x) / sx);
        const py = Math.floor((cy + ((j + 0.5) / n - 0.5) * pitchCm.y) / sy);
        const inside = px >= 0 && py >= 0 && px < w && py < h;
        out[i * n * n + j * n + k] = inside ? py * w + px : -1;
      }
    }
  });
  return out;
}

/** Diagonal canvas layout: size plus the pixel index of every LED. */
export function diagonalLayout(lattice: Lattice): {
  width: number;
  height: number;
  pixel: number[];
} {
  const coords = lattice.leds.map((l) => ({
    x: Math.floor((l.v + l.u) / 2),
    y: Math.floor((l.v - l.u) / 2),
  }));
  const minX = Math.min(...coords.map((c) => c.x));
  const minY = Math.min(...coords.map((c) => c.y));
  const width = Math.max(...coords.map((c) => c.x)) - minX + 1;
  const height = Math.max(...coords.map((c) => c.y)) - minY + 1;
  // Canvas x runs along the diagonal cut (down-right on the lid); canvas "up" points toward the
  // panel's top-right corner, so text reads along the cut tilted clockwise.
  const pixel = coords.map((c) => (c.y - minY) * width + (c.x - minX));
  return { width, height, pixel };
}
