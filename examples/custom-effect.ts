// Write your own effect: a bouncing ball with a fading trail.
// Run: node examples/custom-effect.ts   (Ctrl-C to stop)
import { Matrix, type Effect } from "@anshmehta7x/animatrix";

const bounce: Effect = {
  id: "bounce",
  name: "Bounce",
  description: "A ball bouncing around the safe area",
  category: "generative",
  fps: 30,
  params: {
    radius: { type: "number", label: "Radius", min: 1, max: 8, default: 3 },
  },
  create(params, ctx) {
    const r = params.radius as number;
    const box = ctx.safe; // the largest rectangle that is fully visible on the lid
    let x = box.x + r;
    let y = box.y + r;
    let vx = 22;
    let vy = 15;
    let last = 0;
    return {
      render(t, canvas) {
        const dt = (t - last) / 1000;
        last = t;
        x += vx * dt;
        y += vy * dt;
        if (x < box.x + r || x > box.x + box.width - r) vx = -vx;
        if (y < box.y + r || y > box.y + box.height - r) vy = -vy;
        canvas.fade(0.75);
        canvas.circle(x, y, r, 255, true);
      },
    };
  },
};

const m = await Matrix.open();
await m.run(bounce, { radius: 3 });
console.log("Bouncing; Ctrl-C to stop.");
await new Promise((resolve) => process.once("SIGINT", resolve));
await m.stop();
await m.close();
