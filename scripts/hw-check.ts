// Low-level GA402 hardware check: writes straight to the device over hidraw, bypassing the
// library. Stop animatrixd first (systemctl --user stop animatrixd).
//
//   node scripts/hw-check.ts pattern     row-0/col-0 marker, row outline, an "F" (wire coordinates)
//   node scripts/hw-check.ts levels      254 vs 255 halves and a 0-15 brightness ramp
//   node scripts/hw-check.ts brightness  steps hardware brightness 0..3
//   node scripts/hw-check.ts bench       measures per-report time and full-frame fps
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HID = require("../packages/animatrix/node_modules/node-hid") as {
  setDriverType(t: string): void;
  devices(vid: number, pid: number): { path: string; usagePage: number; usage: number }[];
  HID: new (path: string) => { sendFeatureReport(d: number[] | Buffer): number; close(): void };
};

const ROWS = 61;
const COLS = 34;
const FULL = 11;
const PANE = 627;
const firstX = (y: number): number => Math.ceil(Math.max(0, y - FULL) / 2);
const rowStart: number[] = [];
let acc = 0;
for (let y = 0; y < ROWS; y++) {
  rowStart.push(acc);
  acc += COLS - firstX(y);
}
const LEDS = acc; // 1449

function pkt(bytes: number[]): Buffer {
  const b = Buffer.alloc(640);
  b[0] = 0x5e;
  bytes.forEach((v, i) => (b[i + 1] = v));
  return b;
}

function set(buf: Uint8Array, x: number, y: number, v: number): void {
  if (y >= 0 && y < ROWS && x >= firstX(y) && x < COLS) {
    buf[rowStart[y]! - firstX(y) + x] = v;
  }
}

HID.setDriverType("hidraw");
const info = HID.devices(0x0b05, 0x193b).find((d) => d.usagePage === 0xff31 && d.usage === 0x80);
if (!info) throw new Error("FF31/0080 collection not found");
const dev = new HID.HID(info.path);

function send(p: Buffer): number {
  const n = dev.sendFeatureReport(p);
  if (n !== 640) throw new Error(`sendFeatureReport returned ${n}`);
  return n;
}

function frame(buf: Uint8Array): void {
  for (let i = 0; i < 3; i++) {
    const start = i * PANE + 1;
    const p = pkt([0xc0, 0x02, start & 0xff, start >> 8, PANE & 0xff, PANE >> 8]);
    const chunk = buf.subarray(i * PANE, Math.min(LEDS, (i + 1) * PANE));
    p.set(chunk, 7);
    send(p);
  }
  send(pkt([0xc0, 0x03]));
}

function setup(): void {
  send(pkt([..."ASUS Tech.Inc."].map((c) => c.charCodeAt(0))));
  send(pkt([0xc4, 0x01, 0x80]));
  send(pkt([0xc3, 0x01, 0x00]));
  send(pkt([0xc0, 0x04, 0x03]));
}

function pattern(): Uint8Array {
  const buf = new Uint8Array(LEDS);
  // dim outline: first and last LED of every row
  for (let y = 0; y < ROWS; y++) {
    set(buf, firstX(y), y, 60);
    set(buf, COLS - 1, y, 60);
  }
  // bright 4x6 block at row 0 / col 0
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) set(buf, x, y, 255);
  // big "F" in buffer coordinates, rows 16..44, cols 12..24 (stem at left, bars to the right)
  for (let y = 16; y <= 44; y++) for (let x = 12; x <= 14; x++) set(buf, x, y, 255);
  for (let y = 16; y <= 19; y++) for (let x = 12; x <= 24; x++) set(buf, x, y, 255);
  for (let y = 28; y <= 31; y++) for (let x = 12; x <= 20; x++) set(buf, x, y, 255);
  return buf;
}

const mode = process.argv[2] ?? "pattern";
setup();
if (mode === "pattern") {
  frame(pattern());
  console.log("pattern shown");
} else if (mode === "bench") {
  const buf = pattern();
  const per: number[] = [];
  const frames: number[] = [];
  const N = 200;
  for (let f = 0; f < N; f++) {
    buf[f % LEDS] = f & 1 ? 255 : 0;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 3; i++) {
      const start = i * PANE + 1;
      const p = pkt([0xc0, 0x02, start & 0xff, start >> 8, PANE & 0xff, PANE >> 8]);
      p.set(buf.subarray(i * PANE, Math.min(LEDS, (i + 1) * PANE)), 7);
      const a = process.hrtime.bigint();
      send(p);
      per.push(Number(process.hrtime.bigint() - a) / 1e6);
    }
    const a = process.hrtime.bigint();
    send(pkt([0xc0, 0x03]));
    per.push(Number(process.hrtime.bigint() - a) / 1e6);
    frames.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const q = (arr: number[], p: number): number =>
    [...arr].sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))]!;
  const mean = frames.reduce((s, v) => s + v, 0) / frames.length;
  console.log(
    JSON.stringify({
      reportMs: { p50: q(per, 0.5), p95: q(per, 0.95), max: q(per, 1) },
      frameMs: { p50: q(frames, 0.5), p95: q(frames, 0.95), mean },
      fps: 1000 / mean,
    }),
  );
  frame(pattern());
} else if (mode === "levels") {
  // left half 254, right half 255; plus a gradient strip 0..15 in row 8
  const buf = new Uint8Array(LEDS);
  for (let y = 0; y < 8; y++) for (let x = 0; x < COLS; x++) set(buf, x, y, x < 17 ? 254 : 255);
  for (let x = 0; x < 16; x++) for (let y = 10; y < 14; y++) set(buf, x * 2, y, x);
  frame(buf);
  console.log("levels shown");
} else if (mode === "brightness") {
  frame(pattern());
  for (const b of [0, 1, 2, 3]) {
    send(pkt([0xc0, 0x04, b]));
    console.log("brightness", b);
    await new Promise((r) => setTimeout(r, 1500));
  }
}
dev.close();
