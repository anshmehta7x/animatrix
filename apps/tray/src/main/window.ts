/**
 * The compact panel: 400×600, frameless, fixed size, translucent where the compositor allows.
 * Wayland apps cannot place their own windows, so the compositor decides where it opens (GNOME
 * centres it). On X11 it is placed near the tray icon.
 */
import { join } from "node:path";
import { BrowserWindow, nativeTheme, screen, type Rectangle } from "electron";

/** Panel size. The window is opaque and exactly this size. */
export const PANEL = { width: 400, height: 600 };

/** Window background matching the renderer's theme, so there is no flash on show. */
export const panelBackground = (): string =>
  nativeTheme.shouldUseDarkColors ? "#000000" : "#ffffff";

export function createPanel(
  preload: string,
  rendererUrl: string | null,
  rendererFile: string,
): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL.width,
    height: PANEL.height,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "animatrix",
    backgroundColor: panelBackground(),
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenu(null);
  if (rendererUrl) void win.loadURL(rendererUrl);
  else void win.loadFile(rendererFile);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

/** On X11, put the panel under/above the tray icon, clamped to the work area. */
export function placeNear(win: BrowserWindow, anchor: Rectangle | null): void {
  const [w, h] = win.getSize() as [number, number];
  const point = anchor
    ? { x: anchor.x + anchor.width / 2, y: anchor.y }
    : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  const below = point.y < area.y + area.height / 2;
  const x = Math.round(Math.min(Math.max(point.x - w / 2, area.x), area.x + area.width - w));
  const y = below ? area.y : area.y + area.height - h;
  win.setPosition(x, Math.round(y));
}

export const rendererPath = (dir: string): string =>
  join(dir, "..", "dist", "renderer", "index.html");
