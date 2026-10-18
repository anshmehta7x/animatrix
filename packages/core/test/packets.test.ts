import { describe, expect, it } from "vitest";
import {
  GA401,
  GA402,
  PACKET_SIZE,
  brightnessPacket,
  builtinModeSetup,
  builtinsSelectPacket,
  customModeSetup,
  displayPacket,
  encodeFrame,
  flushPacket,
  initPacket,
  InvalidArgumentError,
  latticeFor,
  packet,
  slotCount,
} from "../src/index.js";

const hex = (p: Uint8Array, n = 7): string =>
  Array.from(p.subarray(0, n), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");

describe("packets", () => {
  it("pads every packet to 640 bytes with report ID 0x5E", () => {
    const p = packet([0xc0, 0x03]);
    expect(p.length).toBe(PACKET_SIZE);
    expect(hex(p, 4)).toBe("5E C0 03 00");
    expect(p.subarray(3).every((b) => b === 0)).toBe(true);
  });

  it("rejects payloads that do not fit", () => {
    expect(() => packet(new Uint8Array(640))).toThrow(InvalidArgumentError);
  });

  it("encodes the init magic", () => {
    expect(Buffer.from(initPacket().subarray(1, 15)).toString("ascii")).toBe("ASUS Tech.Inc.");
  });

  it("encodes control commands", () => {
    expect(hex(brightnessPacket(3), 4)).toBe("5E C0 04 03");
    expect(hex(displayPacket(true), 4)).toBe("5E C3 01 00");
    expect(hex(displayPacket(false), 4)).toBe("5E C3 01 80");
    expect(hex(flushPacket(), 3)).toBe("5E C0 03");
  });

  it("rejects out-of-range hardware brightness", () => {
    expect(() => brightnessPacket(4 as 3)).toThrow(InvalidArgumentError);
  });

  it("encodes built-in selection bits", () => {
    const all1 = {
      awake: "rogLogoGlitch",
      sleep: "starfield",
      shutdown: "seeYa",
      boot: "staticEmergence",
    } as const;
    const all0 = {
      awake: "binaryBannerScroll",
      sleep: "bannerSwipe",
      shutdown: "glitchOut",
      boot: "glitchConstruction",
    } as const;
    expect(hex(builtinsSelectPacket(all1), 3)).toBe("5E C5 0F");
    expect(hex(builtinsSelectPacket(all0), 3)).toBe("5E C5 00");
    expect(hex(builtinsSelectPacket({ ...all0, sleep: "starfield" }), 3)).toBe("5E C5 02");
  });

  it("orders session setup: init, built-ins off, display on, brightness", () => {
    expect(customModeSetup(2).map((p) => hex(p, 4))).toEqual([
      "5E 41 53 55",
      "5E C4 01 80",
      "5E C3 01 00",
      "5E C0 04 02",
    ]);
    const builtin = builtinModeSetup(
      { awake: "rogLogoGlitch", sleep: "starfield", shutdown: "seeYa", boot: "staticEmergence" },
      3,
    ).map((p) => hex(p, 4));
    expect(builtin.slice(-2)).toEqual(["5E C4 01 00", "5E C5 0F 00"]);
  });
});

describe("encodeFrame (golden bytes)", () => {
  it("GA402: three 627-byte panes with research-doc headers, then flush", () => {
    const frame = latticeFor(GA402).createFrame();
    frame[0] = 1;
    frame[1448] = 9;
    const pkts = encodeFrame(GA402, frame);
    expect(pkts.map((p) => hex(p))).toEqual([
      "5E C0 02 01 00 73 02",
      "5E C0 02 74 02 73 02",
      "5E C0 02 E7 04 73 02",
      "5E C0 03 00 00 00 00",
    ]);
    expect(pkts[0]![7]).toBe(1);
    // LED 1448 sits at pane 3 offset 1448 - 1254 = 194.
    expect(pkts[2]![7 + 194]).toBe(9);
    // zero padding past the last LED
    expect(pkts[2]!.subarray(7 + 195).every((b) => b === 0)).toBe(true);
  });

  it("GA401: two panes", () => {
    const pkts = encodeFrame(GA401, new Uint8Array(slotCount(GA401)));
    expect(pkts.map((p) => hex(p))).toEqual([
      "5E C0 02 01 00 73 02",
      "5E C0 02 74 02 73 02",
      "5E C0 03 00 00 00 00",
    ]);
  });

  it("skips unchanged panes when a previous frame is given", () => {
    const a = latticeFor(GA402).createFrame();
    const b = a.slice();
    expect(encodeFrame(GA402, b, { previous: a })).toEqual([]);
    b[700] = 200;
    const pkts = encodeFrame(GA402, b, { previous: a });
    expect(pkts.map((p) => hex(p))).toEqual(["5E C0 02 74 02 73 02", "5E C0 03 00 00 00 00"]);
  });

  it("rejects frames of the wrong length", () => {
    expect(() => encodeFrame(GA402, new Uint8Array(10))).toThrow(InvalidArgumentError);
  });
});

describe("testPatternFrame", () => {
  it("lights the row-0/col-0 block and stays inside the lattice", async () => {
    const { testPatternFrame } = await import("../src/index.js");
    const f = testPatternFrame(GA402);
    expect(f.length).toBe(1449);
    expect(f[0]).toBe(255);
    expect(f[3]).toBe(255);
    expect(f[4]).not.toBe(255);
  });
});
