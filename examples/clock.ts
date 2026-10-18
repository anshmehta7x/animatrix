// Switch to the built-in clock effect with an analogue face.
// Run: node examples/clock.ts
import { Matrix } from "@anshmehta7x/animatrix";

const m = await Matrix.open();
await m.play("clock", { face: "analogue", seconds: true });
if (m.via === "direct") {
  console.log("Running in this process; Ctrl-C to stop.");
  await new Promise((resolve) => process.once("SIGINT", resolve));
}
await m.close();
