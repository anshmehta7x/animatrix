/**
 * Power events from the system bus, without polling: UPower (`OnBattery`, `LidIsClosed`) via
 * PropertiesChanged, and logind `PrepareForSleep` / `PrepareForShutdown` with a delay inhibitor
 * so the daemon can stream a last frame or hand over to firmware animations first.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import dbus from "dbus-next";

interface PropsProxy {
  Get(iface: string, prop: string): Promise<dbus.Variant>;
  on(
    event: "PropertiesChanged",
    fn: (iface: string, changed: Record<string, dbus.Variant>) => void,
  ): void;
}

interface LoginProxy {
  on(event: "PrepareForSleep" | "PrepareForShutdown", fn: (start: boolean) => void): void;
}

/** Events: `battery(onBattery)`, `lid(closed)`, `sleep(start)`, `shutdown(start)`. */
export interface PowerEvents {
  battery: [boolean];
  lid: [boolean];
  sleep: [boolean];
  shutdown: [boolean];
}

/** Watches power state; call {@link releaseInhibitor} after handling a sleep/shutdown event. */
export class PowerMonitor extends EventEmitter<PowerEvents> {
  onBattery = false;
  lidClosed = false;
  private bus: dbus.MessageBus | null = null;
  private login: LoginProxy | null = null;
  private inhibitor: ChildProcess | null = null;

  /** Connect to the system bus. Failure (no UPower/logind) is non-fatal; returns the reason. */
  async start(): Promise<string | null> {
    try {
      const bus = dbus.systemBus();
      bus.on("error", () => undefined);
      this.bus = bus;
    } catch (err) {
      return `system bus unavailable: ${String(err)}`;
    }
    const problems = (await Promise.all([this.watchUpower(), this.watchLogind()])).filter(Boolean);
    return problems.length ? problems.join("; ") : null;
  }

  private async watchUpower(): Promise<string | null> {
    try {
      const obj = await this.bus!.getProxyObject(
        "org.freedesktop.UPower",
        "/org/freedesktop/UPower",
      );
      const props = obj.getInterface("org.freedesktop.DBus.Properties") as unknown as PropsProxy;
      this.onBattery = Boolean((await props.Get("org.freedesktop.UPower", "OnBattery")).value);
      this.lidClosed = Boolean((await props.Get("org.freedesktop.UPower", "LidIsClosed")).value);
      props.on("PropertiesChanged", (iface, changed) => {
        if (iface !== "org.freedesktop.UPower") return;
        if (changed.OnBattery && Boolean(changed.OnBattery.value) !== this.onBattery) {
          this.onBattery = Boolean(changed.OnBattery.value);
          this.emit("battery", this.onBattery);
        }
        if (changed.LidIsClosed && Boolean(changed.LidIsClosed.value) !== this.lidClosed) {
          this.lidClosed = Boolean(changed.LidIsClosed.value);
          this.emit("lid", this.lidClosed);
        }
      });
      return null;
    } catch (err) {
      return `UPower unavailable: ${String(err)}`;
    }
  }

  private async watchLogind(): Promise<string | null> {
    try {
      const obj = await this.bus!.getProxyObject(
        "org.freedesktop.login1",
        "/org/freedesktop/login1",
      );
      this.login = obj.getInterface("org.freedesktop.login1.Manager") as unknown as LoginProxy;
      await this.takeInhibitor();
      this.login.on("PrepareForSleep", (start) => this.emit("sleep", start));
      this.login.on("PrepareForShutdown", (start) => this.emit("shutdown", start));
      return null;
    } catch (err) {
      return `logind unavailable: ${String(err)}`;
    }
  }

  /**
   * Take a delay inhibitor (re-taken after every resume). dbus-next cannot receive the unix fd
   * that logind's Inhibit() returns, so this holds one through `systemd-inhibit` instead; killing
   * the child releases it.
   */
  async takeInhibitor(): Promise<void> {
    if (!this.login || this.inhibitor) return;
    const child = spawn(
      "systemd-inhibit",
      [
        "--what=sleep:shutdown",
        "--mode=delay",
        "--who=animatrix",
        "--why=Hand the AniMe Matrix to its sleep/shutdown animation",
        // Exits on its own if the daemon dies, so the lock can never outlive it.
        "tail",
        `--pid=${process.pid}`,
        "-f",
        "/dev/null",
      ],
      { stdio: "ignore" },
    );
    child.on("error", () => {
      if (this.inhibitor === child) this.inhibitor = null;
    });
    child.on("exit", () => {
      if (this.inhibitor === child) this.inhibitor = null;
    });
    this.inhibitor = child;
  }

  /** Let sleep/shutdown proceed. */
  async releaseInhibitor(): Promise<void> {
    const child = this.inhibitor;
    this.inhibitor = null;
    child?.kill();
  }

  /** Disconnect. */
  stop(): void {
    void this.releaseInhibitor();
    this.bus?.disconnect();
    this.bus = null;
  }
}
