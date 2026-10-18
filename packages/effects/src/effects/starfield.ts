import { MAPPING_PARAM, num } from "../params.js";
import type { Effect } from "../types.js";

/** Stars flying toward the viewer. */
export const starfieldEffect: Effect = {
  id: "starfield",
  name: "Starfield",
  description: "Warp-speed stars",
  category: "generative",
  fps: 30,
  params: {
    stars: { type: "number", label: "Stars", min: 10, max: 200, step: 5, default: 70 },
    speed: { type: "number", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 0.8 },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const speed = num(params, "speed");
    const spawn = (): { x: number; y: number; z: number } => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: 0.1 + Math.random() * 0.9,
    });
    const stars = Array.from({ length: num(params, "stars") }, spawn);
    let last = 0;
    return {
      render(t, c) {
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        c.fade(0.5);
        const cx = ctx.width / 2;
        const cy = ctx.height / 2;
        stars.forEach((s, i) => {
          s.z -= speed * dt;
          const px = cx + (s.x / s.z) * cx;
          const py = cy + (s.y / s.z) * cy;
          if (s.z <= 0.02 || px < 0 || py < 0 || px >= ctx.width || py >= ctx.height) {
            stars[i] = spawn();
            return;
          }
          c.max(px, py, Math.min(255, 60 + (1 - s.z) * 220));
        });
      },
    };
  },
};
