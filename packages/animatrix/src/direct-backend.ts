/** Direct backend: this process owns the device and runs effects itself. */
import {
  InvalidArgumentError,
  testPatternFrame,
  type BuiltinSelection,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";
import { EffectRegistry, Runner, Services } from "@anshmehta7x/animatrix-effects";
import type { Backend } from "./backend.js";
import type { AnimeDevice } from "./device.js";

export class DirectBackend implements Backend {
  readonly via = "direct";
  private runner: Runner | null = null;
  private readonly services = new Services();
  private done: Promise<void> = Promise.resolve();
  private resolveDone: (() => void) | null = null;

  constructor(
    private readonly device: AnimeDevice,
    private readonly registry = new EffectRegistry(),
  ) {}

  get profile(): AnimeDevice["profile"] {
    return this.device.profile;
  }

  setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    return this.device.setHardwareBrightness(level);
  }

  setDisplay(on: boolean): Promise<void> {
    return this.device.setDisplay(on);
  }

  async setBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void> {
    const merged = { ...this.device.builtinSelection, ...sel };
    if (enable) {
      await this.stop();
      await this.device.useBuiltins(merged);
    } else {
      await this.device.setBuiltinSelection(merged);
    }
  }

  async showFrame(frame: Uint8Array): Promise<void> {
    await this.stop();
    await this.device.writeFrame(frame);
  }

  showTestPattern(): Promise<void> {
    return this.showFrame(testPatternFrame(this.profile));
  }

  async play(effectId: string, params: Record<string, unknown>): Promise<void> {
    const effect = this.registry.get(effectId);
    if (!effect) throw new InvalidArgumentError(`unknown effect "${effectId}"`);
    await this.stop();
    this.done = new Promise((r) => (this.resolveDone = r));
    this.runner = await Runner.start({
      profile: this.profile,
      effect,
      params,
      services: this.services,
      sink: (frame) => this.device.writeFrame(frame),
      onDone: () => this.resolveDone?.(),
      onError: () => this.resolveDone?.(),
    });
  }

  async stop(): Promise<void> {
    const r = this.runner;
    this.runner = null;
    await r?.stop();
    this.resolveDone?.();
  }

  wait(): Promise<void> {
    return this.done;
  }

  async close(): Promise<void> {
    await this.stop();
    this.services.dispose();
    await this.device.close();
  }
}
