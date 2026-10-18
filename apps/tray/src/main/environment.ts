/** Desktop facts: session type, tray host presence, autostart entry. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import dbus from "dbus-next";

interface DbusProxy {
  NameHasOwner(name: string): Promise<boolean>;
}

/** `wayland`, `x11` or `unknown` from XDG_SESSION_TYPE / WAYLAND_DISPLAY. */
export function sessionType(env: NodeJS.ProcessEnv = process.env): "wayland" | "x11" | "unknown" {
  const t = env.XDG_SESSION_TYPE?.toLowerCase();
  if (t === "wayland" || env.WAYLAND_DISPLAY) return "wayland";
  if (t === "x11" || env.DISPLAY) return "x11";
  return "unknown";
}

/**
 * True if a StatusNotifierItem host exists. Electron's Linux tray is an SNI item, which stock
 * GNOME does not display without the AppIndicator extension.
 */
export async function hasTrayHost(): Promise<boolean> {
  const bus = dbus.sessionBus();
  bus.on("error", () => undefined);
  try {
    const obj = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
    const iface = obj.getInterface("org.freedesktop.DBus") as unknown as DbusProxy;
    return await iface.NameHasOwner("org.kde.StatusNotifierWatcher");
  } catch {
    return false;
  } finally {
    bus.disconnect();
  }
}

const autostartFile = (): string =>
  join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "autostart",
    "animatrix-tray.desktop",
  );

/** Whether the autostart entry exists. */
export async function isAutostartEnabled(): Promise<boolean> {
  return readFile(autostartFile(), "utf8").then(
    () => true,
    () => false,
  );
}

/** Create or remove `~/.config/autostart/animatrix-tray.desktop`. */
export async function setAutostart(on: boolean, exec: string): Promise<void> {
  const file = autostartFile();
  if (!on) return void (await rm(file, { force: true }));
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(
    file,
    [
      "[Desktop Entry]",
      "Type=Application",
      "Name=animatrix",
      "Comment=AniMe Matrix control panel",
      `Exec=${exec} --hidden`,
      "Icon=animatrix",
      "Terminal=false",
      "X-GNOME-Autostart-enabled=true",
      "",
    ].join("\n"),
  );
}
