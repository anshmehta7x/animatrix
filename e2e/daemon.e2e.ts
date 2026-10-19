/**
 * End-to-end: the built animatrixd on a private D-Bus bus, driven through the client library
 * and the CLI, with the mock device's packets checked byte for byte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Matrix, type DaemonState } from "@anshmehta7x/animatrix";
import { Harness, hasDbusDaemon, waitFor, writePng } from "./harness.js";

const INIT = `5e${Buffer.from("ASUS Tech.Inc.").toString("hex")}`;
const PANE = "5ec002";
const FLUSH = "5ec003";
const BRIGHTNESS = "5ec004";
const DISPLAY = "5ec301";
const BUILTINS = "5ec401";
const PACKET_HEX = 640 * 2;

/** Rebuild the frame from the panes sent before the last flush. */
function lastFrame(packets: string[], slots: number): Uint8Array {
  const end = packets.lastIndexOf(packets.findLast((p) => p.startsWith(FLUSH))!);
  const frame = new Uint8Array(slots);
  const start = packets.slice(0, end).findLastIndex((p) => !p.startsWith(PANE)) + 1;
  for (const hex of packets.slice(start, end)) {
    const p = Buffer.from(hex, "hex");
    const addr = p.readUInt16LE(3) - 1;
    const len = p.readUInt16LE(5);
    frame.set(p.subarray(7, 7 + Math.min(len, slots - addr)), addr);
  }
  return frame;
}

