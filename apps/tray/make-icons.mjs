// Generates the tray and app icons from an SVG description of a tiny staggered lattice.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const dots = (size, fill, glow) => {
  const out = [];
  const rows = 6,
    cols = 5,
    pad = size * 0.16,
    step = (size - pad * 2) / (cols - 0.5);
  const vstep = (size - pad * 2) / (rows - 1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = pad + x * step + (y % 2 ? step / 2 : 0);
      const cy = pad + y * vstep;
      const cut = x + (y % 2 ? 0.5 : 0) < (y - 2) * 0.75; // diagonal cut, bottom-left
      if (cut) continue;
      const on = (x + y) % 3 !== 0;
      out.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(size * 0.055).toFixed(2)}" fill="${fill}" opacity="${on ? 1 : 0.35}" ${glow}/>`,
      );
    }
  }
  return out.join("");
};

mkdirSync("assets", { recursive: true });
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">${dots(64, "#ffffff", "")}</svg>`;
const app = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d36"/><stop offset="1" stop-color="#15161b"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#g)"/>
<g filter="url(#b)">${dots(256, "#9fb1ff", "")}</g>${dots(256, "#f4f6ff", "")}</svg>`;
writeFileSync("assets/icon.svg", app);
writeFileSync("assets/tray.svg", tray);
await sharp(Buffer.from(tray)).resize(32, 32).png().toFile("assets/tray.png");
await sharp(Buffer.from(tray)).resize(64, 64).png().toFile("assets/tray@2x.png");
for (const s of [48, 128, 256])
  await sharp(Buffer.from(app)).resize(s, s).png().toFile(`assets/icon-${s}.png`);
console.log("icons written");
