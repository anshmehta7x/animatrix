import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AnimeDevice, MockTransport } from "@anshmehta7x/animatrix";
import { EffectRegistry, Services } from "@anshmehta7x/animatrix-effects";
import {
  Controller,
  defaultConfig,
  inWindow,
  loadConfig,
  memoryLogger,
  normaliseConfig,
  parseHm,
  patchConfig,
  saveConfig,
} from "../src/index.js";

const dir = mkdtempSync(join(tmpdir(), "animatrixd-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("config", () => {
  it("creates defaults on first run and round-trips TOML", async () => {
    const file = join(dir, "a", "config.toml");
    const cfg = await loadConfig(file);
    expect(cfg.startupScene).toBe("Clock");
    expect(readFileSync(file, "utf8")).toContain("[device]");
    cfg.device.softBrightness = 0.5;
    await saveConfig(cfg, file);
    expect((await loadConfig(file)).device.softBrightness).toBe(0.5);
  });

  it("falls back to defaults for wrong types and bad values", () => {
    const warns: string[] = [];
    const cfg = normaliseConfig(
      {
        device: { hardwareBrightness: 9, softBrightness: "x" },
        builtins: { awake: "dancing" },
        bogus: 1,
      },
      (m) => warns.push(m),
    );
    expect(cfg.device.hardwareBrightness).toBe(2);
    expect(cfg.device.softBrightness).toBe(1);
    expect(cfg.builtins.awake).toBe("rogLogoGlitch");
    expect(warns.length).toBeGreaterThanOrEqual(2);
    expect("bogus" in cfg).toBe(false);
  });

  it("keeps invalid TOML files untouched", async () => {
    const file = join(dir, "bad.toml");
    writeFileSync(file, "this is = = not toml");
    const cfg = await loadConfig(file);
    expect(cfg.device.hardwareBrightness).toBe(2);
    expect(readFileSync(file, "utf8")).toBe("this is = = not toml");
  });

  it("deep-merges patches and replaces scenes wholesale", () => {
    const next = patchConfig(defaultConfig(), {
      power: { offOnBattery: true },
      scenes: { A: { effect: "plasma" } },
    });
    expect(next.power.offOnBattery).toBe(true);
    expect(next.power.offOnLidClose).toBe(true);
    expect(Object.keys(next.scenes)).toEqual(["A"]);
  });
});

describe("schedule window", () => {
  const at = (h: number, m = 0): Date => new Date(2026, 0, 1, h, m);
  it("parses HH:MM", () => {
    expect(parseHm("07:30")).toBe(450);
    expect(parseHm("25:00")).toBeNull();
    expect(parseHm("7pm")).toBeNull();
  });
  it("handles windows across midnight", () => {
    expect(inWindow(at(23), "22:00", "07:00")).toBe(true);
    expect(inWindow(at(3), "22:00", "07:00")).toBe(true);
    expect(inWindow(at(12), "22:00", "07:00")).toBe(false);
    expect(inWindow(at(12), "09:00", "17:00")).toBe(true);
    expect(inWindow(at(12), "09:00", "09:00")).toBe(false);
  });
});

async function makeController(): Promise<{
  ctl: Controller;
  mock: MockTransport;
  opens: () => number;
}> {
  const mock = new MockTransport();
  let n = 0;
  const ctl = new Controller({
    openDevice: async () => {
      n++;
      return AnimeDevice.open({ model: "GA402", transport: mock });
    },
    config: { ...defaultConfig(), startupScene: "" },
    saveConfig: async () => undefined,
    registry: new EffectRegistry(),
    services: new Services(),
    log: memoryLogger(),
    retryMs: 20,
  });
  await ctl.start();
  return { ctl, mock, opens: () => n };
}

describe("Controller", () => {
  it("starts in firmware built-ins when no startup scene exists", async () => {
    const { ctl, mock } = await makeController();
    expect(ctl.state().content).toBe("builtins");
    expect(mock.summary(3)).toContain("5E C5 0F");
    await ctl.shutdown();
  });

  it("plays effects and rejects unknown ones without changing content", async () => {
    const { ctl } = await makeController();
    await ctl.play("plasma", {});
    expect(ctl.state().effect).toBe("plasma");
    await expect(ctl.play("nope", {})).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(ctl.play("plasma", { bogus: 1 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    expect(ctl.state().effect).toBe("plasma");
    await ctl.shutdown();
  });

  it("gates the display off and stops writing frames", async () => {
    const { ctl, mock } = await makeController();
    await ctl.play("plasma", {});
    await ctl.setGate("battery", true);
    expect(ctl.state().gate).toBe("battery");
    expect(mock.summary(4).at(-1)).toBe("5E C3 01 80");
    mock.reset();
    await tick(100);
    expect(mock.packets).toHaveLength(0);
    await ctl.setGate("battery", false);
    await tick(60);
    expect(mock.summary(3)).toContain("5E C0 03");
    await ctl.shutdown();
  });

  it("applies software brightness to sent frames", async () => {
    const { ctl, mock } = await makeController();
    const frame = new Uint8Array(1449).fill(200);
    await ctl.showFrame(frame);
    await ctl.setSoftBrightness(0.5);
    const lastPane = mock.packets.filter((p) => p[1] === 0xc0 && p[2] === 0x02).at(-1)!;
    expect(lastPane[7]).toBe(100);
    await expect(ctl.showFrame(new Uint8Array(3))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await ctl.shutdown();
  });

  it("reconnects after the device fails and re-applies content", async () => {
    const { ctl, mock, opens } = await makeController();
    await ctl.play("plasma", {});
    mock.failWith = new Error("ENODEV");
    await tick(80);
    expect(ctl.state().connected).toBe(false);
    expect(ctl.state().error).toBeTruthy();
    mock.failWith = null;
    await tick(150);
    expect(ctl.state().connected).toBe(true);
    expect(opens()).toBeGreaterThanOrEqual(2);
    expect(ctl.state().effect).toBe("plasma");
    await ctl.shutdown();
  });
});
