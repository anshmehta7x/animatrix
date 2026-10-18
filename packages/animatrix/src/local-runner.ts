/** Runs an effect in this process and hands frames to a sink (device or daemon). */
import type { ModelProfile } from "@anshmehta7x/animatrix-core";
import { Runner, Services, type Effect } from "@anshmehta7x/animatrix-effects";

export class LocalRunner {
  private runner: Runner | null = null;
  private readonly services = new Services();
  private done: Promise<void> = Promise.resolve();
  private resolveDone: (() => void) | null = null;

  constructor(private readonly profile: ModelProfile) {}

  /** Start `effect`, replacing whatever ran before. */
  async start(
    effect: Effect,
    params: Record<string, unknown>,
    sink: (frame: Uint8Array) => Promise<void>,
  ): Promise<void> {
    await this.stop();
    this.done = new Promise((r) => (this.resolveDone = r));
    this.runner = await Runner.start({
      profile: this.profile,
      effect,
      params,
      services: this.services,
      sink,
      onDone: () => this.resolveDone?.(),
      onError: () => this.resolveDone?.(),
    });
  }

  /** True while an effect is running here. */
  get active(): boolean {
    return this.runner !== null && !this.runner.isStopped;
  }

  /** Resolves when the current effect finishes or is stopped. */
  wait(): Promise<void> {
    return this.done;
  }

  async stop(): Promise<void> {
    const r = this.runner;
    this.runner = null;
    await r?.stop();
    this.resolveDone?.();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.services.dispose();
  }
}
