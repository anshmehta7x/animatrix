/**
 * animatrix tray app (Electron main). Talks only to animatrixd over D-Bus; never loads native
 * device modules. Works without a tray: the panel opens on launch when no StatusNotifier host
 * exists, and `animatrix-tray --toggle` (second instance) toggles it, e.g. from a GNOME shortcut.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  dialog,
  globalShortcut,
  ipcMain,
  shell,
  type BrowserWindow,
  type Tray,
} from "electron";
import { DaemonLink } from "./daemon.js";
import {
  hasTrayHost,
  isAutostartEnabled,
  sessionType,
  setAutostart,
  watchTrayHost,
} from "./environment.js";
import { createTray } from "./tray.js";
import { createPanel, placeNear, rendererPath } from "./window.js";
import {
  IPC,
  type BridgeMethods,
  type EnvInfo,
  type Result,
  type Snapshot,
} from "../shared/ipc.js";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets");
const SHORTCUT = "Super+Alt+M";

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const link = new DaemonLink();
let panel: BrowserWindow | null = null;
let tray: Tray | null = null;
let env: EnvInfo = {
  session: sessionType(),
  trayHost: false,
  showTrayHint: false,
  autostart: false,
  desktop: process.env.XDG_CURRENT_DESKTOP ?? "",
};
let quitting = false;

function snapshot(): Snapshot {
  return {
    daemon: Boolean(link.client),
    daemonError: link.error,
    info: link.info,
    state: link.state,
    effects: link.effects,
    config: link.config,
    env,
  };
}

function togglePanel(force?: boolean): void {
  if (!panel) return;
  const show = force ?? !panel.isVisible();
  if (!show) {
    panel.hide();
    return;
  }
  if (env.session === "x11") placeNear(panel, tray?.getBounds() ?? null);
  panel.show();
  panel.focus();
}

function errorOf(err: unknown): { code: string; message: string; hint: string | null } {
  const e = err as { code?: string; message?: string; hint?: string | null };
  return { code: e.code ?? "ERROR", message: e.message ?? String(err), hint: e.hint ?? null };
}

const handlers: {
  [K in keyof BridgeMethods]: (...args: BridgeMethods[K]) => Promise<unknown> | unknown;
} = {
  snapshot: () => snapshot(),
  play: (effect, params) => link.need().play(effect, params),
  stop: () => link.need().stop(),
  setBrightness: (level) => link.need().setHardwareBrightness(level as 0 | 1 | 2 | 3),
  setSoftBrightness: (v) => link.need().setSoftBrightness(v),
  setDisplay: (on) => link.need().setDisplay(on),
  setBuiltins: (sel, enable) => link.need().setBuiltins(sel, enable),
  applyScene: (n) => link.need().applyScene(n),
  saveScene: async (n) => {
    await link.need().saveScene(n);
    await link.refresh();
  },
  deleteScene: async (n) => {
    await link.need().deleteScene(n);
    await link.refresh();
  },
  updateConfig: async (patch) => {
    await link.need().updateConfig(patch);
    await link.refresh();
  },
  showTestPattern: () => link.need().showTestPattern(),
  startDaemon: () =>
    new Promise<void>((resolve, reject) => {
      const p = spawn("systemctl", ["--user", "start", "animatrixd"], { stdio: "ignore" });
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                "systemctl --user start animatrixd failed. Is the user unit installed? Run make install.",
              ),
            ),
      );
    }),
  watchPreview: (on) => link.setPreview(on),
  frame: () => link.need().frame(),
  pickFile: async (accept) => {
    const res = await dialog.showOpenDialog(panel!, {
      properties: ["openFile"],
      filters: [{ name: "Media", extensions: accept }],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  },
  setAutostart: async (on) => {
    const exec = process.env.ANIMATRIX_TRAY_BIN ?? `"${process.execPath}" "${app.getAppPath()}"`;
    await setAutostart(on, exec);
    env = { ...env, autostart: on };
    panel?.webContents.send(IPC.snapshot, snapshot());
  },
  dismissTrayHint: async () => {
    env = { ...env, showTrayHint: false };
    await link.client?.updateConfig({ ui: { trayHintShown: true } });
  },
  openConfigFile: () =>
    shell.openPath(
      join(
        process.env.XDG_CONFIG_HOME || join(app.getPath("home"), ".config"),
        "animatrix",
        "config.toml",
      ),
    ),
  hidePanel: () => togglePanel(false),
  quit: () => {
    quitting = true;
    app.quit();
  },
};

async function boot(): Promise<void> {
  ipcMain.handle(
    IPC.invoke,
    async (_e, method: keyof BridgeMethods, ...args: unknown[]): Promise<Result<unknown>> => {
      try {
        const fn = handlers[method] as (...a: unknown[]) => unknown;
        if (!fn) throw new Error(`unknown method ${String(method)}`);
        return { ok: true, value: await fn(...args) };
      } catch (err) {
        return { ok: false, error: errorOf(err) };
      }
    },
  );

  const [trayHost, autostart] = await Promise.all([hasTrayHost(), isAutostartEnabled()]);
  env = { ...env, trayHost, autostart };
  await link.start().catch((e: unknown) => (link.error = String(e)));
  env = { ...env, showTrayHint: !trayHost && !link.config?.ui.trayHintShown };

  panel = createPanel(
    join(here, "preload.cjs"),
    process.env.ANIMATRIX_DEV_URL ?? null,
    rendererPath(here),
  );
  panel.on("blur", () => {
    if (link.config?.ui.closeOnBlur !== false && !panel?.webContents.isDevToolsOpened())
      togglePanel(false);
  });
  panel.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      togglePanel(false);
    }
  });
  panel.on("show", () => link.setPreview(true));
  panel.on("hide", () => link.setPreview(false));

  const send = (): void => panel?.webContents.send(IPC.snapshot, snapshot());
  link.on("changed", send);
  link.on("state", (s) => panel?.webContents.send(IPC.state, s));
  link.on("preview", (f) => panel?.isVisible() && panel.webContents.send(IPC.preview, f));

  // Always create the tray (harmless without a host) and recreate it when a StatusNotifier
  // host appears later, e.g. when the AppIndicator extension loads after us at login.
  const makeTray = (): void => {
    tray?.destroy();
    tray = createTray(join(assets, "tray.png"), link, {
      togglePanel: () => togglePanel(),
      quit: () => handlers.quit(),
      run: (fn) => void fn().catch(() => undefined),
    });
  };
  makeTray();
  void watchTrayHost((present) => {
    env = { ...env, trayHost: present, showTrayHint: !present && !link.config?.ui.trayHintShown };
    if (present) makeTray();
    send();
  });
  try {
    globalShortcut.register(SHORTCUT, () => togglePanel());
  } catch {
    // Not available on this compositor; the --toggle flag covers it.
  }
  // --hidden (autostart) never pops the panel up; a manual launch always shows it.
  if (!process.argv.includes("--hidden")) panel.once("ready-to-show", () => togglePanel(true));

  // Development aid: ANIMATRIX_SCREENSHOT=/path.png captures the panel and exits.
  const shot = process.env.ANIMATRIX_SCREENSHOT;
  if (shot) {
    const page = process.env.ANIMATRIX_SCREENSHOT_PAGE;
    panel.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        if (page) {
          await panel!.webContents.executeJavaScript(
            `[...document.querySelectorAll("nav button")].find(b => b.textContent === ${JSON.stringify(page)})?.click()`,
          );
          await new Promise((r) => setTimeout(r, 600));
        }
        const img = await panel!.webContents.capturePage();
        const { writeFile } = await import("node:fs/promises");
        await writeFile(shot, img.toPNG());
        handlers.quit();
      }, 2500);
    });
  }
}

app.on("second-instance", (_e, argv) => togglePanel(argv.includes("--hide") ? false : undefined));
app.on("window-all-closed", () => undefined);
app.on("before-quit", () => {
  quitting = true;
  link.stop();
});
app.whenReady().then(boot, (err: unknown) => {
  console.error(err);
  app.quit();
});
