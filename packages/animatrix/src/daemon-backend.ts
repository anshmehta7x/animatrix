/**
 * Daemon backend: forwards calls to animatrixd over D-Bus. Custom effects (not registered in the
 * daemon) render in this process and stream frames through `ShowFrame`, so the daemon still owns
 * the device and applies power gates and software brightness.
 */
import type {
  BuiltinSelection,
  HardwareBrightness,
  ModelProfile,
} from "@anshmehta7x/animatrix-core";
import type { Effect } from "@anshmehta7x/animatrix-effects";
import type { Backend } from "./backend.js";
import type { DaemonClient } from "./daemon-client.js";
import { LocalRunner } from "./local-runner.js";

export class DaemonBackend implements Backend {
  readonly via = "daemon";
  private readonly local: LocalRunner;

  constructor(
    readonly client: DaemonClient,
    readonly profile: ModelProfile,
  ) {
    this.local = new LocalRunner(profile);
  }

  setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    return this.client.setHardwareBrightness(level);
  }
  setDisplay(on: boolean): Promise<void> {
    return this.client.setDisplay(on);
  }
  async setBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void> {
    if (enable) await this.local.stop();
    await this.client.setBuiltins(sel, enable);
  }
  async showFrame(frame: Uint8Array): Promise<void> {
    await this.local.stop();
    await this.client.showFrame(frame);
  }
  async showTestPattern(): Promise<void> {
    await this.local.stop();
    await this.client.showTestPattern();
  }
  async play(effect: string, params: Record<string, unknown>): Promise<void> {
    await this.local.stop();
    await this.client.play(effect, params);
  }
  runEffect(effect: Effect, params: Record<string, unknown>): Promise<void> {
    return this.local.start(effect, params, (frame) => this.client.showFrame(frame));
  }
  async stop(): Promise<void> {
    if (this.local.active) await this.local.stop();
    else await this.client.stop();
  }
  /** Resolves when a locally run effect finishes; daemon-side effects resolve immediately. */
  wait(): Promise<void> {
    return this.local.wait();
  }
  async close(): Promise<void> {
    await this.local.dispose();
    this.client.close();
  }
}
