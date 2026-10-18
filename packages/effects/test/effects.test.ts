import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { Canvas, GA402, InvalidArgumentError } from "@anshmehta7x/animatrix-core";
import {
  BUILTIN_EFFECTS,
  EffectRegistry,
  Runner,
  Services,
  decodeImage,
  formatTime,
  lifeStep,
  normaliseDelay,
  placeImage,
  resolveParams,
  type Clock,
  type Effect,
} from "../src/index.js";

const dir = mkdtempSync(join(tmpdir(), "animatrix-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Manual clock: timers fire only when advanced. */
function fakeClock(): Clock & { advance(ms: number): Promise<void> } {
  let now = 0;
  let timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      timers = timers.filter((t) => t !== h);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
        await new Promise((r) => setImmediate(r));
      }
      now = end;
    },
  };
}

describe("params", () => {
  const schema = BUILTIN_EFFECTS.find((e) => e.id === "text")!.params;
  it("fills defaults and coerces strings", () => {
    const p = resolveParams(schema, { speed: "40", scroll: "false" });
    expect(p.speed).toBe(40);
    expect(p.scroll).toBe(false);
    expect(p.font).toBe("5x7");
  });
  it("clamps numbers", () => {
    expect(resolveParams(schema, { speed: 1e6 }).speed).toBe(80);
  });
  it("rejects unknown keys and bad selects", () => {
    expect(() => resolveParams(schema, { nope: 1 })).toThrow(InvalidArgumentError);
    expect(() => resolveParams(schema, { font: "comic" })).toThrow(InvalidArgumentError);
    expect(() => resolveParams(schema, { speed: "fast" })).toThrow(InvalidArgumentError);
  });
});

describe("registry", () => {
  it("has unique ids and every default validates", () => {
    const reg = new EffectRegistry();
    const ids = reg.list().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of reg.list()) expect(() => resolveParams(e.params, {})).not.toThrow();
    expect(JSON.parse(JSON.stringify(reg.describe()))).toHaveLength(ids.length);
  });
});

describe("Runner", () => {
  const counter: Effect = {
    id: "counter",
    name: "c",
    description: "",
    category: "generative",
    fps: 10,
    params: {},
    create: () => {
      let n = 0;
      return { render: (_t, c) => void c.clear(++n % 2 ? 255 : 0) };
    },
  };

  it("renders at the effect fps and sends changed frames", async () => {
    const clock = fakeClock();
    const frames: Uint8Array[] = [];
    const r = await Runner.start({
      profile: GA402,
      effect: counter,
      services: new Services(),
      clock,
      sink: async (f) => void frames.push(f),
    });
    await clock.advance(1000);
    await r.stop();
    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(frames.length).toBeLessThanOrEqual(11);
  });

  it("caps fps at maxFps", async () => {
    const clock = fakeClock();
    let n = 0;
    const r = await Runner.start({
      profile: GA402,
      effect: { ...counter, fps: 1000 },
      services: new Services(),
      clock,
      maxFps: 20,
      sink: async () => void n++,
    });
    await clock.advance(1000);
    await r.stop();
    expect(n).toBeLessThanOrEqual(21);
  });

  it("sends static content once and then idles", async () => {
    const clock = fakeClock();
    let n = 0;
    await Runner.start({
      profile: GA402,
      effect: { ...counter, fps: 0 },
      services: new Services(),
      clock,
      sink: async () => void n++,
    });
    await clock.advance(5000);
    expect(n).toBe(1);
  });

  it("does not resend identical frames", async () => {
    const clock = fakeClock();
    let n = 0;
    const same: Effect = { ...counter, create: () => ({ render: (_t, c) => void c.clear(80) }) };
    const r = await Runner.start({
      profile: GA402,
      effect: same,
      services: new Services(),
      clock,
      sink: async () => void n++,
    });
    await clock.advance(2000);
    await r.stop();
    expect(n).toBe(1);
  });

  it("reports sink failures and stops", async () => {
    const clock = fakeClock();
    const errors: string[] = [];
    const r = await Runner.start({
      profile: GA402,
      effect: counter,
      services: new Services(),
      clock,
      sink: async () => {
        throw new Error("usb gone");
      },
      onError: (e) => errors.push(e.code),
    });
    await clock.advance(100);
    expect(errors).toEqual(["TRANSPORT_FAILED"]);
    expect(r.isStopped).toBe(true);
  });

  it("rejects bad params before starting", async () => {
    await expect(
      Runner.start({
        profile: GA402,
        effect: counter,
        params: { x: 1 },
        services: new Services(),
        sink: async () => undefined,
      }),
    ).rejects.toThrow(InvalidArgumentError);
  });
});

