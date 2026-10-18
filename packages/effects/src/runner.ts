/**
 * Drives one effect instance: renders at its fps (capped by the device ceiling), maps the canvas
 * to a frame and hands changed frames to a sink. Static content is sent once, then the runner
 * idles; identical consecutive frames are never re-sent.
 */
import {
  AnimatrixError,
  InvalidArgumentError,
  Mapper,
  toAnimatrixError,
  type Canvas,
  type MappingMode,
  type ModelProfile,
} from "@anshmehta7x/animatrix-core";
import { resolveParams } from "./params.js";
import type { Services } from "./services/index.js";
import type { Effect, EffectInstance, ParamValues } from "./types.js";

/** Timer functions (injectable for tests). */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Options for {@link Runner.start}. */
export interface RunnerOptions {
  profile: ModelProfile;
  effect: Effect;
  params?: ParamValues;
  services: Services;
  /** Frame-rate ceiling (default: the profile's `maxFps`). */
  maxFps?: number;
  /** Receives each changed frame. Awaited before the next render. */
  sink: (frame: Uint8Array, canvas: Canvas) => Promise<void>;
  /** Called on render or sink failure; the runner stops. */
  onError?: (err: AnimatrixError) => void;
  /** Called when a non-looping effect finishes (not on `stop()`). */
  onDone?: () => void;
  clock?: Clock;
}

/** A running effect. */
export class Runner {
  /** Validated parameter values. */
  readonly params: ParamValues;
  readonly mode: MappingMode;
  /** Effective fps cap. */
  readonly fpsCap: number;
  private readonly mapper: Mapper;
  private readonly canvas: Canvas;
  private last: Uint8Array | null = null;
  private timer: unknown = null;
  private stopped = false;
  private t0 = 0;
  private nextAt = 0;
  private constructor(
    private readonly opts: RunnerOptions,
    private readonly instance: EffectInstance,
    params: ParamValues,
    mapper: Mapper,
    private readonly clock: Clock,
  ) {
    this.params = params;
    this.mapper = mapper;
    this.mode = mapper.mode;
    this.canvas = mapper.createCanvas();
    this.fpsCap = Math.max(1, opts.maxFps ?? opts.profile.maxFps);
  }

  /**
   * Validate params, create the effect instance and start rendering.
   *
   * @throws {@link InvalidArgumentError} on bad params; any {@link AnimatrixError} from `create`.
   */
  static async start(opts: RunnerOptions): Promise<Runner> {
    const params = resolveParams(opts.effect.params, opts.params ?? {});
    const mode = ((params.mapping as MappingMode | undefined) ??
      opts.effect.mapping ??
      "planar") as MappingMode;
    if (mode !== "planar" && mode !== "diagonal")
      throw new InvalidArgumentError(`bad mapping ${String(mode)}`);
    const mapper = new Mapper(opts.profile, { mode });
    let instance: EffectInstance;
    try {
      instance = await opts.effect.create(params, {
        width: mapper.width,
        height: mapper.height,
        mode,
        profile: opts.profile,
        services: opts.services,
      });
    } catch (err) {
      throw toAnimatrixError(
        err,
        (c) => new AnimatrixError("MEDIA_FAILED", `${opts.effect.id}: failed to start`, null, c),
      );
    }
    const runner = new Runner(opts, instance, params, mapper, opts.clock ?? realClock);
    runner.t0 = runner.clock.now();
    runner.nextAt = runner.t0;
    void runner.tick();
    return runner;
  }

  /** The most recent frame sent (null before the first). */
  get lastFrame(): Uint8Array | null {
    return this.last;
  }

  /** True once stopped or finished. */
  get isStopped(): boolean {
    return this.stopped;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const now = this.clock.now();
    let result;
    try {
      result = this.instance.render(now - this.t0, this.canvas) ?? {};
      if (result.changed !== false) {
        const frame = this.mapper.map(this.canvas);
        if (!this.last || !sameBytes(frame, this.last)) {
          this.last = frame;
          await this.opts.sink(frame, this.canvas);
        }
      }
    } catch (err) {
      this.fail(err);
      return;
    }
    if (this.stopped) return;
    const isStatic = this.opts.effect.fps === 0 && result.delay === undefined;
    if (result.done || isStatic) {
      await this.finish(Boolean(result.done));
      return;
    }
    const minDelay = 1000 / this.fpsCap;
    const delay = Math.max(minDelay, result.delay ?? 1000 / this.opts.effect.fps);
    this.nextAt += delay;
    const after = this.clock.now();
    if (this.nextAt < after - delay) this.nextAt = after; // fell behind: don't burst
    this.timer = this.clock.setTimeout(() => void this.tick(), Math.max(0, this.nextAt - after));
  }

  private fail(err: unknown): void {
    const e = toAnimatrixError(
      err,
      (c) => new AnimatrixError("TRANSPORT_FAILED", "effect failed", null, c),
    );
    void this.stop();
    this.opts.onError?.(e);
  }

  private async finish(notify: boolean): Promise<void> {
    // Static content: keep the instance alive (it may own the only copy of the image) but stop
    // scheduling. Finished media: release resources.
    if (notify) {
      await this.stop();
      this.opts.onDone?.();
    }
  }

  /** Stop rendering and dispose the instance. Safe to call twice. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    await this.instance.dispose?.();
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
