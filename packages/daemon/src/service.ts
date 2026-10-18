/**
 * D-Bus service `dev.animatrix.Matrix1` on the session bus. See docs/dbus-api.md for the
 * contract. Errors are D-Bus errors named `dev.animatrix.Error.<CODE>`.
 */
import dbus from "dbus-next";
import {
  AnimatrixError,
  InvalidArgumentError,
  Mapper,
  ledCount,
  slotCount,
  testPatternFrame,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";
import { ERROR_PREFIX, INTERFACE, type DaemonInfo } from "@anshmehta7x/animatrix";
import type { EffectRegistry } from "@anshmehta7x/animatrix-effects";
import { patchConfig, type Config } from "./config.js";
import type { Controller } from "./controller.js";
import type { Flasher } from "./flash.js";
import type { Logger } from "./log.js";

const PREVIEW_LEASE_MS = 10_000;
const PREVIEW_MIN_INTERVAL = 1000 / 15;

export interface ServiceDeps {
  ctl: Controller;
  registry: EffectRegistry;
  flasher: Flasher;
  saveConfig: (cfg: Config) => Promise<void>;
  onConfigChanged: () => void;
  log: Logger;
  version: string;
}

function toDbusError(err: unknown): dbus.DBusError {
  if (err instanceof dbus.DBusError) return err;
  const e =
    err instanceof AnimatrixError
      ? err
      : new AnimatrixError("TRANSPORT_FAILED", String((err as Error)?.message ?? err));
  return new dbus.DBusError(
    `${ERROR_PREFIX}${e.code}`,
    e.hint ? `${e.message} (${e.hint})` : e.message,
  );
}

function parseJson(text: string, what: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(text || "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not an object");
    return v as Record<string, unknown>;
  } catch {
    throw new InvalidArgumentError(`${what} must be a JSON object`);
  }
}

/** The exported interface. Method names are the public D-Bus API; keep them stable. */
export class MatrixInterface extends dbus.interface.Interface {
  private previewUntil = 0;
  private lastPreview = 0;

  constructor(private readonly d: ServiceDeps) {
    super(INTERFACE);
    d.ctl.on("state", (s) => this.StateChanged(JSON.stringify(s)));
    d.ctl.on("frame", (f) => {
      const now = Date.now();
      if (now > this.previewUntil || now - this.lastPreview < PREVIEW_MIN_INTERVAL) return;
      this.lastPreview = now;
      this.Preview(Buffer.from(f));
    });
  }

