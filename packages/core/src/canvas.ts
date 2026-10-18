/**
 * A plain greyscale raster that effects draw into. Values are 0 (off) to 255 (full). Effects never
 * touch LED addresses; a {@link Mapper} turns a canvas into a frame.
 */
import { InvalidArgumentError } from "./errors.js";
import { fontById, type PixelFont } from "./fonts/index.js";

/** Options for {@link Canvas.text}. */
export interface TextOptions {
  /** Brightness of lit pixels (default 255). */
  value?: number;
  /** Built-in font id or font object (default `5x7`). */
  font?: string | PixelFont;
  /** Integer scale factor (default 1). */
  scale?: number;
  /** Pixels between glyphs (default 1). */
  spacing?: number;
  /** Horizontal anchor relative to `x` (default `left`). */
  align?: "left" | "center" | "right";
}

/** A greyscale drawing surface. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  /** Row-major pixel data, `width * height` bytes. */
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new InvalidArgumentError(`invalid canvas size ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height);
  }

  /** Set every pixel to `value` (default 0). */
  clear(value = 0): this {
    this.data.fill(value);
    return this;
  }

  /** Read a pixel; out-of-range reads return 0. */
  get(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return 0;
    return this.data[yi * this.width + xi]!;
  }

  /** Set a pixel (ignored if out of range). */
  pixel(x: number, y: number, value = 255): this {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi >= 0 && yi >= 0 && xi < this.width && yi < this.height) {
      this.data[yi * this.width + xi] = value;
    }
    return this;
  }

  /** Brighten a pixel to at least `value` (useful for overlapping strokes). */
  max(x: number, y: number, value: number): this {
    return this.pixel(x, y, Math.max(this.get(x, y), value));
  }

  /** Multiply every pixel by `factor` (0..1), e.g. for trails. */
  fade(factor: number): this {
    for (let i = 0; i < this.data.length; i++) this.data[i] = this.data[i]! * factor;
    return this;
  }

  /** Axis-aligned rectangle, filled or outlined. */
  rect(x: number, y: number, w: number, h: number, value = 255, fill = true): this {
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        const edge =
          yy === Math.floor(y) || xx === Math.floor(x) || yy >= y + h - 1 || xx >= x + w - 1;
        if (fill || edge) this.pixel(xx, yy, value);
      }
    }
    return this;
  }

  /** Line from (x0, y0) to (x1, y1), Bresenham. */
  line(x0: number, y0: number, x1: number, y1: number, value = 255): this {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.pixel(x, y, value);
      if (x === xe && y === ye) return this;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Circle centred on (cx, cy). */
  circle(cx: number, cy: number, r: number, value = 255, fill = false): this {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (fill ? d <= r : Math.abs(d - r) < 0.6) this.pixel(x, y, value);
      }
    }
    return this;
  }

  /** Width in pixels that {@link text} would draw. */
  measureText(str: string, opts: TextOptions = {}): number {
    const font = resolveFont(opts.font);
    const scale = opts.scale ?? 1;
    const spacing = opts.spacing ?? 1;
    const glyphs = [...str].map((ch) => font.glyph(ch).width);
    if (glyphs.length === 0) return 0;
    return (glyphs.reduce((a, b) => a + b, 0) + spacing * (glyphs.length - 1)) * scale;
  }

  /**
   * Draw text with its top-left at (x, y) using a built-in pixel font. Returns the drawn width.
   */
  text(x: number, y: number, str: string, opts: TextOptions = {}): number {
    const font = resolveFont(opts.font);
    const scale = Math.max(1, Math.round(opts.scale ?? 1));
    const spacing = opts.spacing ?? 1;
    const value = opts.value ?? 255;
    const width = this.measureText(str, opts);
    const align = opts.align ?? "left";
    let cx = Math.round(align === "center" ? x - width / 2 : align === "right" ? x - width : x);
    for (const ch of str) {
      const g = font.glyph(ch);
      g.bits.forEach((row, gy) =>
        row.forEach((on, gx) => {
          if (on) this.rect(cx + gx * scale, y + gy * scale, scale, scale, value);
        }),
      );
      cx += (g.width + spacing) * scale;
    }
    return width;
  }

  /** Copy another canvas onto this one at (dx, dy); zero pixels are transparent if `keyZero`. */
  blit(src: Canvas, dx: number, dy: number, keyZero = false): this {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const v = src.data[y * src.width + x]!;
        if (!keyZero || v > 0) this.pixel(x + dx, y + dy, v);
      }
    }
    return this;
  }

  /** A deep copy. */
  clone(): Canvas {
    return new Canvas(this.width, this.height, new Uint8ClampedArray(this.data));
  }

  /**
   * Build a canvas from RGBA (or greyscale with `channels = 1`) pixels. Alpha premultiplies onto
   * black. Grey uses Rec. 601 luma (0.299 R + 0.587 G + 0.114 B).
   */
  static fromPixels(
    width: number,
    height: number,
    pixels: ArrayLike<number>,
    channels = 4,
  ): Canvas {
    const c = new Canvas(width, height);
    for (let i = 0; i < width * height; i++) {
      const o = i * channels;
      if (channels === 1) {
        c.data[i] = pixels[o]!;
      } else {
        const luma = 0.299 * pixels[o]! + 0.587 * pixels[o + 1]! + 0.114 * pixels[o + 2]!;
        const alpha = channels === 4 ? pixels[o + 3]! / 255 : 1;
        c.data[i] = luma * alpha;
      }
    }
    return c;
  }
}

function resolveFont(font: string | PixelFont | undefined): PixelFont {
  return typeof font === "object" ? font : fontById(font);
}
