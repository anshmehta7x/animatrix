/**
 * The friendly, high-level entry point.
 *
 * ```ts
 * const m = await Matrix.open();   // via animatrixd if running, else direct
 * await m.setBrightness("medium");
 * await m.showImage("cat.png", { fit: "contain" });
 * ```
 */
import { resolve } from "node:path";
import {
  DeviceBusyError,
  InvalidArgumentError,
  Mapper,
  profileById,
  toAnimatrixError,
  AnimatrixError,
  type BuiltinSelection,
  type Canvas,
  type DitherMode,
  type HardwareBrightness,
  type MappingMode,
  type ModelProfile,
} from "@anshmehta7x/animatrix-core";
import type { Backend } from "./backend.js";
import { DaemonBackend } from "./daemon-backend.js";
import { DaemonClient, isDaemonRunning } from "./daemon-client.js";
import { AnimeDevice, resolveProfile, type DeviceOptions } from "./device.js";
import { DirectBackend } from "./direct-backend.js";

/** Named hardware brightness levels (`C0 04` 0..3). */
export type BrightnessName = "off" | "low" | "medium" | "high";

const BRIGHTNESS: Record<BrightnessName, HardwareBrightness> = {
  off: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** Options for {@link Matrix.open}. */
export interface OpenOptions extends DeviceOptions {
  /** Open the device in this process even if animatrixd could be used. */
  direct?: boolean;
  /** With `direct`, open even if animatrixd is running (you will fight it). */
  force?: boolean;
}

/** Placement and tone options shared by every media call. */
export interface MediaOptions {
  fit?: "contain" | "cover" | "stretch";
  scale?: number;
  /** Degrees clockwise. */
  rotate?: number;
  /** Pan as a fraction of the canvas, -1..1. */
  panX?: number;
  panY?: number;
  mapping?: MappingMode;
  brightness?: number;
  contrast?: number;
  gamma?: number;
  invert?: boolean;
  /** 0 = off. */
  threshold?: number;
  dither?: DitherMode;
  levels?: number;
}

/** Extra options for animated media. */
export interface AnimationOptions extends MediaOptions {
  loop?: boolean;
  /** GIF playback speed multiplier. */
  speed?: number;
}

/** Options for {@link Matrix.draw}. */
export interface DrawOptions {
  mapping?: MappingMode;
}

const defined = (o: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A handle on the AniMe Matrix, through the daemon or directly. */
export class Matrix {
  private constructor(private readonly backend: Backend) {}

  /**
   * Open the matrix. Uses animatrixd when it is running (unless `direct`), otherwise opens the
   * device in-process.
   *
   * @throws {@link DeviceBusyError} if `direct` is requested while animatrixd runs (without
   *   `force`), or asusd owns the device.
   * @throws {@link UnsupportedModelError}, {@link DeviceNotFoundError}, {@link PermissionDeniedError}
   */
  static async open(opts: OpenOptions = {}): Promise<Matrix> {
    try {
      const daemon = typeof opts.transport === "object" ? false : await isDaemonRunning();
      if (daemon && !opts.direct) {
        const client = await DaemonClient.connect();
        const info = await client.info();
        const profile = profileById(info.model) ?? (await resolveProfile(opts.model));
        return new Matrix(new DaemonBackend(client, profile));
      }
      if (daemon && !opts.force) throw new DeviceBusyError("animatrixd");
      const device = await AnimeDevice.open(opts);
      return new Matrix(new DirectBackend(device));
    } catch (err) {
      throw toAnimatrixError(
        err,
        (c) => new AnimatrixError("TRANSPORT_FAILED", "Failed to open the matrix", null, c),
      );
    }
  }

  /** Wrap an already opened device (e.g. with a MockTransport). */
  static fromDevice(device: AnimeDevice): Matrix {
    return new Matrix(new DirectBackend(device));
  }

  /** Whether calls go through animatrixd or straight to the device. */
  get via(): "direct" | "daemon" {
    return this.backend.via;
  }

  /** The detected model profile. */
  get profile(): ModelProfile {
    return this.backend.profile;
  }

  /** Set hardware brightness by name or level 0..3. */
  setBrightness(level: BrightnessName | HardwareBrightness): Promise<void> {
    const value = typeof level === "string" ? BRIGHTNESS[level] : level;
    if (value === undefined || ![0, 1, 2, 3].includes(value)) {
      return Promise.reject(
        new InvalidArgumentError(`brightness must be off/low/medium/high or 0..3`),
      );
    }
    return this.backend.setHardwareBrightness(value);
  }

  /** Turn the display on. */
  on(): Promise<void> {
    return this.backend.setDisplay(true);
  }

  /** Turn the display off. */
  off(): Promise<void> {
    return this.backend.setDisplay(false);
  }

  /** Show a still image. */
  showImage(path: string, opts: MediaOptions = {}): Promise<void> {
    return this.backend.play("image", { file: resolve(path), ...defined(opts) });
  }

  /** Play an animated GIF/WebP using each frame's own delay. */
  playGif(path: string, opts: AnimationOptions = {}): Promise<void> {
    return this.backend.play("gif", { file: resolve(path), ...defined(opts) });
  }

  /** Play a video through ffmpeg. */
  playVideo(path: string, opts: AnimationOptions & { fps?: number } = {}): Promise<void> {
    const { speed: _speed, ...rest } = opts;
    return this.backend.play("video", { file: resolve(path), ...defined(rest) });
  }

  /** Show static or scrolling text. */
  showText(
    text: string,
    opts: { scroll?: boolean; speed?: number; font?: string; size?: number } = {},
  ): Promise<void> {
    return this.backend.play("text", { text, ...defined(opts) });
  }

  /** Run any registered effect by id with its params. */
  play(effect: string, params: Record<string, unknown> = {}): Promise<void> {
    return this.backend.play(effect, params);
  }

  /**
   * Draw with a callback on a canvas sized for the chosen mapping, then show it once.
   *
   * ```ts
   * await m.draw((c) => { c.clear(); c.text(0, 10, "hi"); c.pixel(5, 5, 255); });
   * ```
   */
  async draw(fn: (canvas: Canvas) => void, opts: DrawOptions = {}): Promise<void> {
    const mapper = new Mapper(this.profile, { mode: opts.mapping ?? "planar" });
    const canvas = mapper.createCanvas();
    fn(canvas);
    await this.backend.showFrame(mapper.map(canvas));
  }

  /** Send a raw LED frame (length = slot count of the profile). */
  showFrame(frame: Uint8Array): Promise<void> {
    return this.backend.showFrame(frame);
  }

  /** Show the orientation test pattern (see docs/hardware-notes.md). */
  showTestPattern(): Promise<void> {
    return this.backend.showTestPattern();
  }

  /**
   * Choose firmware built-in animations and (by default) hand the panel back to them.
   *
   * ```ts
   * await m.setBuiltins({ awake: "rogLogoGlitch", sleep: "starfield" });
   * ```
   */
  setBuiltins(sel: Partial<BuiltinSelection>, opts: { enable?: boolean } = {}): Promise<void> {
    return this.backend.setBuiltins(sel, opts.enable ?? true);
  }

  /** Stop the current effect (the last frame stays on the panel). */
  stop(): Promise<void> {
    return this.backend.stop();
  }

  /** In direct mode, resolve when the current non-looping animation finishes. */
  wait(): Promise<void> {
    return this.backend.wait();
  }

  /** Stop and release everything. */
  close(): Promise<void> {
    return this.backend.close();
  }
}
