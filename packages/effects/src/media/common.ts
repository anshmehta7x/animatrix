/** Shared handling for image / GIF / video effects. */
import { applyTone, type Canvas, type DitherMode } from "@anshmehta7x/animatrix-core";
import { MAPPING_PARAM, PLACEMENT_PARAMS, TONE_PARAMS, bool, num, str } from "../params.js";
import type { ParamSchema, ParamValues } from "../types.js";
import type { GreyImage } from "./decode.js";
import { placeImage, type Placement } from "./place.js";

/** Placement + tone + mapping params, after a media-specific `file` param. */
export function mediaParams(accept: readonly string[], extra: ParamSchema = {}): ParamSchema {
  return {
    file: { type: "file", label: "File", accept, default: "" },
    ...extra,
    ...PLACEMENT_PARAMS,
    ...TONE_PARAMS,
    ...MAPPING_PARAM,
  };
}

/** Placement from resolved params. */
export function placementFrom(p: ParamValues): Placement {
  return {
    fit: str(p, "fit") as Placement["fit"],
    scale: num(p, "scale"),
    rotate: num(p, "rotate"),
    panX: num(p, "panX"),
    panY: num(p, "panY"),
  };
}

/** Place a frame and apply tone in one go. */
export function drawMedia(canvas: Canvas, img: GreyImage, p: ParamValues): void {
  placeImage(canvas, img, placementFrom(p));
  const threshold = num(p, "threshold");
  applyTone(canvas, {
    brightness: num(p, "brightness"),
    contrast: num(p, "contrast"),
    gamma: num(p, "gamma"),
    invert: bool(p, "invert"),
    threshold: threshold > 0 ? threshold : null,
    dither: str(p, "dither") as DitherMode,
    levels: num(p, "levels"),
  });
}

/**
 * Holds an effect's current params and accepts updates unless one of `restartOn` changed.
 * Lets media effects re-place/re-tone without decoding the file again.
 */
export function updatable(
  initial: ParamValues,
  restartOn: readonly string[],
): { get(): ParamValues; update(next: ParamValues): boolean } {
  let current = initial;
  return {
    get: () => current,
    update(next) {
      if (restartOn.some((k) => next[k] !== current[k])) return false;
      current = next;
      return true;
    },
  };
}
