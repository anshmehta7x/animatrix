import { decodeImage } from "../media/decode.js";
import { drawMedia, mediaParams, updatable } from "../media/common.js";
import { str } from "../params.js";
import type { Effect } from "../types.js";
import { InvalidArgumentError } from "@anshmehta7x/animatrix-core";

/** A still image (PNG, JPEG, WebP, SVG, AVIF; animated files show their first frame). */
export const imageEffect: Effect = {
  id: "image",
  name: "Image",
  description: "Show a still image",
  category: "media",
  fps: 0,
  params: mediaParams(["png", "jpg", "jpeg", "webp", "svg", "avif", "gif", "bmp", "tif", "tiff"]),
  async create(params) {
    const file = str(params, "file");
    if (!file) throw new InvalidArgumentError("image: no file given");
    const media = await decodeImage(file);
    const frame = media.frames[0]!;
    const live = updatable(params, ["file"]);
    return {
      render(_t, canvas) {
        drawMedia(canvas, frame, live.get());
      },
      update: live.update,
    };
  },
};
