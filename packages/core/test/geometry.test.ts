import { describe, expect, it } from "vitest";
import {
  Canvas,
  GA401,
  GA402,
  GU604,
  Lattice,
  Mapper,
  PROFILES,
  UnsupportedModelError,
  detectProfile,
  ledCount,
  profileById,
  slotCount,
  wireLength,
} from "../src/index.js";

describe("profiles", () => {
  it("has the documented LED totals", () => {
    expect(ledCount(GA402)).toBe(1449);
    expect(slotCount(GA402)).toBe(1449);
    expect(ledCount(GA401)).toBe(1215);
    expect(slotCount(GA401)).toBe(1245);
    expect(ledCount(GU604)).toBe(1711);
  });

  it("fits every frame into its panes", () => {
    for (const p of PROFILES) expect(wireLength(p)).toBeGreaterThanOrEqual(slotCount(p));
  });

  it("GA402 row starts match the research table", () => {
    const l = new Lattice(GA402);
    expect(l.indexOf(0, 0)).toBe(0);
    expect(l.indexOf(0, 11)).toBe(374);
    expect(l.indexOf(1, 12)).toBe(408);
    expect(l.indexOf(0, 12)).toBe(-1);
    expect(l.indexOf(25, 60)).toBe(1440);
    expect(l.indexOf(33, 60)).toBe(1448);
    expect(l.indexOf(34, 60)).toBe(-1);
    expect(l.indexOf(0, 61)).toBe(-1);
  });

  it("GA401 starts at buffer index 1 and leaves dead slots", () => {
    const l = new Lattice(GA401);
    expect(l.indexOf(0, 0)).toBe(1);
    expect(l.indexOf(0, 1)).toBe(34);
    const used = new Set(l.leds.map((x) => x.index));
    expect(used.has(0)).toBe(false);
    expect(used.has(67)).toBe(false); // trailing dead slots of row 1
  });

  it("every LED has a unique buffer index", () => {
    for (const p of PROFILES) {
      const l = new Lattice(p);
      expect(new Set(l.leds.map((x) => x.index)).size).toBe(ledCount(p));
    }
  });

  it("odd rows are offset by half a pitch", () => {
    const l = new Lattice(GA402);
    const r0 = l.leds.find((x) => x.row === 0 && x.col === 0)!;
    const r1 = l.leds.find((x) => x.row === 1 && x.col === 0)!;
    expect(r1.u - r0.u).toBe(1);
  });
});

describe("detectProfile", () => {
  it("detects GA402 from DMI product_name", () => {
    expect(detectProfile("ROG Zephyrus G14 GA402XU_GA402XU").id).toBe("GA402");
    expect(detectProfile("GA401IV").id).toBe("GA401");
  });

  it("refuses Slash laptops that share the USB ID", () => {
    expect(() => detectProfile("ROG Zephyrus G14 GA403UV")).toThrow(UnsupportedModelError);
  });

  it("refuses unknown models", () => {
    expect(() => detectProfile("ThinkPad X1")).toThrow(UnsupportedModelError);
  });

  it("looks up by id", () => {
    expect(profileById("ga402")).toBe(GA402);
    expect(profileById("nope")).toBeNull();
  });
});

describe("Mapper", () => {
  it("planar: a uniform canvas lights every LED with that value", () => {
    const m = new Mapper(GA402);
    const frame = m.map(m.createCanvas().clear(200));
    const l = m.lattice;
    expect(l.leds.every((x) => frame[x.index] === 200)).toBe(true);
  });

  it("planar: a black canvas gives a dark frame", () => {
    const m = new Mapper(GA402);
    expect(m.map(m.createCanvas()).every((v) => v === 0)).toBe(true);
  });

  it("planar: left half lit lights only LEDs on the left", () => {
    const m = new Mapper(GA402, { supersample: 1 });
    const c = m.createCanvas();
    c.rect(0, 0, c.width / 2, c.height, 255);
    const frame = m.map(c);
    const centres = m.ledCentres();
    m.lattice.leds.forEach((led, i) => {
      const lit = frame[led.index]! > 0;
      expect(lit).toBe(centres[i]!.x < c.width / 2);
    });
  });

  it("diagonal: round-trips one pixel per LED", () => {
    const m = new Mapper(GA402, { mode: "diagonal" });
    const centres = m.ledCentres();
    const keys = new Set(centres.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(1449);
    m.lattice.leds.forEach((led, i) => {
      if (i % 97 !== 0) return;
      const c = m.createCanvas();
      c.pixel(centres[i]!.x, centres[i]!.y, 123);
      const frame = m.map(c);
      expect(frame[led.index]).toBe(123);
      expect(frame.reduce((a, b) => a + b, 0)).toBe(123);
    });
  });

  it("rejects a canvas of the wrong size", () => {
    expect(() => new Mapper(GA402).map(new Canvas(10, 10))).toThrow();
  });

  it("clamps to the profile's maxValue", () => {
    const m = new Mapper({ ...GA402, maxValue: 254 });
    const frame = m.map(m.createCanvas().clear(255));
    expect(Math.max(...frame)).toBe(254);
  });
});

describe("safe area", () => {
  it("finds a fully visible rectangle away from the cut corner", async () => {
    const { largestRect } = await import("../src/index.js");
    const m = new Mapper(GA402);
    const r = m.safeArea();
    const cov = m.coverage();
    expect(r.width * r.height).toBeGreaterThan(800);
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) expect(cov[y * m.width + x]).toBe(1);
    // bottom-left corner is in the cut
    expect(cov[(m.height - 1) * m.width]).toBe(0);
    expect(largestRect(Uint8Array.from([1, 1, 0, 1, 1, 1]), 3, 2)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
  });
});
