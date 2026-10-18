/** Typed client for animatrixd's D-Bus API. */
import dbus from "dbus-next";
import {
  AnimatrixError,
  type AnimatrixErrorCode,
  type BuiltinSelection,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";
import {
  BUS_NAME,
  ERROR_PREFIX,
  INTERFACE,
  OBJECT_PATH,
  type DaemonInfo,
  type DaemonState,
} from "./dbus-api.js";

/** Raw proxy shape (method names as exported by the daemon). */
interface MatrixProxy {
  GetInfo(): Promise<string>;
  GetState(): Promise<string>;
  SetBrightness(level: number): Promise<void>;
  SetSoftBrightness(value: number): Promise<void>;
  SetDisplay(on: boolean): Promise<void>;
  SetBuiltins(json: string, enable: boolean): Promise<void>;
  ShowFrame(frame: Buffer): Promise<void>;
  ShowTestPattern(): Promise<void>;
  Play(effect: string, params: string): Promise<void>;
  Stop(): Promise<void>;
  ListEffects(): Promise<string>;
  ListScenes(): Promise<string>;
  ApplyScene(name: string): Promise<void>;
  SaveScene(name: string): Promise<void>;
  DeleteScene(name: string): Promise<void>;
  GetConfig(): Promise<string>;
  UpdateConfig(patch: string): Promise<void>;
  Flash(text: string): Promise<void>;
  WatchPreview(on: boolean): Promise<void>;
  GetFrame(): Promise<Buffer>;
  on(event: "StateChanged", fn: (json: string) => void): void;
  on(event: "Preview", fn: (frame: Buffer) => void): void;
  removeAllListeners(): void;
}

interface DbusProxy {
  NameHasOwner(name: string): Promise<boolean>;
}

/** Map a D-Bus error back to an AnimatrixError. */
export function fromDbusError(err: unknown): AnimatrixError {
  if (err instanceof AnimatrixError) return err;
  const e = err as { type?: string; text?: string; message?: string };
  if (e.type?.startsWith(ERROR_PREFIX)) {
    return new AnimatrixError(
      e.type.slice(ERROR_PREFIX.length) as AnimatrixErrorCode,
      e.text ?? "daemon error",
    );
  }
  return new AnimatrixError(
    "DAEMON_UNAVAILABLE",
    e.text ?? e.message ?? "D-Bus call failed",
    null,
    err,
  );
}

/** True if animatrixd currently owns its bus name. */
export async function isDaemonRunning(bus?: dbus.MessageBus): Promise<boolean> {
  const own = !bus;
  const b = bus ?? dbus.sessionBus();
  b.on("error", () => undefined);
  try {
    const obj = await b.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
    const iface = obj.getInterface("org.freedesktop.DBus") as unknown as DbusProxy;
    return await iface.NameHasOwner(BUS_NAME);
  } catch {
    return false;
  } finally {
    if (own) b.disconnect();
  }
}

/** A connected daemon client. All methods throw {@link AnimatrixError}. */
export class DaemonClient {
  private constructor(
    private readonly bus: dbus.MessageBus,
    private readonly proxy: MatrixProxy,
  ) {}

  /** Connect to the daemon on the session bus. */
  static async connect(): Promise<DaemonClient> {
    const bus = dbus.sessionBus();
    bus.on("error", () => undefined);
    try {
      const obj = await bus.getProxyObject(BUS_NAME, OBJECT_PATH);
      return new DaemonClient(bus, obj.getInterface(INTERFACE) as unknown as MatrixProxy);
    } catch (err) {
      bus.disconnect();
      throw new AnimatrixError(
        "DAEMON_UNAVAILABLE",
        "animatrixd is not running",
        "systemctl --user start animatrixd",
        err,
      );
    }
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw fromDbusError(err);
    }
  }

  info(): Promise<DaemonInfo> {
    return this.call(async () => JSON.parse(await this.proxy.GetInfo()) as DaemonInfo);
  }
  state(): Promise<DaemonState> {
    return this.call(async () => JSON.parse(await this.proxy.GetState()) as DaemonState);
  }
  setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    return this.call(() => this.proxy.SetBrightness(level));
  }
  setSoftBrightness(value: number): Promise<void> {
    return this.call(() => this.proxy.SetSoftBrightness(value));
  }
  setDisplay(on: boolean): Promise<void> {
    return this.call(() => this.proxy.SetDisplay(on));
  }
  setBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void> {
    return this.call(() => this.proxy.SetBuiltins(JSON.stringify(sel), enable));
  }
  showFrame(frame: Uint8Array): Promise<void> {
    return this.call(() => this.proxy.ShowFrame(Buffer.from(frame)));
  }
  showTestPattern(): Promise<void> {
    return this.call(() => this.proxy.ShowTestPattern());
  }
  play(effect: string, params: Record<string, unknown>): Promise<void> {
    return this.call(() => this.proxy.Play(effect, JSON.stringify(params)));
  }
  stop(): Promise<void> {
    return this.call(() => this.proxy.Stop());
  }
  listEffects<T = unknown>(): Promise<T> {
    return this.call(async () => JSON.parse(await this.proxy.ListEffects()) as T);
  }
  listScenes<T = unknown>(): Promise<T> {
    return this.call(async () => JSON.parse(await this.proxy.ListScenes()) as T);
  }
  applyScene(name: string): Promise<void> {
    return this.call(() => this.proxy.ApplyScene(name));
  }
  saveScene(name: string): Promise<void> {
    return this.call(() => this.proxy.SaveScene(name));
  }
  deleteScene(name: string): Promise<void> {
    return this.call(() => this.proxy.DeleteScene(name));
  }
  config<T = unknown>(): Promise<T> {
    return this.call(async () => JSON.parse(await this.proxy.GetConfig()) as T);
  }
  updateConfig(patch: Record<string, unknown>): Promise<void> {
    return this.call(() => this.proxy.UpdateConfig(JSON.stringify(patch)));
  }
  flash(text: string): Promise<void> {
    return this.call(() => this.proxy.Flash(text));
  }
  watchPreview(on: boolean): Promise<void> {
    return this.call(() => this.proxy.WatchPreview(on));
  }
  frame(): Promise<Uint8Array> {
    return this.call(async () => new Uint8Array(await this.proxy.GetFrame()));
  }
  /** Subscribe to state changes. */
  onState(fn: (s: DaemonState) => void): void {
    this.proxy.on("StateChanged", (json) => fn(JSON.parse(json) as DaemonState));
  }
  /** Subscribe to preview frames (only sent while a preview watch is active). */
  onPreview(fn: (frame: Uint8Array) => void): void {
    this.proxy.on("Preview", (buf) => fn(new Uint8Array(buf)));
  }
  /** Disconnect. */
  close(): void {
    this.proxy.removeAllListeners();
    this.bus.disconnect();
  }
}
