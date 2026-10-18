import { PIXEL_3X5 } from "./pixel3x5.js";
import { PIXEL_5X7 } from "./pixel5x7.js";

/** A parsed glyph: `bits[row][col]`. */
export interface Glyph {
  readonly width: number;
  readonly bits: readonly (readonly boolean[])[];
}

/** A bitmap font usable by {@link Canvas.text}. */
export interface PixelFont {
  /** Font id, e.g. `"5x7"`. */
  readonly id: string;
  /** Glyph height in pixels. */
  readonly height: number;
  /** Look up a glyph, falling back to upper case, then to "?". */
  glyph(ch: string): Glyph;
}

function parseGlyph(src: string): Glyph {
  const rows = src.split("/");
  const width = Math.max(...rows.map((r) => r.length));
  return { width, bits: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] === "#")) };
}

function buildFont(id: string, height: number, table: Record<string, string>): PixelFont {
  const glyphs = new Map(Object.entries(table).map(([ch, src]) => [ch, parseGlyph(src)]));
  const fallback = glyphs.get("?") ?? parseGlyph("#");
  return {
    id,
    height,
    glyph: (ch) => glyphs.get(ch) ?? glyphs.get(ch.toUpperCase()) ?? fallback,
  };
}

/** Built-in fonts by id. */
export const FONTS: Readonly<Record<string, PixelFont>> = {
  "5x7": buildFont("5x7", 7, PIXEL_5X7),
  "3x5": buildFont("3x5", 5, PIXEL_3X5),
};

/** Ids of the built-in fonts. */
export const FONT_IDS = Object.keys(FONTS);

/** Get a built-in font by id; defaults to `5x7`. */
export function fontById(id: string | null | undefined): PixelFont {
  return (id ? FONTS[id] : undefined) ?? FONTS["5x7"]!;
}

/** Raw glyph tables, for tests. @internal */
export const RAW_FONTS = { "5x7": PIXEL_5X7, "3x5": PIXEL_3X5 } as const;
