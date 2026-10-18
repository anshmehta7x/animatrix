import { InvalidArgumentError } from "@anshmehta7x/animatrix-core";
import { drawMedia, mediaParams, updatable } from "../media/common.js";
import { probeVideo, VideoStream } from "../media/video.js";
import { bool, num, str } from "../params.js";
import type { Effect } from "../types.js";

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/** Video through ffmpeg, decoded straight to small greyscale frames at the playback fps. */
export const videoEffect: Effect = {
  id: "video",
  name: "Video",
  description: "Play a video file (anything ffmpeg can read)",
  category: "media",
  fps: 24,
  params: mediaParams(["mp4", "mkv", "webm", "mov", "avi", "gif"], {
    loop: { type: "boolean", label: "Loop", default: true },
    fps: {
      type: "number",
      label: "Frame rate",
      min: 5,
      max: 30,
      step: 1,
      unit: "fps",
      default: 24,
    },
  }),
  async create(params, ctx) {
    const file = str(params, "file");
    if (!file) throw new InvalidArgumentError("video: no file given");
    const src = await probeVideo(file);
    // Decode at ~2× the canvas so placement still has something to sample.
    const k =
      Math.min((ctx.width * 2) / src.width, (ctx.height * 2) / src.height) *
      Math.max(1, num(params, "scale"));
    const fps = num(params, "fps");
    const stream = new VideoStream(file, even(src.width * k), even(src.height * k), fps);
    stream.start();
    const live = updatable(params, ["file", "fps"]);
    return {
      render(_t, canvas) {
        const f = stream.next();
        if (f === null) return { changed: false, delay: 1000 / fps };
        if (f === "end") {
          if (!bool(live.get(), "loop")) return { changed: false, done: true };
          stream.start();
          return { changed: false, delay: 1000 / fps };
        }
        drawMedia(canvas, f, live.get());
        return { delay: 1000 / fps };
      },
      update: live.update,
      dispose() {
        stream.stop();
      },
    };
  },
};
