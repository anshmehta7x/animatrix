// Renders site/og.png (1200x630 social card) from SVG with sharp. Run: node site/make-og.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/tray/package.json", import.meta.url));
const sharp = require("sharp");

const rows = 61,
  cols = 34,
  full = 11;
const dots = [];
for (let y = 0; y < rows; y++) {
  const first = Math.ceil(Math.max(0, y - full) / 2);
  for (let x = first; x < cols; x++) {
    const cx = 640 + (x + (y % 2) * 0.5) * 15;
    const cy = 150 + y * 5.5;
    const wave = Math.sin(x * 0.45 - y * 0.18) * 0.5 + 0.5;
    const on = wave > 0.55;
    dots.push(
      `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#fff" opacity="${on ? (0.35 + wave * 0.65).toFixed(2) : 0.07}"/>`,
    );
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#000"/>
<rect x="620" y="125" width="540" height="385" rx="14" fill="none" stroke="#333"/>
${dots.join("")}
<text x="64" y="250" font-family="Geist, Inter, sans-serif" font-size="64" font-weight="700" fill="#ededed" letter-spacing="-2">animatrix</text>
<text x="64" y="310" font-family="Geist, Inter, sans-serif" font-size="30" fill="#a1a1a1">AniMe Matrix control for Linux</text>
<text x="64" y="356" font-family="Geist, Inter, sans-serif" font-size="22" fill="#666">For the ROG Zephyrus G14 and G16</text>
<circle cx="72" cy="455" r="6" fill="#00e599"/>
<text x="90" y="462" font-family="Geist Mono, monospace" font-size="20" fill="#a1a1a1">tray app, CLI, daemon, library</text>
</svg>`;
await sharp(Buffer.from(svg))
  .png()
  .toFile(new URL("og.png", import.meta.url).pathname);
console.log("site/og.png written");
