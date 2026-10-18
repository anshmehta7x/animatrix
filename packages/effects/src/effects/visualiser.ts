import { columnBottoms } from "../layout.js";
import { MAPPING_PARAM, bool, num, str } from "../params.js";
import type { Effect } from "../types.js";

/** Music visualiser fed by the default sink's monitor (system audio). */
export const visualiserEffect: Effect = {
  id: "visualiser",
  name: "Visualiser",
  description: "Bars, spectrum, waveform or spectrogram from system audio",
  category: "visualiser",
  fps: 30,
  params: {
    style: {
      type: "select",
      label: "Style",
      options: [
        { value: "bars", label: "Bars" },
        { value: "spectrum", label: "Spectrum" },
        { value: "waveform", label: "Waveform" },
        { value: "spectrogram", label: "Spectrogram" },
      ],
      default: "bars",
    },
    bands: { type: "number", label: "Bands", min: 6, max: 34, step: 1, default: 16 },
    sensitivity: {
      type: "number",
      label: "Sensitivity",
      min: 0.2,
      max: 4,
      step: 0.05,
      default: 1.2,
    },
    smoothing: { type: "number", label: "Smoothing", min: 0, max: 0.95, step: 0.01, default: 0.6 },
    peaks: { type: "boolean", label: "Peak dots", default: true },
    mirror: { type: "boolean", label: "Mirror", default: false },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const audio = ctx.services.audio();
    const release = audio.subscribe();
    const style = str(params, "style");
    const sens = num(params, "sensitivity");
    const smooth = num(params, "smoothing");
    const peaksOn = bool(params, "peaks");
    const mirror = bool(params, "mirror");
    const bandCount =
      style === "spectrum" || style === "spectrogram" ? ctx.width : num(params, "bands");
    const level = new Float32Array(bandCount);
    const peak = new Float32Array(bandCount);
    // Bars rise from the panel's real bottom edge in each column (it is slanted by the cut).
    const bottoms = columnBottoms(ctx.visible, ctx.width, ctx.height);
    return {
      render(_t, c) {
        if (style === "waveform") {
          c.clear();
          const wave = audio.waveform(c.width * 4);
          let prev: [number, number] | null = null;
          for (let x = 0; x < c.width; x++) {
            const v = wave[x * 4] ?? 0;
            const y = c.height / 2 - Math.max(-1, Math.min(1, v * sens * 2)) * (c.height / 2 - 1);
            if (prev) c.line(prev[0], prev[1], x, y, 255);
            prev = [x, y];
          }
          return;
        }
        const raw = audio.spectrum(bandCount);
        for (let i = 0; i < bandCount; i++) {
          const v = Math.min(1, raw[i]! * sens);
          level[i] = v > level[i]! ? v : level[i]! * smooth + v * (1 - smooth);
          peak[i] = Math.max(level[i]!, peak[i]! - 0.015);
        }
        if (style === "spectrogram") {
          for (let y = 0; y < c.height - 1; y++)
            c.data.copyWithin(y * c.width, (y + 1) * c.width, (y + 2) * c.width);
          for (let x = 0; x < c.width; x++) c.data[(c.height - 1) * c.width + x] = level[x]! * 255;
          return;
        }
        c.clear();
        const colW = c.width / bandCount;
        for (let i = 0; i < bandCount; i++) {
          const x0 = Math.floor(i * colW);
          const w =
            style === "bars" ? Math.max(1, Math.floor(colW) - 1) : Math.max(1, Math.ceil(colW));
          const base = Math.max(0, bottoms[Math.min(c.width - 1, x0 + Math.floor(w / 2))]!) + 1;
          const h = level[i]! * base;
          if (mirror) {
            c.rect(x0, (base - h) / 2, w, h, 255);
          } else {
            c.rect(x0, base - h, w, h, 255);
            if (peaksOn && style === "bars") c.rect(x0, base - 1 - peak[i]! * base, w, 1, 140);
          }
        }
      },
      dispose: release,
    };
  },
};
