/** Direct backend: this process owns the device and runs effects itself. */
import {
  InvalidArgumentError,
  testPatternFrame,
  type BuiltinSelection,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";
import { EffectRegistry, type Effect } from "@anshmehta7x/animatrix-effects";
import type { Backend } from "./backend.js";
import type { AnimeDevice } from "./device.js";
import { LocalRunner } from "./local-runner.js";

export class DirectBackend implements Backend {
  readonly via = "direct";
  private readonly local: LocalRunner;

  constructor(
    private readonly device: AnimeDevice,
    private readonly registry = new EffectRegistry(),
  ) {
    this.local = new LocalRunner(device.profile);
  }

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
      await this.local.stop();
      await this.device.useBuiltins(merged);
    } else {
      await this.device.setBuiltinSelection(merged);
    }
  }

  async showFrame(frame: Uint8Array): Promise<void> {
    await this.local.stop();
    await this.device.writeFrame(frame);
  }

  showTestPattern(): Promise<void> {
    return this.showFrame(testPatternFrame(this.profile));
  }

  play(effectId: string, params: Record<string, unknown>): Promise<void> {
    const effect = this.registry.get(effectId);
    if (!effect) return Promise.reject(new InvalidArgumentError(`unknown effect "${effectId}"`));
    return this.runEffect(effect, params);
  }

  runEffect(effect: Effect, params: Record<string, unknown>): Promise<void> {
    return this.local.start(effect, params, (frame) => this.device.writeFrame(frame));
  }

  stop(): Promise<void> {
    return this.local.stop();
  }

  wait(): Promise<void> {
    return this.local.wait();
  }

  async close(): Promise<void> {
    await this.local.dispose();
    await this.device.close();
  }
}
