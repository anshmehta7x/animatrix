// Show an image file. Run: node examples/image.ts path/to/cat.png
import { Matrix } from "@anshmehta7x/animatrix";

const file = process.argv[2];
if (!file) throw new Error("usage: node examples/image.ts <file>");

const m = await Matrix.open();
await m.showImage(file, { fit: "contain", contrast: 1.2, dither: "floyd-steinberg" });
await m.close();
