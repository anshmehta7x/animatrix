import type { Canvas } from "@anshmehta7x/animatrix-core";
import { FONT_PARAMS, MAPPING_PARAM, bool, str } from "../params.js";
import { TextWriter, fontFromParams } from "../text/writer.js";
import type { Effect } from "../types.js";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number): string => String(n).padStart(2, "0");

/** Format the hour:minute string. */
export function formatTime(d: Date, hour12: boolean): string {
  const h = hour12 ? d.getHours() % 12 || 12 : d.getHours();
  return `${hour12 ? h : pad(h)}:${pad(d.getMinutes())}`;
}

function drawAnalogue(c: Canvas, d: Date, seconds: boolean): void {
  const cx = c.width / 2;
  const cy = c.height / 2;
  const r = Math.min(c.width, c.height) / 2 - 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.pixel(cx + Math.sin(a) * r, cy - Math.cos(a) * r, i % 3 === 0 ? 255 : 120);
  }
  const hand = (frac: number, len: number, v: number): void => {
    const a = frac * Math.PI * 2;
    c.line(cx, cy, cx + Math.sin(a) * len, cy - Math.cos(a) * len, v);
  };
  const m = d.getMinutes() + d.getSeconds() / 60;
  hand(((d.getHours() % 12) + m / 60) / 12, r * 0.5, 255);
  hand(m / 60, r * 0.8, 220);
  if (seconds) hand(d.getSeconds() / 60, r * 0.9, 90);
}

function drawBinary(c: Canvas, d: Date, seconds: boolean): void {
  const digits = [d.getHours(), d.getMinutes(), ...(seconds ? [d.getSeconds()] : [])].flatMap(
    (n) => [Math.floor(n / 10), n % 10],
  );
  const cell = Math.max(3, Math.floor(Math.min(c.width / (digits.length + 1), c.height / 5)));
  const x0 = Math.round((c.width - digits.length * cell) / 2);
  const y0 = Math.round((c.height - 4 * cell) / 2);
  digits.forEach((digit, i) => {
    for (let bit = 0; bit < 4; bit++) {
      const on = (digit >> bit) & 1;
      const x = x0 + i * cell + Math.floor(cell / 2);
      const y = y0 + (3 - bit) * cell + Math.floor(cell / 2);
      c.circle(x, y, cell / 2 - 0.6, on ? 255 : 24, true);
    }
  });
}

/** Clock with digital, date, analogue and binary faces. */
export const clockEffect: Effect = {
  id: "clock",
  name: "Clock",
  description: "Digital, analogue or binary clock",
  category: "clock",
  fps: 2,
  params: {
    face: {
      type: "select",
      label: "Face",
      options: [
        { value: "digital", label: "Digital" },
        { value: "date", label: "Digital + date" },
        { value: "analogue", label: "Analogue" },
        { value: "binary", label: "Binary" },
      ],
      default: "digital",
    },
    hour12: { type: "boolean", label: "12-hour", default: false },
    seconds: { type: "boolean", label: "Seconds", default: true },
    ...FONT_PARAMS,
    size: { type: "number", label: "Size", min: 5, max: 40, step: 1, unit: "px", default: 14 },
    ...MAPPING_PARAM,
  },
  create(params) {
    const face = str(params, "face");
    const hour12 = bool(params, "hour12");
    const seconds = bool(params, "seconds");
    const big = new TextWriter(fontFromParams(params));
    const small = new TextWriter({ kind: "pixel", id: "3x5", size: 5 });
    return {
      render(_t, c) {
        const d = new Date();
        c.clear();
        if (face === "analogue") return void drawAnalogue(c, d, seconds);
        if (face === "binary") return void drawBinary(c, d, seconds);
        const time = formatTime(d, hour12);
        const extra =
          face === "date"
            ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
            : seconds
              ? pad(d.getSeconds())
              : "";
        const gap = 3;
        const total = big.height + (extra ? gap + small.height : 0);
        const y = Math.round((c.height - total) / 2);
        const w = big.measure(time);
        if (w === null || !big.draw(c, Math.round((c.width - w) / 2), y, time)) {
          return { changed: false, delay: 50 };
        }
        if (extra) {
          const ew = small.measure(extra) ?? 0;
          small.draw(c, Math.round((c.width - ew) / 2), y + big.height + gap, extra, 160);
        }
      },
    };
  },
};
