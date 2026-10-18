// Combines panel screenshots into docs/images/gallery.png (rounded panels, transparent gaps).
// Usage: node site/make-gallery.mjs a.png b.png c.png d.png
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/tray/package.json", import.meta.url));
const sharp = require("sharp");

const files = process.argv.slice(2);
const W = 400,
  H = 600,
  GAP = 24,
  R = 14;
const mask = Buffer.from(
  `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R}"/></svg>`,
);
const border = Buffer.from(
  `<svg width="${W}" height="${H}"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${R}" fill="none" stroke="#3a3a3a"/></svg>`,
);
const panels = await Promise.all(
  files.map((f) =>
    sharp(f)
      .resize(W, H)
      .composite([{ input: mask, blend: "dest-in" }, { input: border }])
      .png()
      .toBuffer(),
  ),
);
const width = files.length * W + (files.length - 1) * GAP;
await sharp({
  create: { width, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(panels.map((input, i) => ({ input, left: i * (W + GAP), top: 0 })))
  .png({ compressionLevel: 9 })
  .toFile(new URL("../docs/images/gallery.png", import.meta.url).pathname);
console.log("docs/images/gallery.png written");
