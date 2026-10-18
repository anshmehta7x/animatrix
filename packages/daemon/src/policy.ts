/**
 * Host-side policy: power events → gates and built-ins, night dimming schedule, and the scene
 * playlist. Event-driven where the system offers events (UPower, logind); the schedule ticks once
 * a minute because time has no event.
 */
import type { Config } from "./config.js";
import type { Content, Controller } from "./controller.js";
import type { Logger } from "./log.js";
import type { PowerEvents } from "./power.js";

/** What the policy needs from a power monitor (PowerMonitor, or a fake in tests). */
export interface PowerSource {
  readonly onBattery: boolean;
  readonly lidClosed: boolean;
  on<K extends keyof PowerEvents>(event: K, fn: (...args: PowerEvents[K]) => void): unknown;
  releaseInhibitor(): Promise<void>;
  takeInhibitor(): Promise<void>;
}

/** Minutes since midnight for "HH:MM", or null if malformed. */
export function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Whether `now` falls in [from, to), handling windows that wrap past midnight. */
export function inWindow(now: Date, from: string, to: string): boolean {
  const a = parseHm(from);
  const b = parseHm(to);
  if (a === null || b === null || a === b) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return a < b ? t >= a && t < b : t >= a || t < b;
}

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Policy {
  private scheduleTimer: NodeJS.Timeout | null = null;
  private playlistTimer: NodeJS.Timeout | null = null;
  private playlistIndex = 0;
  private savedForSleep: Content | null = null;

  constructor(
    private readonly ctl: Controller,
    private readonly power: PowerSource | null,
    private readonly log: Logger,
  ) {}

  private get cfg(): Config {
    return this.ctl.config;
  }

  /** Hook up events and timers. */
  start(): void {
    const p = this.power;
    if (p) {
      p.on("battery", () => void this.applyPowerGates());
      p.on("lid", () => void this.applyPowerGates());
      p.on("sleep", (start) => void this.onSleep(start));
      p.on("shutdown", (start) => void (start && this.onShutdown()));
    }
    void this.applyPowerGates();
    this.tickSchedule();
    this.scheduleTimer = setInterval(() => this.tickSchedule(), 60_000);
    this.restartPlaylist();
  }

  /** Re-read config-dependent behaviour (after UpdateConfig). */
  configChanged(): void {
    void this.applyPowerGates();
    this.tickSchedule();
    this.restartPlaylist();
  }

  private async applyPowerGates(): Promise<void> {
    const p = this.power;
    if (!p) return;
    await this.ctl.setGate("battery", this.cfg.power.offOnBattery && p.onBattery);
    await this.ctl.setGate("lid", this.cfg.power.offOnLidClose && p.lidClosed);
  }

  private tickSchedule(): void {
    const s = this.cfg.schedule;
    const dim = s.enabled && inWindow(new Date(), s.dimFrom, s.dimTo) ? s.dimBrightness : 1;
    void this.ctl.setDim(dim);
  }

  private restartPlaylist(): void {
    if (this.playlistTimer) clearInterval(this.playlistTimer);
    this.playlistTimer = null;
    const pl = this.cfg.playlist;
    if (!pl.enabled || pl.scenes.length === 0) return;
    this.playlistTimer = setInterval(() => void this.nextScene(), pl.intervalSec * 1000);
  }

  /** Advance the playlist (only when the current content came from a scene). */
  async nextScene(): Promise<void> {
    const pl = this.cfg.playlist;
    const c = this.ctl.currentContent;
    if (c.kind === "effect" && c.scene === null) return; // user is playing something ad hoc
    const names = pl.scenes.filter((n) => n in this.cfg.scenes);
    if (names.length === 0) return;
    this.playlistIndex = (this.playlistIndex + 1) % names.length;
    const name = names[this.playlistIndex]!;
    const scene = this.cfg.scenes[name]!;
    await this.ctl
      .play(scene.effect, scene.params, name)
      .catch((e) => this.log.error(e, { scene: name }));
  }

  private async streamScene(name: string): Promise<void> {
    const scene = this.cfg.scenes[name];
    if (!scene) return;
    await this.ctl.play(scene.effect, scene.params, name).catch(() => undefined);
    await sleepMs(1500);
  }

  private async handOver(action: Config["power"]["onSuspend"], scene: string): Promise<void> {
    if (action === "scene") {
      await this.streamScene(scene);
      await this.ctl.setGate("sleep", true);
    } else if (action === "builtins") {
      await this.ctl.useBuiltins({}, true);
    } else if (action === "off") {
      await this.ctl.setGate("sleep", true);
    }
  }

  private async onSleep(start: boolean): Promise<void> {
    if (start) {
      this.log.info("preparing for sleep", { action: this.cfg.power.onSuspend });
      this.savedForSleep = this.ctl.currentContent;
      await this.handOver(this.cfg.power.onSuspend, this.cfg.power.sleepScene).catch((e) =>
        this.log.error(e),
      );
      await this.power?.releaseInhibitor();
      return;
    }
    this.log.info("resumed; re-initialising device");
    await this.ctl.setGate("sleep", false);
    await this.ctl.reinit();
    if (this.savedForSleep) await this.ctl.restore(this.savedForSleep);
    this.savedForSleep = null;
    await this.applyPowerGates();
    await this.power?.takeInhibitor();
  }

  private async onShutdown(): Promise<void> {
    this.log.info("preparing for shutdown", { action: this.cfg.power.onShutdown });
    await this.handOver(this.cfg.power.onShutdown, this.cfg.power.shutdownScene).catch((e) =>
      this.log.error(e),
    );
    await this.power?.releaseInhibitor();
  }

  /** Stop timers. */
  stop(): void {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    if (this.playlistTimer) clearInterval(this.playlistTimer);
  }
}
