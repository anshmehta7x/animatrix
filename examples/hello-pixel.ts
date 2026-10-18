// Hello, pixel: draw a few pixels and a word, then exit.
// Run: node examples/hello-pixel.ts
import { Matrix } from "@anshmehta7x/animatrix";

const m = await Matrix.open(); // through animatrixd if it's running, otherwise directly
console.log(`connected via ${m.via} to ${m.profile.name}`);
await m.setBrightness("medium");
await m.draw((c) => {
  c.clear();
  c.text(30, 4, "hi");
  c.pixel(33, 16, 255);
  c.circle(48, 18, 6, 180);
});
await m.close(); // the panel keeps showing the last frame
