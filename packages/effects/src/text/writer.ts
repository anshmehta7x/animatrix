/**
 * One text API over both font kinds: built-in pixel fonts (synchronous) and system fonts
 * (rasterised asynchronously, then cached). Effects call `prepare()` for strings they will need
 * and `draw()` every frame.
 */
import { Canvas, FONTS, canDrawWith, fontById } from "@anshmehta7x/animatrix-core";
import type { GreyImage } from "../media/decode.js";
import { str, num } from "../params.js";
import type { ParamValues } from "../types.js";
import { rasterHeight, rasterText } from "./raster.js";

/** Resolved font choice. */
export interface FontChoice {
  kind: "pixel" | "system";
  /** Pixel font id or system family. */
  id: string;
  /** Target glyph height in px. */
  size: number;
  /** Bold weight (system fonts only). */
  bold?: boolean;
}

/** Read the shared FONT_PARAMS. */
export function fontFromParams(p: ParamValues, sizeOverride?: number): FontChoice {
  const font = str(p, "font");
  const size = sizeOverride ?? num(p, "size");
  if (font in FONTS) return { kind: "pixel", id: font, size };
  const family = font === "custom" ? str(p, "customFont") || "sans-serif" : font;
  return { kind: "system", id: family, size };
}

/** Draws strings in a chosen font. */
export class TextWriter {
  private readonly ready = new Map<string, GreyImage>();
  private readonly pending = new Set<string>();

  private fallbackWriter: TextWriter | null = null;

  constructor(readonly font: FontChoice) {}

  /**
   * For pixel fonts, a system-font writer used for text the pixel font can't draw (non-Latin
   * titles, emoji). Same pixel height, so layout stays put.
   */
  private route(text: string): TextWriter | null {
    if (this.font.kind !== "pixel" || canDrawWith(fontById(this.font.id), text)) return null;
    this.fallbackWriter ??= new TextWriter({
      kind: "system",
      id: "sans-serif",
      size: this.height * 0.85,
    });
    return this.fallbackWriter;
  }

  /** Integer scale for pixel fonts. */
  private get scale(): number {
    return Math.max(1, Math.round(this.font.size / fontById(this.font.id).height));
  }

  /** Line height in px. */
  get height(): number {
    return this.font.kind === "pixel"
      ? fontById(this.font.id).height * this.scale
      : rasterHeight(this.font.size);
  }

  /** Start rasterising `text` (system fonts). Resolves when ready. */
  async prepare(text: string): Promise<void> {
    const other = this.route(text);
    if (other) return other.prepare(text);
    if (this.font.kind === "pixel" || this.ready.has(text)) return;
    this.pending.add(text);
    const img = await rasterText(text, this.font.id, this.font.size, this.font.bold ?? false);
    this.ready.set(text, img);
    this.pending.delete(text);
    if (this.ready.size > 64) this.ready.delete(this.ready.keys().next().value!);
  }

  /** Width of `text`, or null if a system-font raster isn't ready yet. */
  measure(text: string): number | null {
    const other = this.route(text);
    if (other) return other.measure(text);
    if (this.font.kind === "pixel") {
      return new Canvas(1, 1).measureText(text, { font: this.font.id, scale: this.scale });
    }
    return this.ready.get(text)?.width ?? null;
  }

  /**
   * Draw `text` with its top-left at (x, y). Returns false (and draws nothing) if a system-font
   * raster isn't ready; it then starts preparing it.
   */
  draw(canvas: Canvas, x: number, y: number, text: string, value = 255): boolean {
    const other = this.route(text);
    if (other) return other.draw(canvas, x, y, text, value);
    if (this.font.kind === "pixel") {
      canvas.text(x, y, text, { font: this.font.id, scale: this.scale, value });
      return true;
    }
    const img = this.ready.get(text);
    if (!img) {
      if (!this.pending.has(text)) void this.prepare(text).catch(() => undefined);
      return false;
    }
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const v = img.data[(yy * img.width + xx) * 2]!;
        if (v > 0) canvas.max(xi + xx, yi + yy, (v * value) / 255);
      }
    }
    return true;
  }
}
