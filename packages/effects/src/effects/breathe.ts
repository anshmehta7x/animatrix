import { MAPPING_PARAM, num, str } from "../params.js";
import type { Effect } from "../types.js";

/** A slow breathing glow, in the spirit of ROG's lighting presets. */
export const breatheEffect: Effect = {
  id: "breathe",
  name: "Breathing glow",
  description: "Slow pulsing glow",
  category: "generative",
  fps: 30,
  params: {
    shape: {
      type: "select",
      label: "Shape",
      options: [
        { value: "radial", label: "Radial" },
        { value: "ring", label: "Ring" },
        { value: "sweep", label: "Diagonal sweep" },
        { value: "full", label: "Full panel" },
      ],
      default: "radial",
    },
    period: { type: "number", label: "Period", min: 1, max: 12, step: 0.5, unit: "s", default: 4 },
    min: { type: "number", label: "Min", min: 0, max: 255, step: 1, default: 6 },
    max: { type: "number", label: "Max", min: 8, max: 255, step: 1, default: 230 },
    ...MAPPING_PARAM,
  },
  create(params) {
    const shape = str(params, "shape");
    const period = num(params, "period") * 1000;
    const lo = num(params, "min");
    const hi = num(params, "max");
    return {
      render(t, c) {
        const phase = (1 - Math.cos((2 * Math.PI * t) / period)) / 2;
        const ease = phase * phase * (3 - 2 * phase);
        const cx = c.width / 2;
        const cy = c.height / 2;
        const rMax = Math.hypot(cx, cy);
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const d = Math.hypot(x - cx, y - cy) / rMax;
            let f = 1;
            if (shape === "radial") f = Math.max(0, 1 - d * (1.6 - ease * 0.8));
            if (shape === "ring") f = Math.max(0, 1 - Math.abs(d - ease * 0.9) * 5);
            if (shape === "sweep")
              f = Math.max(0, 1 - Math.abs((x + y) / (c.width + c.height) - ease) * 4);
            const v =
              shape === "full" ? lo + (hi - lo) * ease : lo + (hi - lo) * f * (0.4 + 0.6 * ease);
            c.data[y * c.width + x] = v;
          }
        }
      },
    };
  },
};
