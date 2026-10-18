/** Image / animated image decoding via sharp, to small greyscale+alpha frames. */
import sharp from "sharp";
import { AnimatrixError } from "@anshmehta7x/animatrix-core";

/** A greyscale image with alpha, values 0..255. */
export interface GreyImage {
  readonly width: number;
  readonly height: number;
  /** Interleaved [grey, alpha] pairs. */
  readonly data: Uint8Array;
}

/** Decoded media: one or more frames with per-frame delays in ms. */
export interface DecodedMedia {
  readonly frames: readonly GreyImage[];
  readonly delays: readonly number[];
}

/** Browsers treat GIF delays ≤ 10 ms as 100 ms; so do we. */
export function normaliseDelay(ms: number | undefined): number {
  return ms === undefined || ms <= 10 ? 100 : ms;
}

/**
 * Decode an image file (PNG, JPEG, WebP, SVG, GIF, AVIF...). Animated GIF/WebP yield every frame
 * with its own delay. Frames are downscaled to fit inside `maxSide` to keep sampling cheap.
 */
export async function decodeImage(path: string, maxSide = 288): Promise<DecodedMedia> {
  try {
    const meta = await sharp(path, { animated: true }).metadata();
    const pages = meta.pages ?? 1;
    const { data, info } = await sharp(path, { animated: true, density: 144 })
      .resize({ width: maxSide, height: maxSide * pages, fit: "inside", withoutEnlargement: true })
      .greyscale()
      .ensureAlpha()
      .toColourspace("b-w")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const pageHeight = info.pageHeight ?? Math.round(info.height / pages);
    const frames = Array.from({ length: pages }, (_, p) => {
      const out = new Uint8Array(info.width * pageHeight * 2);
      for (let i = 0; i < info.width * pageHeight; i++) {
        const o = (p * info.width * pageHeight + i) * channels;
        out[i * 2] = data[o]!;
        out[i * 2 + 1] = channels >= 2 ? data[o + channels - 1]! : 255;
      }
      return { width: info.width, height: pageHeight, data: out };
    });
    const delays = frames.map((_, i) => normaliseDelay(meta.delay?.[i]));
    return { frames, delays };
  } catch (err) {
    throw new AnimatrixError("MEDIA_FAILED", `Could not decode ${path}`, null, err);
  }
}

/** Wrap greyscale pixels (no alpha) as a {@link GreyImage}. */
export function greyFromLuma(width: number, height: number, luma: Uint8Array): GreyImage {
  const data = new Uint8Array(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    data[i * 2] = luma[i]!;
    data[i * 2 + 1] = 255;
  }
  return { width, height, data };
}
