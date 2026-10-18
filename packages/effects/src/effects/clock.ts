import type { Canvas, Rect } from "@anshmehta7x/animatrix-core";
import { centreIn } from "../layout.js";
import { FONT_PARAMS, MAPPING_PARAM, bool, num, str } from "../params.js";
import { TextWriter, fontFromParams, type FontChoice } from "../text/writer.js";
import type { Effect } from "../types.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number): string => String(n).padStart(2, "0");

/** Format the hour:minute string. */
export function formatTime(d: Date, hour12: boolean): string {
  const h = hour12 ? d.getHours() % 12 || 12 : d.getHours();
  return `${hour12 ? h : pad(h)}:${pad(d.getMinutes())}`;
}

function drawAnalogue(c: Canvas, r0: Rect, d: Date, seconds: boolean): void {
  const cx = r0.x + r0.width / 2;
  const cy = r0.y + r0.height / 2;
  const r = Math.min(r0.width, r0.height) / 2 - 1;
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

function drawBinary(c: Canvas, r: Rect, d: Date, seconds: boolean): void {
  const digits = [d.getHours(), d.getMinutes(), ...(seconds ? [d.getSeconds()] : [])].flatMap(
    (n) => [Math.floor(n / 10), n % 10],
  );
  const cell = Math.max(3, Math.floor(Math.min(r.width / digits.length, r.height / 4)));
  const x0 = Math.round(r.x + (r.width - digits.length * cell) / 2);
  const y0 = Math.round(r.y + (r.height - 4 * cell) / 2);
  digits.forEach((digit, i) => {
    for (let bit = 0; bit < 4; bit++) {
      const on = (digit >> bit) & 1;
      const x = x0 + i * cell + Math.floor(cell / 2);
      const y = y0 + (3 - bit) * cell + Math.floor(cell / 2);
      c.circle(x, y, cell / 2 - 0.6, on ? 255 : 24, true);
    }
  });
}

/** Largest font that fits `chars` characters in a `w`×`h` box (estimate; refined at runtime). */
function fitFont(base: FontChoice, chars: number, w: number, h: number): FontChoice {
  if (base.kind === "pixel") {
    const gh = base.id === "3x5" ? 5 : 7;
    const gw = base.id === "3x5" ? 4 : 6;
    const scale = Math.max(1, Math.floor(Math.min(w / (chars * gw), h / gh)));
    return { ...base, size: gh * scale };
  }
  return { ...base, size: Math.max(6, Math.floor(Math.min(h / 1.25, w / (chars * 0.62)))) };
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
    font: {
      ...(FONT_PARAMS.font as Extract<(typeof FONT_PARAMS)["font"], { type: "select" }>),
      default: "sans",
    },
    fitToPanel: { type: "boolean", label: "Fit to panel", default: true },
    size: {
      type: "number",
      label: "Size",
      min: 5,
      max: 40,
      step: 1,
      unit: "px",
      default: 14,
      visibleWhen: { fitToPanel: false },
    },
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const face = str(params, "face");
    const hour12 = bool(params, "hour12");
    const seconds = bool(params, "seconds");
    const r = ctx.safe;
    const small = new TextWriter({ kind: "pixel", id: "5x7", size: 7 });
    const extraH = face === "date" || seconds ? small.height + 2 : 0;
    const base: FontChoice = { ...fontFromParams(params), bold: true };
    let font = bool(params, "fitToPanel")
      ? fitFont(base, hour12 ? 5 : 5, r.width, r.height - extraH)
      : { ...base, size: num(params, "size") };
    let big = new TextWriter(font);
    return {
      render(_t, c) {
        const d = new Date();
        c.clear();
        if (face === "analogue") return void drawAnalogue(c, r, d, seconds);
        if (face === "binary") return void drawBinary(c, r, d, seconds);
        const time = formatTime(d, hour12);
        const extra =
          face === "date"
            ? `${d.getDate()} ${MONTHS[d.getMonth()]}`
            : seconds
              ? pad(d.getSeconds())
              : "";
        const w = big.measure(time);
        if (w === null) {
          void big.prepare(time);
          return { changed: false, delay: 50 };
        }
        if (bool(params, "fitToPanel") && w > r.width && font.size > 6) {
          font = { ...font, size: font.size - 1 };
          big = new TextWriter(font);
          return { changed: false, delay: 20 };
        }
        const total = big.height + (extra ? 2 + small.height : 0);
        const pos = centreIn(r, c, w, total);
        big.draw(c, pos.x, pos.y, time);
        if (extra) {
          const ew = small.measure(extra) ?? 0;
          const label =
            face === "date" && ew + 24 <= r.width ? `${DAYS[d.getDay()]} ${extra}` : extra;
          const lw = small.measure(label) ?? 0;
          small.draw(c, Math.round(r.x + (r.width - lw) / 2), pos.y + big.height + 2, label, 170);
        }
      },
    };
  },
};
