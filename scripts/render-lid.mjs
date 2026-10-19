// Renders effects onto a simulated GA402 lid and encodes MP4 clips with ffmpeg. Offline: no
// device, no daemon. The visualiser is fed a synthetic beat, not real audio.
//
//   pnpm build && node scripts/render-lid.mjs <out-dir>
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { Mapper, latticeFor, profileById } from "../packages/core/dist/index.js";
import { EffectRegistry, resolveParams } from "../packages/effects/dist/index.js";

const OUT = process.argv[2] ?? "lid-renders";
const W = 1920,
  H = 1080,
  FPS = 30;
const profile = profileById("GA402");
const lattice = latticeFor(profile);
const registry = new EffectRegistry();

const services = {
  audio: () => ({
    subscribe: () => () => undefined,
    spectrum(n) {
      const t = performance.now() / 1000;
      const beat = Math.exp(-((t * 2) % 1) * 5);
      return Float32Array.from({ length: n }, (_, i) => {
        const f = i / n;
        const wob = 0.12 * Math.sin(t * 3.1 + i * 0.9) + 0.08 * Math.sin(t * 7.3 + i * 2.1);
        return 0.25 + 0.3 * (1 - f) * beat + 0.15 * (1 - f) + wob + 0.05 * Math.random();
      });
    },
    waveform(n) {
      const t = performance.now() / 1000;
      return Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i / 9 + t * 6));
    },
  }),
  nowPlaying: () => ({
    subscribe(cb) {
      cb({ title: "Get Lucky", artist: "Daft Punk", player: "spotify", playing: true });
      return () => undefined;
    },
  }),
  stats: () => ({
    subscribe: () => () => undefined,
    get: () => ({ cpu: 0.42, mem: 0.61, temp: 58, battery: 0.87, charging: false }),
  }),
};

// Fit the lattice into the frame, then draw each LED as an antialiased disc.
const scale = Math.min((W * 0.86) / lattice.widthCm, (H * 0.8) / lattice.heightCm);
const ox = (W - lattice.widthCm * scale) / 2;
const oy = (H - lattice.heightCm * scale) / 2;
const r =
  Math.min(profile.pitchCm.x / 2, Math.hypot(profile.pitchCm.x / 2, profile.pitchCm.y)) *
  0.42 *
  scale;
const leds = lattice.leds.map((l) => ({
  index: l.index,
  x: ox + (l.xCm + profile.pitchCm.x / 2) * scale,
  y: oy + (l.yCm + profile.pitchCm.y / 2) * scale,
}));

function paint(frame, buf) {
  buf.fill(0);
  for (let i = 0; i < buf.length; i += 3) buf[i] = buf[i + 1] = buf[i + 2] = 8;
  for (const led of leds) {
    const raw = frame[led.index] ?? 0;
    const v = raw <= 3 ? 0 : Math.pow(raw / 255, 0.6);
    const off = 26,
      on = 255;
    const c = off + (on - off) * v;
    const x0 = Math.floor(led.x - r - 1),
      x1 = Math.ceil(led.x + r + 1);
    const y0 = Math.floor(led.y - r - 1),
      y1 = Math.ceil(led.y + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - led.x, y - led.y)));
        if (a <= 0) continue;
        const p = (y * W + x) * 3;
        const val = buf[p] + (c - buf[p]) * a;
        buf[p] = val;
        buf[p + 1] = Math.min(255, val * (v > 0 ? 0.97 : 1));
        buf[p + 2] = Math.min(255, val * (v > 0 ? 0.92 : 1));
      }
    }
  }
}

async function render(name, effectId, params, seconds) {
  const effect = registry.get(effectId);
  const values = resolveParams(effect.params, params);
  const mode = values.mapping ?? effect.mapping ?? "planar";
  const mapper = new Mapper(profile, { mode });
  const canvas = mapper.createCanvas();
  const instance = await effect.create(values, {
    width: mapper.width,
    height: mapper.height,
    mode,
    safe: mapper.safeArea(),
    visible: mapper.coverage(),
    profile,
    services,
  });
  // Bloom: blurred copy screened over the sharp LEDs.
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${W}x${H}`,
      "-r",
      String(FPS),
      "-i",
      "-",
      "-filter_complex",
      "[0]format=gbrp,split[a][b];[b]gblur=sigma=9[g];[a][g]blend=all_mode=screen:all_opacity=0.7,format=yuv420p",
      "-c:v",
      "libopenh264",
      "-b:v",
      "12M",
      "-movflags",
      "+faststart",
      `${OUT}/${name}.mp4`,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const buf = Buffer.alloc(W * H * 3);
  const start = performance.now();
  for (let f = 0; f < seconds * FPS; f++) {
    const t = (f * 1000) / FPS;
    // Effects that read the clock (visualiser stub) see real elapsed time; pace to match.
    while (performance.now() - start < t) await new Promise((res) => setTimeout(res, 1));
    instance.render(t, canvas);
    paint(mapper.map(canvas), buf);
    if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once("drain", res));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(name)))));
  instance.dispose?.();
  console.log(`${OUT}/${name}.mp4`);
}

await mkdir(OUT, { recursive: true });
await render("clock", "clock", {}, 4);
await render("text", "text", { text: "hello from linux" }, 7);
await render("visualiser", "visualiser", {}, 8);
await render("matrix-rain", "matrix-rain", {}, 6);
await render("plasma", "plasma", {}, 6);
await render("life", "life", {}, 6);
await render("starfield", "starfield", {}, 6);
await render("now-playing", "now-playing", {}, 8);
