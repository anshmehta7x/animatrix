import { MAPPING_PARAM, num } from "../params.js";
import type { Effect } from "../types.js";

/** Falling "digital rain" streaks with fading trails. */
export const matrixRainEffect: Effect = {
  id: "matrix-rain",
  name: "Matrix rain",
  description: "Falling streaks with glowing heads",
  category: "generative",
  fps: 30,
  params: {
    density: { type: "number", label: "Density", min: 0.05, max: 1, step: 0.05, default: 0.35 },
    speed: { type: "number", label: "Speed", min: 2, max: 60, step: 1, unit: "px/s", default: 18 },
    trail: { type: "number", label: "Trail", min: 0.5, max: 0.97, step: 0.01, default: 0.86 },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const density = num(params, "density");
    const speed = num(params, "speed");
    const trail = num(params, "trail");
    const drops = Array.from({ length: ctx.width }, () => ({
      y: -Math.random() * ctx.height * 2,
      v: speed * (0.6 + Math.random() * 0.8),
      on: Math.random() < density,
    }));
    let last = 0;
    return {
      render(t, c) {
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        c.fade(trail);
        drops.forEach((d, x) => {
          if (!d.on) {
            if (Math.random() < density * dt) d.on = true;
            return;
          }
          const prev = Math.floor(d.y);
          d.y += d.v * dt;
          for (let y = prev; y <= Math.floor(d.y); y++) c.pixel(x, y, 200);
          c.pixel(x, Math.floor(d.y), 255);
          if (d.y > c.height + 4) {
            d.y = -Math.random() * c.height;
            d.v = speed * (0.6 + Math.random() * 0.8);
            d.on = Math.random() < density;
          }
        });
      },
    };
  },
};
