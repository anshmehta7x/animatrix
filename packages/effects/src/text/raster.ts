/**
 * System-font text rasterisation via sharp (librsvg + fontconfig). The SVG has a fixed height and
 * baseline so that separately rendered strings line up; empty columns are trimmed.
 */
import sharp from "sharp";
import type { GreyImage } from "../media/decode.js";

const escapeXml = (s: string): string => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

const cache = new Map<string, Promise<GreyImage>>();

/** Pixel height of the bitmap produced for a given font size. */
export function rasterHeight(sizePx: number): number {
  return Math.ceil(sizePx * 1.25);
}

/** Render `text` in a system font family. Results are cached. */
export function rasterText(
  text: string,
  family: string,
  sizePx: number,
  bold = false,
): Promise<GreyImage> {
  const key = `${family}|${sizePx}|${bold}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = render(text, family, sizePx, bold);
  if (cache.size > 512) cache.clear();
  cache.set(key, job);
  return job;
}

async function render(
  text: string,
  family: string,
  sizePx: number,
  bold: boolean,
): Promise<GreyImage> {
  const height = rasterHeight(sizePx);
  const width = Math.max(8, Math.ceil(sizePx * 0.9 * Math.max(1, text.length)) + 8);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="2" y="${Math.round(sizePx)}" font-family="${escapeXml(family)}" font-size="${sizePx}px"` +
    ` font-weight="${bold ? 700 : 400}" fill="#fff" xml:space="preserve">${escapeXml(text)}</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: "#000" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const colLit = (x: number): boolean => {
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * ch]! > 24) return true;
    return false;
  };
  let left = 0;
  let right = info.width - 1;
  while (left < right && !colLit(left)) left++;
  while (right > left && !colLit(right)) right--;
  if (text.trim() === "") {
    left = 0;
    right = Math.max(1, Math.round(sizePx * 0.3));
  }
  const w = right - left + 1;
  const out = new Uint8Array(w * info.height * 2);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 2] = data[(y * info.width + x + left) * ch]!;
      out[(y * w + x) * 2 + 1] = 255;
    }
  }
  return { width: w, height: info.height, data: out };
}
