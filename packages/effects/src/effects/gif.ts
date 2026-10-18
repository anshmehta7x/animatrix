import { InvalidArgumentError } from "@anshmehta7x/animatrix-core";
import { decodeImage } from "../media/decode.js";
import { drawMedia, mediaParams } from "../media/common.js";
import { bool, num, str } from "../params.js";
import type { Effect } from "../types.js";

/** Animated GIF / WebP with each frame's own delay (not just the first frame's). */
export const gifEffect: Effect = {
  id: "gif",
  name: "Animated image",
  description: "Play an animated GIF or WebP with per-frame timing",
  category: "media",
  fps: 30,
  params: mediaParams(["gif", "webp", "png", "apng"], {
    loop: { type: "boolean", label: "Loop", default: true },
    speed: { type: "number", label: "Speed", min: 0.25, max: 4, step: 0.05, unit: "×", default: 1 },
  }),
  async create(params) {
    const file = str(params, "file");
    if (!file) throw new InvalidArgumentError("gif: no file given");
    const { frames, delays } = await decodeImage(file);
    const loop = bool(params, "loop");
    const speed = num(params, "speed");
    let index = 0;
    return {
      render(_t, canvas) {
        drawMedia(canvas, frames[index]!, params);
        const delay = delays[index]! / speed;
        const last = index === frames.length - 1;
        index = last ? 0 : index + 1;
        if (frames.length === 1) return { delay: 0, done: true };
        return { delay, done: last && !loop };
      },
    };
  },
};