  private async guard<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.d.log.warn("D-Bus call failed", { message: String((err as Error)?.message ?? err) });
      throw toDbusError(err);
    }
  }

  private get profileOrThrow(): NonNullable<Controller["profile"]> {
    const p = this.d.ctl.profile;
    if (!p)
      throw new AnimatrixError(
        "DEVICE_NOT_FOUND",
        this.d.ctl.state().error ?? "device not connected",
      );
    return p;
  }

  GetInfo(): Promise<string> {
    return this.guard(() => {
      const p = this.profileOrThrow;
      const diag = new Mapper(p, { mode: "diagonal" });
      const info: DaemonInfo = {
        version: this.d.version,
        model: p.id,
        modelName: p.name,
        tested: p.tested,
        leds: ledCount(p),
        slots: slotCount(p),
        transport: this.d.ctl.transportKind ?? "none",
        maxFps: Math.min(p.maxFps, this.d.ctl.config.device.maxFps),
        canvas: { planar: { ...p.canvas }, diagonal: { width: diag.width, height: diag.height } },
      };
      return JSON.stringify(info);
    });
  }

  GetState(): string {
    return JSON.stringify(this.d.ctl.state());
  }

  SetBrightness(level: number): Promise<void> {
    return this.guard(async () => {
      if (![0, 1, 2, 3].includes(level)) throw new InvalidArgumentError("brightness must be 0..3");
      await this.d.ctl.setHardwareBrightness(level as HardwareBrightness);
    });
  }

  SetSoftBrightness(value: number): Promise<void> {
    return this.guard(() => this.d.ctl.setSoftBrightness(value));
  }

  SetDisplay(on: boolean): Promise<void> {
    return this.guard(() => this.d.ctl.setGate("user", !on));
  }

  SetBuiltins(json: string, enable: boolean): Promise<void> {
    return this.guard(() => this.d.ctl.useBuiltins(parseJson(json, "selection"), enable));
  }

  ShowFrame(frame: Buffer): Promise<void> {
    return this.guard(() => this.d.ctl.showFrame(new Uint8Array(frame)));
  }

  ShowTestPattern(): Promise<void> {
    return this.guard(() => this.d.ctl.showFrame(testPatternFrame(this.profileOrThrow)));
  }

  Play(effect: string, params: string): Promise<void> {
    return this.guard(() => this.d.ctl.play(effect, parseJson(params, "params")));
  }

  Stop(): Promise<void> {
    return this.guard(() => this.d.ctl.stop());
  }

  ListEffects(): string {
    return JSON.stringify(this.d.registry.describe().filter((e) => e.id !== "flash"));
  }

  ListScenes(): string {
    return JSON.stringify(this.d.ctl.config.scenes);
  }

  ApplyScene(name: string): Promise<void> {
    return this.guard(async () => {
      const scene = this.d.ctl.config.scenes[name];
      if (!scene) throw new InvalidArgumentError(`no scene named "${name}"`);
      await this.d.ctl.play(scene.effect, scene.params, name);
    });
  }

  SaveScene(name: string): Promise<void> {
    return this.guard(async () => {
      const c = this.d.ctl.currentContent;
      if (!name.trim()) throw new InvalidArgumentError("scene name is empty");
      if (c.kind !== "effect")
        throw new InvalidArgumentError("only effects can be saved as scenes");
      this.d.ctl.config.scenes[name] = { effect: c.effect, params: c.params };
      await this.d.saveConfig(this.d.ctl.config);
      this.StateChanged(JSON.stringify(this.d.ctl.state()));
    });
  }

  DeleteScene(name: string): Promise<void> {
    return this.guard(async () => {
      delete this.d.ctl.config.scenes[name];
      await this.d.saveConfig(this.d.ctl.config);
    });
  }

  GetConfig(): string {
    return JSON.stringify(this.d.ctl.config);
  }

  UpdateConfig(patch: string): Promise<void> {
    return this.guard(async () => {
      const prev = this.d.ctl.config;
      const next = patchConfig(prev, parseJson(patch, "patch"));
      this.d.ctl.config = next;
      await this.d.saveConfig(next);
      if (next.device.hardwareBrightness !== prev.device.hardwareBrightness) {
        await this.d.ctl.setHardwareBrightness(next.device.hardwareBrightness);
      }
      this.d.onConfigChanged();
    });
  }

  Flash(text: string): Promise<void> {
    return this.guard(() => this.d.flasher.flash(text));
  }

  WatchPreview(on: boolean): void {
    this.previewUntil = on ? Date.now() + PREVIEW_LEASE_MS : 0;
  }

  GetFrame(): Buffer {
    return Buffer.from(this.d.ctl.outputFrame ?? new Uint8Array(0));
  }

  StateChanged(json: string): string {
    return json;
  }

  Preview(frame: Buffer): Buffer {
    return frame;
  }
}

MatrixInterface.configureMembers({
  methods: {
    GetInfo: { outSignature: "s" },
    GetState: { outSignature: "s" },
    SetBrightness: { inSignature: "y" },
    SetSoftBrightness: { inSignature: "d" },
    SetDisplay: { inSignature: "b" },
    SetBuiltins: { inSignature: "sb" },
    ShowFrame: { inSignature: "ay" },
    ShowTestPattern: {},
    Play: { inSignature: "ss" },
    Stop: {},
    ListEffects: { outSignature: "s" },
    ListScenes: { outSignature: "s" },
    ApplyScene: { inSignature: "s" },
    SaveScene: { inSignature: "s" },
    DeleteScene: { inSignature: "s" },
    GetConfig: { outSignature: "s" },
    UpdateConfig: { inSignature: "s" },
    Flash: { inSignature: "s" },
    WatchPreview: { inSignature: "b" },
    GetFrame: { outSignature: "ay" },
  },
  signals: {
    StateChanged: { signature: "s" },
    Preview: { signature: "ay" },
  },
});
