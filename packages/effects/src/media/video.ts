/**
 * Video decoding through an ffmpeg child process: frames come out of stdout as raw greyscale at
 * the requested fps, already scaled down. Frames are pulled on demand with back-pressure.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { AnimatrixError } from "@anshmehta7x/animatrix-core";
import { greyFromLuma, type GreyImage } from "./decode.js";

/** Probe a video's size with ffprobe. */
export async function probeVideo(path: string): Promise<{ width: number; height: number }> {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    path,
  ]);
  const [w, h] = out.trim().split("x").map(Number);
  if (!w || !h) throw new AnimatrixError("MEDIA_FAILED", `ffprobe could not read ${path}`);
  return { width: w, height: h };
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", (e) =>
      reject(new AnimatrixError("MEDIA_FAILED", `${cmd} not available`, "Install ffmpeg.", e)),
    );
    p.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new AnimatrixError("MEDIA_FAILED", `${cmd} failed: ${err.trim()}`)),
    );
  });
}

/** Streams frames from one ffmpeg process; restartable for looping. */
export class VideoStream {
  private proc: ChildProcess | null = null;
  private buf = Buffer.alloc(0);
  private readonly frameBytes: number;
  private ended = false;
  private readonly queue: GreyImage[] = [];

  constructor(
    private readonly path: string,
    readonly width: number,
    readonly height: number,
    private readonly fps: number,
  ) {
    this.frameBytes = width * height;
  }

  /** Start (or restart from the beginning). */
  start(): void {
    this.stop();
    this.ended = false;
    this.buf = Buffer.alloc(0);
    this.queue.length = 0;
    const vf = `fps=${this.fps},scale=${this.width}:${this.height}:flags=area,format=gray`;
    const p = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        this.path,
        "-vf",
        vf,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    this.proc = p;
    p.stdout?.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= this.frameBytes) {
        const luma = new Uint8Array(this.buf.subarray(0, this.frameBytes));
        this.queue.push(greyFromLuma(this.width, this.height, luma));
        this.buf = this.buf.subarray(this.frameBytes);
      }
      if (this.queue.length > 8) p.stdout?.pause();
    });
    p.on("close", () => {
      if (this.proc === p) this.ended = true;
    });
    p.on("error", () => (this.ended = true));
  }

  /** Next frame, `null` if none is buffered yet, or `"end"` at end of stream. */
  next(): GreyImage | null | "end" {
    const f = this.queue.shift();
    if (this.queue.length < 4) this.proc?.stdout?.resume();
    if (f) return f;
    return this.ended ? "end" : null;
  }

  /** Kill ffmpeg. */
  stop(): void {
    const p = this.proc;
    this.proc = null;
    p?.kill("SIGKILL");
  }
}
