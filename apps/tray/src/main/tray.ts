/** Tray icon (StatusNotifierItem on Linux) with a quick menu. */
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { DaemonLink } from "./daemon.js";

export interface TrayActions {
  togglePanel(): void;
  quit(): void;
  run(fn: () => Promise<unknown>): void;
}

const LEVELS: [string, number][] = [
  ["Off", 0],
  ["Low", 1],
  ["Medium", 2],
  ["High", 3],
];

export function createTray(iconPath: string, link: DaemonLink, a: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("animatrix");
  const rebuild = (): void => {
    // main.ts recreates the tray when a StatusNotifier host reappears; drop the old one's hooks.
    if (tray.isDestroyed()) {
      link.off("changed", rebuild);
      link.off("state", rebuild);
      return;
    }
    const s = link.state;
    const c = link.client;
    const scenes = Object.keys(link.config?.scenes ?? {});
    const items: MenuItemConstructorOptions[] = [
      { label: "Open panel", click: () => a.togglePanel() },
      { type: "separator" },
      {
        label: "Display on",
        type: "checkbox",
        enabled: Boolean(c),
        checked: Boolean(s && s.gate !== "user"),
        click: (item) => a.run(() => link.need().setDisplay(item.checked)),
      },
      {
        label: "Brightness",
        enabled: Boolean(c),
        submenu: LEVELS.map(([label, level]) => ({
          label,
          type: "radio" as const,
          checked: s?.hardwareBrightness === level,
          click: () => a.run(() => link.need().setHardwareBrightness(level as 0 | 1 | 2 | 3)),
        })),
      },
      {
        label: "Scene",
        enabled: Boolean(c) && scenes.length > 0,
        submenu: scenes.map((name) => ({
          label: name,
          type: "radio" as const,
          checked: s?.scene === name,
          click: () => a.run(() => link.need().applyScene(name)),
        })),
      },
      { type: "separator" },
      { label: c ? "animatrixd connected" : "animatrixd not running", enabled: false },
      { label: "Quit", click: () => a.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(items));
  };
  rebuild();
  link.on("changed", rebuild);
  link.on("state", rebuild);
  tray.on("click", () => a.togglePanel());
  return tray;
}
