/**
 * Owns the device handle: opening, retrying with back-off while it is missing, and dropping it
 * after a transport failure. The controller reacts through hooks.
 */
import { AnimatrixError, toAnimatrixError } from "@anshmehta7x/animatrix-core";
import type { AnimeDevice } from "@anshmehta7x/animatrix";
import type { Logger } from "./log.js";

export interface SlotHooks {
  /** Called with a freshly opened device; throwing counts as a failed open. */
  connected(dev: AnimeDevice): Promise<void>;
  /** Called before a lost device is closed (stop writers). */
  dropping(): Promise<void>;
  /** Connection state or error changed. */
  changed(): void;
}

export class DeviceSlot {
  device: AnimeDevice | null = null;
  error: string | null = null;
  private retry: NodeJS.Timeout | null = null;
  private lastLogged: string | null = null;
  private stopped = false;

  constructor(
    private readonly open: () => Promise<AnimeDevice>,
    private readonly log: Logger,
    private readonly hooks: SlotHooks,
    private readonly retryMs = 5000,
  ) {}

  /** Open the device if not already open; on failure schedule a retry. */
  async connect(): Promise<void> {
    if (this.stopped || this.device) return;
    let dev: AnimeDevice | null = null;
    try {
      dev = await this.open();
      this.device = dev;
      await this.hooks.connected(dev);
      this.error = null;
      this.lastLogged = null;
      this.log.info("device connected", { model: dev.profile.id, transport: dev.transport.kind });
    } catch (err) {
      await dev?.close().catch(() => undefined);
      this.device = null;
      const e = toAnimatrixError(
        err,
        (c) => new AnimatrixError("TRANSPORT_FAILED", "open failed", null, c),
      );
      this.error = e.hint ? `${e.message}. ${e.hint}` : e.message;
      if (this.error !== this.lastLogged) {
        this.log.warn("device unavailable", { code: e.code, message: e.message });
        this.lastLogged = this.error;
      }
      // An unsupported model will not fix itself; everything else (missing node, permissions
      // not yet applied, device mid-resume) is retried.
      if (e.code !== "UNSUPPORTED_MODEL") this.scheduleRetry();
    }
    this.hooks.changed();
  }

  /** The device failed mid-use: drop it and start retrying. */
  async lost(err: unknown): Promise<void> {
    const e = toAnimatrixError(
      err,
      (c) => new AnimatrixError("TRANSPORT_FAILED", "write failed", null, c),
    );
    this.log.error(e, { code: e.code });
    await this.hooks.dropping();
    const dev = this.device;
    this.device = null;
    await dev?.close().catch(() => undefined);
    this.error = e.message;
    this.hooks.changed();
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.retry || this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, this.retryMs);
  }

  /** Stop retrying and close the device. */
  async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.device?.close();
    this.device = null;
  }
}
