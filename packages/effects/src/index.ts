/**
 * `@anshmehta7x/animatrix-effects`: effect plugins and the runner that drives them.
 *
 * @packageDocumentation
 */
export * from "./types.js";
export * from "./params.js";
export * from "./registry.js";
export * from "./runner.js";
export * from "./services/index.js";
export {
  decodeImage,
  normaliseDelay,
  greyFromLuma,
  type GreyImage,
  type DecodedMedia,
} from "./media/decode.js";
export { placeImage, DEFAULT_PLACEMENT, type Placement } from "./media/place.js";
export { drawMedia, mediaParams, placementFrom } from "./media/common.js";
export { rasterText } from "./text/raster.js";
export { TextWriter, fontFromParams, type FontChoice } from "./text/writer.js";
export { formatTime } from "./effects/clock.js";
export { lifeStep } from "./effects/life.js";
export { nowPlayingText } from "./effects/now-playing.js";
