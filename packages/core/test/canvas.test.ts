import { describe, expect, it } from "vitest";
import { Canvas, FONTS, applyTone, scaleFrame, toneLut } from "../src/index.js";
import { RAW_FONTS } from "../src/fonts/index.js";

describe("Canvas", () => {
  it("sets, reads and ignores out-of-range pixels", () => {
    const c = new Canvas(4, 3);
    c.pixel(1, 2, 77).pixel(-1, 0, 9).pixel(4, 0, 9);
    expect(c.get(1, 2)).toBe(77);
    expect(c.get(-1, 0)).toBe(0);
    expect(c.data.reduce((a, b) => a + b, 0)).toBe(77);
  });

  it("rejects invalid sizes", () => {
    expect(() => new Canvas(0, 5)).toThrow(RangeError);
    expect(() => new Canvas(2.5, 5)).toThrow(RangeError);
  });

  it("draws lines end to end", () => {
    const c = new Canvas(10, 10).line(0, 0, 9, 9);
    for (let i = 0; i < 10; i++) expect(c.get(i, i)).toBe(255);
  });

  it("draws and measures text", () => {
    const c = new Canvas(40, 10);
    const w = c.text(0, 0, "Hi");
    expect(w).toBe(c.measureText("Hi"));
    expect(w).toBe(5 + 1 + 3);
    expect(c.get(0, 0)).toBe(255); // left stem of H
    expect(c.measureText("Hi", { scale: 2 })).toBe(18);
  });

  it("converts RGBA with luma and alpha", () => {
    const c = Canvas.fromPixels(2, 1, [255, 255, 255, 255, 255, 0, 0, 128]);
    expect(c.get(0, 0)).toBe(255);
    expect(c.get(1, 0)).toBe(Math.round(0.299 * 255 * (128 / 255)));
  });
});

describe("fonts", () => {
  it("every glyph has the font's height", () => {
    for (const [id, table] of Object.entries(RAW_FONTS)) {
      const h = FONTS[id]!.height;
      for (const [ch, src] of Object.entries(table)) {
        expect(src.split("/").length, `${id} '${ch}'`).toBe(h);
      }
    }
  });

  it("falls back to upper case and then '?'", () => {
    const f = FONTS["3x5"]!;
    expect(f.glyph("a")).toBe(f.glyph("A"));
    expect(f.glyph("€")).toBe(f.glyph("?"));
  });
});

describe("tone", () => {
  it("identity LUT leaves values unchanged", () => {
    const lut = toneLut({});
    expect(Array.from(lut)).toEqual(Array.from({ length: 256 }, (_, i) => i));
  });

  it("inverts and thresholds", () => {
    const c = new Canvas(3, 1, Uint8ClampedArray.from([0, 100, 255]));
    applyTone(c, { invert: true, threshold: 128 });
    expect(Array.from(c.data)).toEqual([255, 255, 0]);
  });

  it("dithers to two levels only", () => {
    const c = new Canvas(8, 8).clear(128);
    applyTone(c, { dither: "floyd-steinberg" });
    expect(new Set(c.data)).toEqual(new Set([0, 255]));
    const lit = c.data.filter((v) => v === 255).length;
    expect(lit).toBeGreaterThan(20);
    expect(lit).toBeLessThan(44);
  });

  it("ordered dither keeps mean brightness", () => {
    const c = new Canvas(8, 8).clear(64);
    applyTone(c, { dither: "ordered" });
    const mean = c.data.reduce((a, b) => a + b, 0) / 64;
    expect(Math.abs(mean - 64)).toBeLessThan(20);
  });

  it("scales frames for software brightness", () => {
    expect(Array.from(scaleFrame(Uint8Array.from([0, 200]), 0.5))).toEqual([0, 100]);
    const f = Uint8Array.from([5]);
    expect(scaleFrame(f, 1)).toBe(f);
  });
});
