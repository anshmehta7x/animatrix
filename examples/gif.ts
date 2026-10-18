// Play an animated GIF once with its own per-frame timing.
// Run: node examples/gif.ts path/to/loop.gif
import { Matrix } from "@anshmehta7x/animatrix";

const file = process.argv[2];
if (!file) throw new Error("usage: node examples/gif.ts <file>");

const m = await Matrix.open();
await m.playGif(file, { loop: false, fit: "cover" });
// In direct mode the animation lives in this process: wait for it to finish.
// Through animatrixd it keeps playing after we exit, and wait() returns at once.
await m.wait();
await m.close();
