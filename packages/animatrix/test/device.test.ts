import { describe, expect, it } from "vitest";
import { GA402, slotCount } from "@anshmehta7x/animatrix-core";
import { AnimeDevice, Matrix, MockTransport, UnsupportedModelError } from "../src/index.js";

async function open(): Promise<{ dev: AnimeDevice; mock: MockTransport }> {
  const mock = new MockTransport();
  const dev = await AnimeDevice.open({ model: "GA402", transport: mock });
  return { dev, mock };
}

describe("AnimeDevice", () => {
  it("sends the init handshake on open", async () => {
    const { mock } = await open();
    expect(mock.summary(3)).toEqual(["5E 41 53"]);
  });

  it("sends mode setup once, then only panes + flush per frame", async () => {
    const { dev, mock } = await open();
    mock.reset();
    const frame = new Uint8Array(slotCount(GA402));
    await dev.writeFrame(frame);
    await dev.writeFrame(frame);
    expect(mock.summary(3)).toEqual([
      "5E 41 53",
      "5E C4 01",
      "5E C3 01",
      "5E C0 04",
      "5E C0 02",
      "5E C0 02",
      "5E C0 02",
      "5E C0 03",
      "5E C0 02",
      "5E C0 02",
      "5E C0 02",
      "5E C0 03",
    ]);
  });

  it("switches to built-ins and back with one C4 toggle each", async () => {
    const { dev, mock } = await open();
    await dev.useBuiltins({
      awake: "rogLogoGlitch",
      sleep: "starfield",
      shutdown: "seeYa",
      boot: "staticEmergence",
    });
    mock.reset();
    await dev.writeFrame(new Uint8Array(slotCount(GA402)));
    expect(mock.summary(4).filter((s) => s.startsWith("5E C4"))).toEqual(["5E C4 01 80"]);
  });

  it("stores the built-in selection in custom mode without sending C5", async () => {
    const { dev, mock } = await open();
    await dev.writeFrame(new Uint8Array(slotCount(GA402)));
    mock.reset();
    await dev.setBuiltinSelection({
      awake: "binaryBannerScroll",
      sleep: "bannerSwipe",
      shutdown: "glitchOut",
      boot: "glitchConstruction",
    });
    expect(mock.packets).toHaveLength(0);
    expect(dev.builtinSelection.awake).toBe("binaryBannerScroll");
  });

  it("re-inits after resume and re-enters custom mode on the next frame", async () => {
    const { dev, mock } = await open();
    await dev.writeFrame(new Uint8Array(slotCount(GA402)));
    await dev.reinit();
    mock.reset();
    await dev.writeFrame(new Uint8Array(slotCount(GA402)));
    expect(mock.summary(3).slice(0, 2)).toEqual(["5E 41 53", "5E C4 01"]);
  });

  it("surfaces transport failures as typed errors and keeps working afterwards", async () => {
    const { dev, mock } = await open();
    mock.failWith = new Error("EIO");
    await expect(dev.setDisplay(false)).rejects.toThrow("EIO");
    mock.failWith = null;
    await dev.setDisplay(false);
    expect(dev.isDisplayOn).toBe(false);
  });

  it("rejects unknown model ids", async () => {
    await expect(
      AnimeDevice.open({ model: "XX999", transport: new MockTransport() }),
    ).rejects.toThrow(UnsupportedModelError);
  });
});

describe("Matrix (direct, mock)", () => {
  it("draws a canvas and sends it", async () => {
    const mock = new MockTransport();
    const m = Matrix.fromDevice(await AnimeDevice.open({ model: "GA402", transport: mock }));
    await m.draw((c) => {
      c.clear();
      c.text(0, 10, "hi");
      c.pixel(5, 5, 255);
    });
    const panes = mock.packets.filter((p) => p[1] === 0xc0 && p[2] === 0x02);
    expect(panes).toHaveLength(3);
    expect(panes.some((p) => p.subarray(7).some((b) => b > 0))).toBe(true);
    await m.close();
    expect(mock.closed).toBe(true);
  });

  it("maps brightness names and rejects bad ones", async () => {
    const mock = new MockTransport();
    const m = Matrix.fromDevice(await AnimeDevice.open({ model: "GA402", transport: mock }));
    await m.setBrightness("medium");
    expect(mock.summary(4).at(-1)).toBe("5E C0 04 02");
    await expect(m.setBrightness("max" as "high")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("rejects unknown effects", async () => {
    const m = Matrix.fromDevice(
      await AnimeDevice.open({ model: "GA402", transport: new MockTransport() }),
    );
    await expect(m.play("nope")).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("sets built-ins and enables them", async () => {
    const mock = new MockTransport();
    const m = Matrix.fromDevice(await AnimeDevice.open({ model: "GA402", transport: mock }));
    await m.setBuiltins({ awake: "rogLogoGlitch", sleep: "starfield" });
    expect(mock.summary(3).slice(-2)).toEqual(["5E C4 01", "5E C5 0F"]);
  });
});
