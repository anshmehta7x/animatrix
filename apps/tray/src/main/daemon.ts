/**
 * Keeps a connection to animatrixd, reconnecting when its bus name appears (event-driven via
 * NameOwnerChanged, no polling) and renewing the preview lease while the panel is visible.
 */
import { EventEmitter } from "node:events";
import dbus from "dbus-next";
import {
  BUS_NAME,
  DaemonClient,
  type DaemonInfo,
  type DaemonState,
} from "@anshmehta7x/animatrix/client";
import type { EffectInfo, UiConfig } from "../shared/ipc.js";

interface BusProxy {
  NameHasOwner(name: string): Promise<boolean>;
  on(event: "NameOwnerChanged", fn: (name: string, old: string, owner: string) => void): void;
}

export interface LinkEvents {
  changed: [];
  state: [DaemonState];
  preview: [Uint8Array];
}

export class DaemonLink extends EventEmitter<LinkEvents> {
  client: DaemonClient | null = null;
  info: DaemonInfo | null = null;
  state: DaemonState | null = null;
  effects: EffectInfo[] = [];
  config: UiConfig | null = null;
  error: string | null = null;
  private bus: dbus.MessageBus | null = null;
  private previewTimer: NodeJS.Timeout | null = null;
  private connecting: Promise<void> | null = null;

  async start(): Promise<void> {
    const bus = dbus.sessionBus();
    bus.on("error", () => undefined);
    this.bus = bus;
    const obj = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
    const iface = obj.getInterface("org.freedesktop.DBus") as unknown as BusProxy;
    iface.on("NameOwnerChanged", (name, _old, owner) => {
      if (name !== BUS_NAME) return;
      if (owner) void this.connect();
      else this.drop("animatrixd stopped");
    });
    if (await iface.NameHasOwner(BUS_NAME)) await this.connect();
    else this.drop("animatrixd is not running");
  }

  private connect(): Promise<void> {
    this.connecting ??= (async () => {
      try {
        const client = await DaemonClient.connect();
        this.client?.close();
        this.client = client;
        client.onState((s) => {
          this.state = s;
          this.emit("state", s);
        });
        client.onPreview((f) => this.emit("preview", f));
        await this.refresh();
        this.error = null;
        if (this.previewTimer) await client.watchPreview(true).catch(() => undefined);
      } catch (err) {
        this.drop(String((err as Error).message ?? err));
      } finally {
        this.connecting = null;
        this.emit("changed");
      }
    })();
    return this.connecting;
  }

  /** Re-read info, state, effects and config. */
  async refresh(): Promise<void> {
    const c = this.client;
    if (!c) return;
    this.state = await c.state();
    this.info = await c.info().catch(() => null);
    this.effects = await c.listEffects<EffectInfo[]>();
    this.config = await c.config<UiConfig>();
    this.emit("changed");
  }

  private drop(reason: string): void {
    this.client?.close();
    this.client = null;
    this.info = null;
    this.state = null;
    this.error = reason;
    this.emit("changed");
  }

  /** The connected client, or throw a clear error. */
  need(): DaemonClient {
    if (!this.client)
      throw Object.assign(new Error(this.error ?? "animatrixd is not running"), {
        code: "DAEMON_UNAVAILABLE",
      });
    return this.client;
  }

  /** Start/stop receiving preview frames (lease renewed every 4 s). */
  setPreview(on: boolean): void {
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewTimer = null;
    void this.client?.watchPreview(on).catch(() => undefined);
    if (on) {
      this.previewTimer = setInterval(
        () => void this.client?.watchPreview(true).catch(() => undefined),
        4000,
      );
    }
  }

  stop(): void {
    this.setPreview(false);
    this.client?.close();
    this.bus?.disconnect();
  }
}
