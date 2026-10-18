import { describe, expect, it } from "vitest";
import { GA402, Mapper } from "@anshmehta7x/animatrix-core";
import { BUILTIN_EFFECTS, Services, resolveParams } from "../src/index.js";

const NO_HARDWARE_DEPS = [
  "text",
  "clock",
  "matrix-rain",
  "life",
  "starfield",
  "plasma",
  "breathe",
  "stats",
];

describe("effect smoke test", () => {
  for (const id of NO_HARDWARE_DEPS) {
    for (const mode of ["planar", "diagonal"] as const) {
      it(`${id} renders in ${mode} mode`, async () => {
        const effect = BUILTIN_EFFECTS.find((e) => e.id === id)!;
        const mapper = new Mapper(GA402, { mode });
        const services = new Services();
        const inst = await effect.create(resolveParams(effect.params, { mapping: mode }), {
          width: mapper.width,
          height: mapper.height,
          mode,
          safe: mapper.safeArea(),
          visible: mapper.coverage(),
          profile: GA402,
          services,
        });
        const canvas = mapper.createCanvas();
        for (let t = 0; t < 3000; t += 500) inst.render(t, canvas);
        const frame = mapper.map(canvas);
        expect(frame.length).toBe(1449);
        await inst.dispose?.();
        services.dispose();
      });
    }
  }
});
