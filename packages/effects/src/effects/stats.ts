import { MAPPING_PARAM, bool } from "../params.js";
import type { Effect } from "../types.js";

/** CPU / GPU / RAM / temperature meters. */
export const statsEffect: Effect = {
  id: "stats",
  name: "System stats",
  description: "CPU, GPU, RAM and temperature meters",
  category: "system",
  fps: 2,
  params: {
    labels: { type: "boolean", label: "Labels", default: true },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const stats = ctx.services.stats();
    const release = stats.subscribe(1000);
    const labels = bool(params, "labels");
    return {
      render(_t, c) {
        const s = stats.value;
        const rows: [string, number | null][] = [
          ["CPU", s.cpu],
          ["GPU", s.gpu],
          ["RAM", s.ram],
          ["TMP", s.tempC === null ? null : Math.min(1, Math.max(0, (s.tempC - 30) / 70))],
        ];
        const shown = rows.filter((r) => r[1] !== null);
        c.clear();
        const rowH = Math.floor(c.height / shown.length);
        const labelW = labels ? 13 : 0;
        shown.forEach(([name, v], i) => {
          const y = i * rowH + Math.floor((rowH - 5) / 2);
          if (labels) c.text(0, y, name, { font: "3x5", value: 140 });
          const barW = c.width - labelW - 1;
          c.rect(labelW, y, barW, 5, 30);
          c.rect(labelW, y, Math.round(barW * (v ?? 0)), 5, 255);
        });
      },
      dispose: release,
    };
  },
};
