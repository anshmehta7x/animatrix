import { MAPPING_PARAM, bool, num } from "../params.js";
import type { Effect } from "../types.js";

/** One Game of Life generation on a torus (or bounded). Exported for tests. */
export function lifeStep(cells: Uint8Array, w: number, h: number, wrap: boolean): Uint8Array {
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let xx = x + dx;
          let yy = y + dy;
          if (wrap) {
            xx = (xx + w) % w;
            yy = (yy + h) % h;
          } else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          n += cells[yy * w + xx]!;
        }
      }
      const alive = cells[y * w + x]!;
      next[y * w + x] = n === 3 || (alive && n === 2) ? 1 : 0;
    }
  }
  return next;
}

/** Conway's Game of Life, reseeding when it stagnates. */
export const lifeEffect: Effect = {
  id: "life",
  name: "Game of Life",
  description: "Conway's cellular automaton with soft fading",
  category: "generative",
  fps: 30,
  params: {
    density: {
      type: "number",
      label: "Seed density",
      min: 0.05,
      max: 0.6,
      step: 0.01,
      default: 0.3,
    },
    rate: { type: "number", label: "Generations/s", min: 1, max: 30, step: 1, default: 8 },
    wrap: { type: "boolean", label: "Wrap edges", default: true },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const { width: w, height: h } = ctx;
    const density = num(params, "density");
    const wrap = bool(params, "wrap");
    const period = 1000 / num(params, "rate");
    const seed = (): Uint8Array =>
      Uint8Array.from({ length: w * h }, () => (Math.random() < density ? 1 : 0));
    let cells = seed();
    let history: string[] = [];
    let nextAt = 0;
    return {
      render(t, c) {
        if (t >= nextAt) {
          nextAt = t + period;
          cells = lifeStep(cells, w, h, wrap);
          const key = cells.join("");
          if (history.includes(key) || !cells.includes(1)) {
            cells = seed();
            history = [];
          }
          history = [...history.slice(-11), key];
        }
        c.fade(0.6);
        cells.forEach((alive, i) => {
          if (alive) c.data[i] = 255;
        });
      },
    };
  },
};
