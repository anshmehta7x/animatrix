/**
 * System audio capture from the default sink's monitor (what you hear, not the mic).
 *
 * Uses `pw-record` with `stream.capture.sink=true` (PipeWire), falling back to `parec` on
 * `@DEFAULT_MONITOR@` (PulseAudio). Restarts capture when the default sink changes, detected via
 * `pactl subscribe`. Capture only runs while at least one subscriber exists.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { logBands, magnitudes } from "./fft.js";

/** Sample rate requested from the capture tool. */
export const SAMPLE_RATE = 48000;
const WINDOW = 2048;

const CAPTURE_COMMANDS: readonly [string, string[]][] = [
  [
    "pw-record",
    [
      "-P",
      "{ stream.capture.sink=true }",
      "--raw",
      "--format",
      "f32",
      "--rate",
      String(SAMPLE_RATE),
      "--channels",
      "1",
      "--latency",
      "20ms",
      "--media-category",
      "Capture",
      "-",
    ],
  ],
  [
    "parec",
    [
      "--device=@DEFAULT_MONITOR@",
      "--format=float32le",
      `--rate=${SAMPLE_RATE}`,
      "--channels=1",
      "--raw",
      "--latency-msec=20",
    ],
  ],
];

/** Shared audio source. */
export class AudioService {
  private readonly ring = new Float32Array(WINDOW);
  private writePos = 0;
  private subscribers = 0;
  private proc: ChildProcess | null = null;
  private watcher: ChildProcess | null = null;
  private commandIndex = 0;
  private leftover: Buffer = Buffer.alloc(0);
  /** Last error from the capture tool, if any. */
  lastError: string | null = null;

  /** Start capture (ref-counted). Returns a function that releases this subscription. */
  subscribe(): () => void {
    this.subscribers++;
    if (this.subscribers === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.subscribers--;
      if (this.subscribers === 0) this.stop();
    };
  }

  /** The most recent `n` samples (n ≤ 2048), oldest first. */
  waveform(n = WINDOW): Float32Array {
    const out = new Float32Array(Math.min(n, WINDOW));
    const start = this.writePos - out.length;
    for (let i = 0; i < out.length; i++) out[i] = this.ring[(start + i + WINDOW * 2) % WINDOW]!;
    return out;
  }

  /** `bands` log-spaced levels in 0..1. */
  spectrum(bands: number): Float32Array {
    return logBands(magnitudes(this.waveform(WINDOW)), SAMPLE_RATE, bands);
  }

  private push(chunk: Buffer): void {
    const buf = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
    const whole = buf.length - (buf.length % 4);
    for (let o = 0; o < whole; o += 4) {
      this.ring[this.writePos % WINDOW] = buf.readFloatLE(o);
      this.writePos = (this.writePos + 1) % WINDOW;
    }
    this.leftover = buf.subarray(whole);
  }

  private start(): void {
    const [cmd, args] = CAPTURE_COMMANDS[this.commandIndex]!;
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    this.proc = proc;
    proc.stdout?.on("data", (d: Buffer) => this.push(d));
    proc.on("error", (err) => {
      this.lastError = `${cmd}: ${err.message}`;
      if (this.commandIndex < CAPTURE_COMMANDS.length - 1 && this.proc === proc) {
        this.commandIndex++;
        this.proc = null;
        this.start();
      }
    });
    if (!this.watcher) this.watchDefaultSink();
  }

  private watchDefaultSink(): void {
    const w = spawn("pactl", ["subscribe"], { stdio: ["ignore", "pipe", "ignore"] });
    this.watcher = w;
    w.on("error", () => (this.watcher = null));
    w.stdout?.on("data", (d: Buffer) => {
      if (/Event 'change' on server/.test(d.toString()) && this.proc) this.restart();
    });
  }

  private restart(): void {
    const p = this.proc;
    this.proc = null;
    p?.kill();
    if (this.subscribers > 0) this.start();
  }

  private stop(): void {
    this.proc?.kill();
    this.proc = null;
    this.watcher?.kill();
    this.watcher = null;
    this.ring.fill(0);
  }

  /** Stop everything. */
  dispose(): void {
    this.subscribers = 0;
    this.stop();
  }
}
