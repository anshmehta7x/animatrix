import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { AnimeDevice, MockTransport } from "@anshmehta7x/animatrix";
import { EffectRegistry, Services } from "@anshmehta7x/animatrix-effects";
import { Controller, Policy, defaultConfig, memoryLogger, type PowerEvents } from "../src/index.js";

const tick = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

class FakePower extends EventEmitter<PowerEvents> {
  onBattery = false;
  lidClosed = false;
  inhibitorReleases = 0;
  inhibitorTakes = 0;
  async releaseInhibitor(): Promise<void> {
    this.inhibitorReleases++;
  }
  async takeInhibitor(): Promise<void> {
    this.inhibitorTakes++;
  }
}

async function setup(patch: (c: ReturnType<typeof defaultConfig>) => void = () => undefined) {
  const mock = new MockTransport();
  const config = { ...defaultConfig(), startupScene: "" };
  patch(config);
  const ctl = new Controller({
    openDevice: () => AnimeDevice.open({ model: "GA402", transport: mock }),
    config,
    saveConfig: async () => undefined,
    registry: new EffectRegistry(),
    services: new Services(),
    log: memoryLogger(),
    retryMs: 20,
  });
  await ctl.start();
  const power = new FakePower();
  const policy = new Policy(ctl, power, memoryLogger());
  policy.start();
  await ctl.play("plasma", {});
  await tick();
  mock.reset();
  return { ctl, mock, power, policy };
}

describe("Policy: sleep and resume", () => {
  it("hands over to firmware animations on sleep and restores content on resume", async () => {
    const { ctl, mock, power, policy } = await setup();
    power.emit("sleep", true);
    await tick();
    expect(mock.summary(4)).toEqual(expect.arrayContaining(["5E C4 01 00", "5E C5 0F 00"]));
    expect(power.inhibitorReleases).toBe(1);
    mock.reset();
    power.emit("sleep", false);
    await tick(80);
    expect(mock.summary(3)[0]).toBe("5E 41 53"); // re-init handshake
    expect(ctl.state().effect).toBe("plasma");
    expect(mock.summary(4)).toContain("5E C4 01 80");
    expect(power.inhibitorTakes).toBe(1);
    policy.stop();
    await ctl.shutdown();
  });

  it("keeps the display off on sleep when 'off when lid closed' is on and the lid closed", async () => {
    const { ctl, mock, power, policy } = await setup((c) => (c.power.offOnLidClose = true));
    power.lidClosed = true;
    power.emit("lid", true);
    await tick();
    expect(ctl.state().gate).toBe("lid");
    mock.reset();
    power.emit("sleep", true);
    await tick();
    expect(mock.summary(4)).not.toContain("5E C4 01 00");
    expect(mock.summary(4)).toContain("5E C3 01 80");
    policy.stop();
    await ctl.shutdown();
  });

  it("turns off on battery only when configured", async () => {
    const { ctl, power, policy } = await setup();
    power.onBattery = true;
    power.emit("battery", true);
    await tick();
    expect(ctl.state().gate).toBeNull();
    ctl.config.power.offOnBattery = true;
    policy.configChanged();
    await tick();
    expect(ctl.state().gate).toBe("battery");
    policy.stop();
    await ctl.shutdown();
  });
});