describe("media", () => {
  it("decodes a PNG to grey+alpha and places it", async () => {
    const file = join(dir, "white.png");
    await sharp({ create: { width: 20, height: 10, channels: 4, background: "#ffffffff" } })
      .png()
      .toFile(file);
    const { frames } = await decodeImage(file);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.width).toBe(20);
    expect(frames[0]!.data[0]).toBe(255);
    const c = new Canvas(40, 20);
    placeImage(c, frames[0]!, { fit: "stretch", scale: 1, rotate: 0, panX: 0, panY: 0 });
    expect(c.get(20, 10)).toBe(255);
  });

  it("keeps per-frame GIF delays", async () => {
    const file = join(dir, "anim.gif");
    const frame = (v: number) => Buffer.alloc(8 * 8 * 4, v);
    await sharp(Buffer.concat([frame(0), frame(255), frame(128)]), {
      raw: { width: 8, height: 24, channels: 4, pageHeight: 8 },
    })
      .gif({ delay: [50, 200, 400], loop: 0 })
      .toFile(file);
    const { frames, delays } = await decodeImage(file);
    expect(frames).toHaveLength(3);
    expect(delays).toEqual([50, 200, 400]);
  });

  it("rejects missing files with a typed error", async () => {
    await expect(decodeImage(join(dir, "missing.png"))).rejects.toMatchObject({
      code: "MEDIA_FAILED",
    });
  });

  it("treats tiny GIF delays like browsers do", () => {
    expect(normaliseDelay(0)).toBe(100);
    expect(normaliseDelay(undefined)).toBe(100);
    expect(normaliseDelay(40)).toBe(40);
  });
});

describe("helpers", () => {
  it("formats 12/24 hour time", () => {
    const d = new Date(2026, 0, 1, 13, 5);
    expect(formatTime(d, false)).toBe("13:05");
    expect(formatTime(d, true)).toBe("1:05");
  });

  it("steps a blinker in Life", () => {
    const w = 5;
    const cells = new Uint8Array(25);
    [11, 12, 13].forEach((i) => (cells[i] = 1));
    const next = lifeStep(cells, w, 5, false);
    expect([...next.keys()].filter((i) => next[i])).toEqual([7, 12, 17]);
  });
});

describe("Runner.update", () => {
  it("updates a static image in place and re-renders once", async () => {
    const file = join(dir, "half.png");
    const half = Buffer.alloc(20 * 10 * 4, 0);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) half.fill(255, (y * 20 + x) * 4, (y * 20 + x) * 4 + 4);
    await sharp(half, { raw: { width: 20, height: 10, channels: 4 } })
      .png()
      .toFile(file);
    const image = BUILTIN_EFFECTS.find((e) => e.id === "image")!;
    const clock = fakeClock();
    const frames: Uint8Array[] = [];
    const r = await Runner.start({
      profile: GA402,
      effect: image,
      params: { file, fit: "stretch" },
      services: new Services(),
      clock,
      sink: async (f) => void frames.push(f),
    });
    await clock.advance(100);
    expect(frames).toHaveLength(1);
    expect(r.update({ file, fit: "stretch", panX: 0.5 })).toBe(true);
    await clock.advance(100);
    expect(frames).toHaveLength(2);
    expect(frames[1]).not.toEqual(frames[0]);
    expect(r.params.panX).toBe(0.5);
    // a different file needs a restart
    expect(r.update({ file: join(dir, "other.png") })).toBe(false);
    // a mapping change needs a restart
    expect(r.update({ file, mapping: "diagonal" })).toBe(false);
    await r.stop();
  });

  it("refuses updates for effects without update()", async () => {
    const clock = fakeClock();
    const plasma = BUILTIN_EFFECTS.find((e) => e.id === "plasma")!;
    const r = await Runner.start({
      profile: GA402,
      effect: plasma,
      services: new Services(),
      clock,
      sink: async () => undefined,
    });
    expect(r.update({ speed: 2 })).toBe(false);
    await r.stop();
  });
});
