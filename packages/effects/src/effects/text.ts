import { FONT_PARAMS, MAPPING_PARAM, bool, num, str } from "../params.js";
import { TextWriter, fontFromParams } from "../text/writer.js";
import type { Effect } from "../types.js";

/** Static or scrolling text. */
export const textEffect: Effect = {
  id: "text",
  name: "Text",
  description: "Static or scrolling text",
  category: "text",
  fps: 30,
  params: {
    text: { type: "string", label: "Text", default: "hello", placeholder: "Type something" },
    scroll: { type: "boolean", label: "Scroll", default: true },
    speed: { type: "number", label: "Speed", min: 2, max: 80, step: 1, unit: "px/s", default: 18 },
    direction: {
      type: "select",
      label: "Direction",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
      default: "left",
    },
    ...FONT_PARAMS,
    value: { type: "number", label: "Brightness", min: 8, max: 255, step: 1, default: 255 },
    ...MAPPING_PARAM,
  },
  async create(params) {
    const text = str(params, "text");
    const writer = new TextWriter(fontFromParams(params));
    await writer.prepare(text);
    const scroll = bool(params, "scroll");
    const speed = num(params, "speed");
    const dir = str(params, "direction") === "right" ? -1 : 1;
    const value = num(params, "value");
    return {
      render(t, canvas) {
        canvas.clear();
        const w = writer.measure(text) ?? 0;
        const y = Math.round((canvas.height - writer.height) / 2);
        if (!scroll) {
          writer.draw(canvas, Math.round((canvas.width - w) / 2), y, text, value);
          return { done: true };
        }
        const span = w + canvas.width;
        const off = ((t / 1000) * speed) % span;
        const x = dir > 0 ? canvas.width - off : off - w;
        writer.draw(canvas, Math.round(x), y, text, value);
      },
    };
  },
};
