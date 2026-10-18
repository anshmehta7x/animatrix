/** Daemon backend: forwards every call to animatrixd over D-Bus. */
import type {
  BuiltinSelection,
  HardwareBrightness,
  ModelProfile,
} from "@anshmehta7x/animatrix-core";
import type { Backend } from "./backend.js";
import type { DaemonClient } from "./daemon-client.js";

export class DaemonBackend implements Backend {
  readonly via = "daemon";

  constructor(
    readonly client: DaemonClient,
    readonly profile: ModelProfile,
  ) {}

  setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    return this.client.setHardwareBrightness(level);
  }
  setDisplay(on: boolean): Promise<void> {
    return this.client.setDisplay(on);
  }
  setBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void> {
    return this.client.setBuiltins(sel, enable);
  }
  showFrame(frame: Uint8Array): Promise<void> {
    return this.client.showFrame(frame);
  }
  showTestPattern(): Promise<void> {
    return this.client.showTestPattern();
  }
  play(effect: string, params: Record<string, unknown>): Promise<void> {
    return this.client.play(effect, params);
  }
  stop(): Promise<void> {
    return this.client.stop();
  }
  async wait(): Promise<void> {}
  async close(): Promise<void> {
    this.client.close();
  }
}
