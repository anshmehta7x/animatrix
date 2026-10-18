/**
 * "Now playing" from MPRIS players on the session bus. Event-driven: listens to
 * PropertiesChanged and NameOwnerChanged instead of polling.
 */
import dbus from "dbus-next";

/** Current track, if any player is active. */
export interface NowPlaying {
  title: string;
  artist: string;
  player: string;
  playing: boolean;
}

type Listener = (np: NowPlaying | null) => void;

interface BusProxy {
  ListNames(): Promise<string[]>;
  on(event: "NameOwnerChanged", fn: (name: string, old: string, owner: string) => void): void;
}

interface PropsProxy {
  GetAll(iface: string): Promise<Record<string, dbus.Variant>>;
  on(event: "PropertiesChanged", fn: (iface: string) => void): void;
}

const MPRIS_PREFIX = "org.mpris.MediaPlayer2.";
const PLAYER_IFACE = "org.mpris.MediaPlayer2.Player";

/** Session-bus MPRIS watcher. */
export class NowPlayingService {
  private bus: dbus.MessageBus | null = null;
  private current: NowPlaying | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly states = new Map<string, NowPlaying>();
  private starting: Promise<void> | null = null;

  /** Latest known track. */
  get value(): NowPlaying | null {
    return this.current;
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.starting ??= this.start().catch(() => undefined);
    fn(this.current);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private async start(): Promise<void> {
    const bus = dbus.sessionBus();
    this.bus = bus;
    bus.on("error", () => undefined);
    const busObj = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
    const iface = busObj.getInterface("org.freedesktop.DBus") as unknown as BusProxy;
    const names = await iface.ListNames();
    await Promise.all(names.filter((n) => n.startsWith(MPRIS_PREFIX)).map((n) => this.watch(n)));
    iface.on("NameOwnerChanged", (name, _old, owner) => {
      if (!name.startsWith(MPRIS_PREFIX)) return;
      if (owner) void this.watch(name).catch(() => undefined);
      else {
        this.states.delete(name);
        this.recompute();
      }
    });
  }

  private async watch(name: string): Promise<void> {
    if (!this.bus) return;
    const obj = await this.bus.getProxyObject(name, "/org/mpris/MediaPlayer2");
    const props = obj.getInterface("org.freedesktop.DBus.Properties") as unknown as PropsProxy;
    const read = async (): Promise<void> => {
      const all = await props.GetAll(PLAYER_IFACE);
      const meta = (all.Metadata?.value ?? {}) as Record<string, dbus.Variant>;
      const artists = meta["xesam:artist"]?.value as string[] | undefined;
      this.states.set(name, {
        title: String(meta["xesam:title"]?.value ?? ""),
        artist: artists?.join(", ") ?? "",
        player: name.slice(MPRIS_PREFIX.length).split(".")[0] ?? name,
        playing: all.PlaybackStatus?.value === "Playing",
      });
      this.recompute();
    };
    props.on("PropertiesChanged", (iface) => {
      if (iface === PLAYER_IFACE) void read().catch(() => undefined);
    });
    await read();
  }

  private recompute(): void {
    const all = [...this.states.values()].filter((s) => s.title);
    const next = all.find((s) => s.playing) ?? all[0] ?? null;
    const same =
      next?.title === this.current?.title &&
      next?.artist === this.current?.artist &&
      next?.playing === this.current?.playing;
    this.current = next;
    if (!same) for (const fn of this.listeners) fn(next);
  }

  /** Disconnect from the bus. */
  dispose(): void {
    this.bus?.disconnect();
    this.bus = null;
    this.starting = null;
    this.listeners.clear();
  }
}
