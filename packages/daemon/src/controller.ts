/**
 * The daemon's state machine: the only code that writes to the device. Holds the current content
 * (effect, raw frame or firmware built-ins), applies power gates, software brightness, and
 * reconnects when the device disappears (e.g. across suspend).
 */
import { EventEmitter } from "node:events";
import {
  AnimatrixError,
  InvalidArgumentError,
  scaleFrame,
  slotCount,
  toAnimatrixError,
  type BuiltinSelection,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";
import type { AnimeDevice, DaemonState, GateReason } from "@anshmehta7x/animatrix";
import { Runner, type EffectRegistry, type Services } from "@anshmehta7x/animatrix-effects";
import type { Config } from "./config.js";
import type { Logger } from "./log.js";

/** What should be on the panel when it is not gated. */
export type Content =
  | { kind: "idle" }
  | { kind: "builtins" }
  | { kind: "frame"; frame: Uint8Array }
  | { kind: "effect"; effect: string; params: Record<string, unknown>; scene: string | null };

export interface ControllerDeps {
  openDevice: () => Promise<AnimeDevice>;
  config: Config;
  saveConfig: (cfg: Config) => Promise<void>;
  registry: EffectRegistry;
  services: Services;
  log: Logger;
  /** Reconnect back-off in ms (default 5000). */
  retryMs?: number;
}

type GateKey = Exclude<GateReason, null>;
const GATE_ORDER: GateKey[] = ["sleep", "lid", "battery", "user"];

export interface ControllerEvents {
  state: [DaemonState];
  frame: [Uint8Array];
}

export class Controller extends EventEmitter<ControllerEvents> {
  config: Config;
  private device: AnimeDevice | null = null;
  private runner: Runner | null = null;
  private content: Content = { kind: "idle" };
  private readonly gates = new Set<GateKey>();
  private dim = 1;
  private lastRaw: Uint8Array | null = null;
  private lastOut: Uint8Array | null = null;
  private error: string | null = null;
  private retry: NodeJS.Timeout | null = null;
  private applying: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly deps: ControllerDeps) {
    super();
    this.config = deps.config;
  }

  /** Connect and show the startup scene (or keep retrying until the device appears). */
  async start(): Promise<void> {
    const startup = this.config.scenes[this.config.startupScene];
    this.content = startup
      ? {
          kind: "effect",
          effect: startup.effect,
          params: startup.params,
          scene: this.config.startupScene,
        }
      : { kind: "builtins" };
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.device) return;
    try {
      this.device = await this.deps.openDevice();
      this.error = null;
      this.deps.log.info("device connected", {
        model: this.device.profile.id,
        transport: this.device.transport.kind,
      });
      await this.device.setHardwareBrightness(this.config.device.hardwareBrightness);
      await this.reapply();
    } catch (err) {
      const e = toAnimatrixError(
        err,
        (c) => new AnimatrixError("TRANSPORT_FAILED", "open failed", null, c),
      );
      this.error = e.hint ? `${e.message}. ${e.hint}` : e.message;
      this.deps.log.warn("device unavailable, retrying", { code: e.code, message: e.message });
      this.device = null;
      this.scheduleRetry();
    }
    this.emitState();
  }

  private scheduleRetry(): void {
    if (this.retry || this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, this.deps.retryMs ?? 5000);
  }

  private async lostDevice(err: unknown): Promise<void> {
    const e = toAnimatrixError(
      err,
      (c) => new AnimatrixError("TRANSPORT_FAILED", "write failed", null, c),
    );
    this.deps.log.error(e, { code: e.code });
    await this.runner?.stop();
    this.runner = null;
    const dev = this.device;
    this.device = null;
    await dev?.close().catch(() => undefined);
    this.error = e.message;
    this.emitState();
    this.scheduleRetry();
  }

  /** Serialise content changes so rapid UI clicks never interleave. */
  private serial(fn: () => Promise<void>): Promise<void> {
    const run = this.applying.then(fn);
    this.applying = run.catch(() => undefined);
    return run;
  }

  /** Effective gate (highest priority first) or null. */
  get gate(): GateReason {
    return GATE_ORDER.find((g) => this.gates.has(g)) ?? null;
  }

  /** The device profile, if connected. */
  get profile(): AnimeDevice["profile"] | null {
    return this.device?.profile ?? null;
  }

  /** Transport mechanism in use, or null when disconnected. */
  get transportKind(): string | null {
    return this.device?.transport.kind ?? null;
  }

  /** Current content (for scene saving). */
  get currentContent(): Content {
    return this.content;
  }

  private async reapply(): Promise<void> {
    await this.runner?.stop();
    this.runner = null;
    const dev = this.device;
    if (!dev) return;
    if (this.gate) {
      await dev.setDisplay(false);
      return;
    }
    if (!dev.isDisplayOn) await dev.setDisplay(true);
    const c = this.content;
    if (c.kind === "builtins") {
      await dev.useBuiltins(this.config.builtins);
    } else if (c.kind === "frame") {
      await this.sink(c.frame);
    } else if (c.kind === "effect") {
      const effect = this.deps.registry.get(c.effect);
      if (!effect) throw new InvalidArgumentError(`unknown effect "${c.effect}"`);
      this.runner = await Runner.start({
        profile: dev.profile,
        effect,
        params: c.params,
        services: this.deps.services,
        maxFps: Math.min(this.config.device.maxFps, dev.profile.maxFps),
        sink: (frame) => this.sink(frame),
        onError: (e) => void this.lostDevice(e),
      });
    }
  }

  private async sink(raw: Uint8Array): Promise<void> {
    this.lastRaw = raw;
    const dev = this.device;
    if (!dev || this.gate) return;
    const out = scaleFrame(
      raw,
      this.config.device.softBrightness * this.dim,
      this.config.device.gamma,
    );
    await dev.writeFrame(out);
    this.lastOut = out;
    this.emit("frame", out);
  }

  /** Run an effect. Validation errors are thrown to the caller; nothing changes on failure. */
  play(
    effect: string,
    params: Record<string, unknown>,
    scene: string | null = null,
  ): Promise<void> {
    return this.serial(async () => {
      if (!this.deps.registry.get(effect))
        throw new InvalidArgumentError(`unknown effect "${effect}"`);
      const prev = this.content;
      this.content = { kind: "effect", effect, params, scene };
      try {
        await this.reapply();
      } catch (err) {
        this.content = prev;
        if (err instanceof AnimatrixError && err.code !== "TRANSPORT_FAILED") throw err;
        await this.lostDevice(err);
      }
      this.emitState();
    });
  }

  /** Show a raw frame. */
  showFrame(frame: Uint8Array): Promise<void> {
    return this.serial(async () => {
      const slots = this.device ? slotCount(this.device.profile) : frame.length;
      if (frame.length !== slots) {
        throw new InvalidArgumentError(`frame must be ${slots} bytes, got ${frame.length}`);
      }
      this.content = { kind: "frame", frame: frame.slice() };
      await this.reapply().catch((e) => this.lostDevice(e));
      this.emitState();
    });
  }

  /** Hand the panel to firmware animations, optionally changing the selection. */
  useBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void> {
    return this.serial(async () => {
      this.config.builtins = { ...this.config.builtins, ...sel };
      await this.deps.saveConfig(this.config);
      if (enable) {
        this.content = { kind: "builtins" };
        await this.reapply().catch((e) => this.lostDevice(e));
      } else {
        await this.device?.setBuiltinSelection(this.config.builtins);
      }
      this.emitState();
    });
  }

  /** Put back previously saved content (used around suspend). */
  restore(content: Content): Promise<void> {
    return this.serial(async () => {
      this.content = content;
      await this.reapply().catch((e) => this.lostDevice(e));
      this.emitState();
    });
  }

  /** Stop the current effect; the last frame stays. */
  stop(): Promise<void> {
    return this.serial(async () => {
      await this.runner?.stop();
      this.runner = null;
      this.content = this.lastRaw ? { kind: "frame", frame: this.lastRaw } : { kind: "idle" };
      this.emitState();
    });
  }

  /** Turn a gate on or off; any gate turns the display off and pauses writes. */
  setGate(gate: GateKey, on: boolean): Promise<void> {
    return this.serial(async () => {
      const before = this.gate;
      if (on) this.gates.add(gate);
      else this.gates.delete(gate);
      if (before !== this.gate) {
        this.deps.log.info("gate changed", { gate: this.gate ?? "none" });
        await this.reapply().catch((e) => this.lostDevice(e));
      }
      this.emitState();
    });
  }

  async setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    this.config.device.hardwareBrightness = level;
    await this.deps.saveConfig(this.config);
    await this.device?.setHardwareBrightness(level).catch((e) => this.lostDevice(e));
    this.emitState();
  }

  async setSoftBrightness(value: number): Promise<void> {
    this.config.device.softBrightness = Math.min(1, Math.max(0, value));
    await this.deps.saveConfig(this.config);
    await this.refreshOutput();
  }

  /** Night-dim factor from the schedule (0..1). */
  async setDim(factor: number): Promise<void> {
    if (factor === this.dim) return;
    this.dim = factor;
    await this.refreshOutput();
  }

  /** Re-send the last raw frame with new software brightness (static content stays idle). */
  private async refreshOutput(): Promise<void> {
    if (this.lastRaw && this.content.kind !== "builtins")
      await this.sink(this.lastRaw).catch((e) => this.lostDevice(e));
    this.emitState();
  }

  /** Re-handshake after resume. */
  async reinit(): Promise<void> {
    await this.serial(async () => {
      if (!this.device) return void (await this.connect());
      try {
        await this.device.reinit();
        await this.reapply();
      } catch (err) {
        await this.lostDevice(err);
      }
    });
  }

  /** Last frame actually sent (after brightness), for previews. */
  get outputFrame(): Uint8Array | null {
    return this.lastOut;
  }

  /** Snapshot for D-Bus. */
  state(): DaemonState {
    const c = this.content;
    return {
      connected: this.device !== null,
      displayOn: this.device?.isDisplayOn ?? false,
      gate: this.gate,
      hardwareBrightness: this.config.device.hardwareBrightness,
      softBrightness: this.config.device.softBrightness,
      content: c.kind,
      effect: c.kind === "effect" ? c.effect : null,
      params: c.kind === "effect" ? c.params : {},
      scene: c.kind === "effect" ? c.scene : null,
      builtins: this.config.builtins,
      fps: this.runner?.fpsCap ?? 0,
      error: this.error,
    };
  }

  private emitState(): void {
    this.emit("state", this.state());
  }

  /** Stop everything and release the device. */
  async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.runner?.stop();
    this.runner = null;
    await this.device?.close();
    this.device = null;
  }
}
