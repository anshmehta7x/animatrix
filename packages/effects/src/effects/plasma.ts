import { MAPPING_PARAM, num } from "../params.js";
import type { Effect } from "../types.js";

/** Classic sine plasma. */
export const plasmaEffect: Effect = {
  id: "plasma",
  name: "Plasma",
  description: "Flowing sine-wave plasma",
  category: "generative",
  fps: 30,
  params: {
    speed: { type: "number", label: "Speed", min: 0.1, max: 4, step: 0.05, default: 1 },
    scale: { type: "number", label: "Scale", min: 0.2, max: 4, step: 0.05, default: 1 },
    contrast: { type: "number", label: "Contrast", min: 0.5, max: 4, step: 0.1, default: 1.6 },
    ...MAPPING_PARAM,
  },
  create(params) {
    const speed = num(params, "speed");
    const k = 0.18 / num(params, "scale");
    const contrast = num(params, "contrast");
    return {
      render(t, c) {
        const s = (t / 1000) * speed;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const v =
              Math.sin(x * k + s) +
              Math.sin((y * k + s) * 1.3) +
              Math.sin((x + y) * k * 0.7 + s * 0.8) +
              Math.sin(Math.hypot(x - c.width / 2, y - c.height / 2) * k * 1.4 - s * 1.6);
            const n = Math.pow((v + 4) / 8, contrast);
            c.data[y * c.width + x] = n * 255;
          }
        }
      },
    };
  },
};