describe.skipIf(!hasDbusDaemon())("animatrixd end to end", () => {
  const h = new Harness();
  let slots = 0;

  beforeAll(async () => {
    await h.start();
    slots = (await (await h.client()).info()).slots;
  }, 20_000);
  afterAll(() => h.stop());

  it("handshakes with the device and reports it on the bus", async () => {
    const c = await h.client();
    const info = await c.info();
    expect(info).toMatchObject({ model: "GA402", transport: "mock", tested: true });
    expect(h.packets()[0]).toBe(INIT.padEnd(PACKET_HEX, "0"));
    expect(h.packets().every((p) => p.length === PACKET_HEX)).toBe(true);
    expect((await c.state()).connected).toBe(true);
  });

  it("sends a frame sent over D-Bus as three panes and a flush", async () => {
    const c = await h.client();
    await c.stop();
    await c.setSoftBrightness(1);
    const frame = Uint8Array.from({ length: slots }, (_, i) => (i * 7) % 256);
    const since = h.packets().length;
    await c.showFrame(frame);
    await h.waitForPacket(FLUSH, since, "flush");
    const sent = h.packets().slice(since);
    expect(sent.filter((p) => p.startsWith(PANE))).toHaveLength(3);
    expect(lastFrame(h.packets(), slots)).toEqual(frame);
    expect(await c.frame()).toEqual(frame);
  });

  it("scales frames by software brightness", async () => {
    const c = await h.client();
    await c.setSoftBrightness(0.5);
    const since = h.packets().length;
    await c.showFrame(new Uint8Array(slots).fill(200));
    await h.waitForPacket(FLUSH, since);
    const out = lastFrame(h.packets(), slots);
    expect(Math.abs(out[0]! - 100)).toBeLessThanOrEqual(1);
    await c.setSoftBrightness(1);
  });

  it("plays an effect and streams frames, with state signals", async () => {
    const c = await h.client();
    const states: DaemonState[] = [];
    c.onState((s) => states.push(s));
    const since = h.packets().length;
    await c.play("text", { text: "e2e", scroll: false });
    await h.waitForPacket(FLUSH, since);
    const s = await c.state();
    expect(s).toMatchObject({ content: "effect", effect: "text" });
    expect(s.params.text).toBe("e2e");
    expect(lastFrame(h.packets(), slots).some((v) => v > 0)).toBe(true);
    await waitFor(() => states.find((x) => x.effect === "text"), "StateChanged signal");
  });

  it("maps errors to typed D-Bus errors without changing what plays", async () => {
    const c = await h.client();
    await expect(c.play("no-such-effect", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(c.setHardwareBrightness(7 as 0)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    expect((await c.state()).effect).toBe("text");
  });

  it("sends brightness and display packets from CLI commands", async () => {
    let since = h.packets().length;
    expect((await h.cli("brightness", "low")).code).toBe(0);
    await h.waitForPacket(`${BRIGHTNESS}01`, since, "brightness 1");

    since = h.packets().length;
    expect((await h.cli("off")).code).toBe(0);
    await h.waitForPacket(`${DISPLAY}80`, since, "display off");
    const c = await h.client();
    expect(await c.state()).toMatchObject({ displayOn: false, gate: "user" });

    since = h.packets().length;
    expect((await h.cli("on")).code).toBe(0);
    await h.waitForPacket(`${DISPLAY}00`, since, "display on");
    expect((await h.cli("brightness", "high")).code).toBe(0);
  });

  it("decodes and shows an image file", async () => {
    const png = join(h.dir, "half.png");
    writePng(png, 68, 44, (x) => x >= 34);
    const since = h.packets().length;
    const res = await h.cli("image", png, "--fit", "stretch");
    expect(res.code, res.err).toBe(0);
    await h.waitForPacket(FLUSH, since);
    const frame = lastFrame(h.packets(), slots);
    expect(frame.filter((v) => v > 200).length).toBeGreaterThan(300);
    expect(frame.filter((v) => v === 0).length).toBeGreaterThan(300);
    expect((await (await h.client()).state()).effect).toBe("image");
  });

  it("hands the panel to firmware animations", async () => {
    const since = h.packets().length;
    const res = await h.cli("builtins", "--awake", "rogLogoGlitch");
    expect(res.code, res.err).toBe(0);
    await h.waitForPacket(`${BUILTINS}00`, since, "built-ins on");
    expect((await (await h.client()).state()).content).toBe("builtins");
  });

  it("saves, lists, applies and deletes scenes", async () => {
    expect((await h.cli("clock")).code).toBe(0);
    expect((await h.cli("scene", "save", "E2E clock")).code).toBe(0);
    expect(readFileSync(h.config, "utf8")).toContain("E2E clock");
    expect((await h.cli("scene", "list")).out).toContain("E2E clock");

    await h.cli("stop");
    expect((await h.cli("scene", "apply", "E2E clock")).code).toBe(0);
    expect(await (await h.client()).state()).toMatchObject({ effect: "clock", scene: "E2E clock" });

    expect((await h.cli("scene", "delete", "E2E clock")).code).toBe(0);
    expect(readFileSync(h.config, "utf8")).not.toContain("E2E clock");
  });

  it("changes config through the CLI and persists it", async () => {
    const res = await h.cli("config", "set", "playlist.intervalSec=120");
    expect(res.code, res.err).toBe(0);
    expect(readFileSync(h.config, "utf8")).toMatch(/intervalSec = 120/);
    const cfg = await (await h.client()).config<{ playlist: { intervalSec: number } }>();
    expect(cfg.playlist.intervalSec).toBe(120);
  });

  it("reports CLI errors with a non-zero exit code", async () => {
    const res = await h.cli("play", "no-such-effect");
    expect(res.code).not.toBe(0);
    expect(res.err).toMatch(/no-such-effect/);
  });

  it("serves the library through the daemon", async () => {
    const m = await Matrix.open();
    try {
      expect(m.via).toBe("daemon");
      const since = h.packets().length;
      await m.draw((c) => {
        c.clear();
        c.rect(0, 0, c.width, c.height, 255);
      });
      await h.waitForPacket(FLUSH, since);
      expect(lastFrame(h.packets(), slots).filter((v) => v === 255).length).toBeGreaterThan(1000);
    } finally {
      await m.close();
    }
  });

  it("refuses a second daemon on the same bus", async () => {
    const second = h.spawnDaemon();
    const code = await new Promise((r) => second.once("exit", r));
    expect(code).toBe(1);
  });

  it("shuts down cleanly and comes back on restart", async () => {
    await (await h.client()).play("text", { text: "again", scroll: false });
    expect(await h.stopDaemon()).toBe(0);
    const since = h.packets().length;
    await h.startDaemon();
    expect(h.packets()[since]).toBe(INIT.padEnd(PACKET_HEX, "0"));
    expect((await (await h.client()).state()).connected).toBe(true);
  });
});
