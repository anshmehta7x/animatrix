import { describe, expect, it } from "vitest";
import { parseArgs, parsePairs } from "../src/args.js";
import { patchFrom, reportError, run } from "../src/commands.js";
import { InvalidArgumentError, PermissionDeniedError } from "@anshmehta7x/animatrix";

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (l: string) => void out.push(l), err: (l: string) => void err.push(l) },
    out,
    err,
  };
};

describe("args", () => {
  it("parses options, flags and negations", () => {
    const a = parseArgs([
      "image",
      "cat.png",
      "--fit",
      "cover",
      "--no-loop",
      "--direct",
      "--pan-x=0.2",
    ]);
    expect(a.positional).toEqual(["image", "cat.png"]);
    expect(a.options).toEqual({ fit: "cover", loop: false, direct: true, panX: "0.2" });
  });
  it("treats a trailing option as a flag", () => {
    expect(parseArgs(["clock", "--12h"]).options).toEqual({ "12h": true });
  });
  it("parses key=value pairs and rejects others", () => {
    expect(parsePairs(["a=1", "b=x=y"])).toEqual({ a: "1", b: "x=y" });
    expect(() => parsePairs(["oops"])).toThrow();
  });
});

describe("commands", () => {
  it("builds nested config patches with JSON values", () => {
    expect(patchFrom("power.offOnBattery=true")).toEqual({ power: { offOnBattery: true } });
    expect(patchFrom("schedule.dimFrom=22:00")).toEqual({ schedule: { dimFrom: "22:00" } });
    expect(() => patchFrom("nope")).toThrow(InvalidArgumentError);
  });

  it("lists builtins without a device", async () => {
    const c = capture();
    expect(await run(parseArgs(["builtins", "list"]), c.io)).toBe(0);
    expect(c.out.join("\n")).toContain("rogLogoGlitch");
  });

  it("rejects unknown commands with usage", async () => {
    const c = capture();
    expect(await run(parseArgs(["dance"]), c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("usage");
  });

  it("validates builtin names before touching the device", async () => {
    const c = capture();
    await expect(run(parseArgs(["builtins", "--awake", "disco"]), c.io)).rejects.toThrow(
      InvalidArgumentError,
    );
  });

  it("prints hints for typed errors", () => {
    const c = capture();
    expect(reportError(new PermissionDeniedError("/dev/hidraw1"), c.io)).toBe(1);
    expect(c.err.join("\n")).toContain("udev");
  });
});
