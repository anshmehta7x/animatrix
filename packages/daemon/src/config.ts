/**
 * Daemon configuration: a TOML file at `$XDG_CONFIG_HOME/animatrix/config.toml`. Unknown keys are
 * dropped, missing keys get defaults, and bad values fall back to defaults (with a warning).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";
import {
  DEFAULT_BUILTINS,
  isBuiltinVariant,
  type BuiltinSelection,
  type HardwareBrightness,
} from "@anshmehta7x/animatrix-core";

/** A saved scene: an effect plus its parameters. */
export interface Scene {
  effect: string;
  params: Record<string, unknown>;
}

/** What happens to the panel on suspend / shutdown. */
export type PowerAction = "off" | "builtins" | "scene" | "keep";

export interface Config {
  device: {
    /** Force a profile id; empty = DMI detection. */
    model: string;
    hardwareBrightness: HardwareBrightness;
    /** Software brightness on top of hardware, 0..1. */
    softBrightness: number;
    /** Software gamma, 0.2..4. */
    gamma: number;
    /** Global fps cap (never above the profile's measured ceiling). */
    maxFps: number;
  };
  power: {
    offOnBattery: boolean;
    offOnLidClose: boolean;
    onSuspend: PowerAction;
    onShutdown: PowerAction;
    /** Scene streamed before suspend when `onSuspend = "scene"`. */
    sleepScene: string;
    /** Scene streamed before shutdown when `onShutdown = "scene"`. */
    shutdownScene: string;
  };
  builtins: BuiltinSelection;
  /** Scene applied when the daemon starts. */
  startupScene: string;
  scenes: Record<string, Scene>;
  playlist: { enabled: boolean; scenes: string[]; intervalSec: number };
  schedule: { enabled: boolean; dimFrom: string; dimTo: string; dimBrightness: number };
  notifications: { flash: boolean; showText: boolean };
  ui: { closeOnBlur: boolean; trayHintShown: boolean; autostart: boolean };
}

/** A first-run setup that looks good: a clock by day, gentle defaults. */
export function defaultConfig(): Config {
  return {
    device: { model: "", hardwareBrightness: 2, softBrightness: 1, gamma: 1, maxFps: 30 },
    power: {
      offOnBattery: false,
      offOnLidClose: false,
      onSuspend: "builtins",
      onShutdown: "builtins",
      sleepScene: "",
      shutdownScene: "",
    },
    builtins: { ...DEFAULT_BUILTINS },
    startupScene: "Clock",
    scenes: {
      Clock: { effect: "clock", params: { face: "date", seconds: false } },
      "Matrix rain": { effect: "matrix-rain", params: {} },
      Visualiser: { effect: "visualiser", params: { style: "bars", bands: 17 } },
      Starfield: { effect: "starfield", params: {} },
      Breathe: { effect: "breathe", params: { shape: "radial" } },
      "Now playing": { effect: "now-playing", params: {} },
      Stats: { effect: "stats", params: {} },
    },
    playlist: { enabled: false, scenes: ["Clock", "Matrix rain", "Starfield"], intervalSec: 300 },
    schedule: { enabled: false, dimFrom: "22:00", dimTo: "07:00", dimBrightness: 0.3 },
    notifications: { flash: false, showText: false },
    ui: { closeOnBlur: false, trayHintShown: false, autostart: false },
  };
}

/** Path of the config file. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "animatrix", "config.toml");
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Merge `input` over `base`, keeping only keys and value types present in `base`. */
function mergeTyped<T>(base: T, input: unknown, path: string, warn: (m: string) => void): T {
  if (!isObj(base) || !isObj(input)) return base;
  const out: Json = { ...base };
  for (const [k, def] of Object.entries(base)) {
    const v = input[k];
    if (v === undefined) continue;
    if (isObj(def)) out[k] = mergeTyped(def, v, `${path}${k}.`, warn);
    else if (Array.isArray(def))
      out[k] = Array.isArray(v) ? v.filter((x) => typeof x === "string") : def;
    else if (typeof v === typeof def) out[k] = v;
    else warn(`config: ${path}${k} has the wrong type, using default`);
  }
  return out as T;
}

/** Validate and normalise a parsed config object. */
export function normaliseConfig(
  input: unknown,
  warn: (m: string) => void = () => undefined,
): Config {
  const base = defaultConfig();
  const merged = mergeTyped({ ...base, scenes: {} }, input, "", warn);
  const rawScenes = isObj(input) && isObj(input.scenes) ? input.scenes : base.scenes;
  merged.scenes = Object.fromEntries(
    Object.entries(rawScenes)
      .filter(([, s]) => isObj(s) && typeof s.effect === "string")
      .map(([name, s]) => {
        const scene = s as Json;
        return [
          name,
          { effect: String(scene.effect), params: isObj(scene.params) ? scene.params : {} },
        ];
      }),
  );
  const d = merged.device;
  d.hardwareBrightness = (
    [0, 1, 2, 3].includes(d.hardwareBrightness) ? d.hardwareBrightness : 2
  ) as HardwareBrightness;
  d.softBrightness = Math.min(1, Math.max(0, d.softBrightness));
  d.gamma = Math.min(4, Math.max(0.2, d.gamma));
  d.maxFps = Math.min(60, Math.max(1, d.maxFps));
  for (const state of ["awake", "sleep", "shutdown", "boot"] as const) {
    if (!isBuiltinVariant(state, merged.builtins[state])) {
      warn(`config: builtins.${state} is invalid, using default`);
      merged.builtins = { ...merged.builtins, [state]: DEFAULT_BUILTINS[state] };
    }
  }
  const actions = ["off", "builtins", "scene", "keep"];
  if (!actions.includes(merged.power.onSuspend)) merged.power.onSuspend = "builtins";
  if (!actions.includes(merged.power.onShutdown)) merged.power.onShutdown = "builtins";
  merged.playlist.intervalSec = Math.max(5, merged.playlist.intervalSec);
  return merged;
}

/** Load config, creating it with defaults on first run. */
export async function loadConfig(
  path = configPath(),
  warn: (m: string) => void = () => undefined,
): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    const fresh = defaultConfig();
    await saveConfig(fresh, path);
    return fresh;
  }
  try {
    return normaliseConfig(parse(text), warn);
  } catch (err) {
    warn(
      `config: ${path} is not valid TOML (${String(err)}); using defaults without overwriting it`,
    );
    return defaultConfig();
  }
}

/** Save config atomically (write temp file, rename). */
export async function saveConfig(cfg: Config, path = configPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const header =
    "# animatrix configuration. Edited by animatrixd and the tray app; comments are not kept.\n\n";
  await writeFile(tmp, header + stringify(cfg as unknown as Json), "utf8");
  await rename(tmp, path);
}

/** Apply a JSON patch (deep merge) and re-normalise. */
export function patchConfig(cfg: Config, patch: unknown): Config {
  const deep = (a: unknown, b: unknown): unknown => {
    if (!isObj(a) || !isObj(b)) return b;
    const out: Json = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k === "scenes" ? v : deep(a[k], v);
    return out;
  };
  return normaliseConfig(deep(cfg, patch));
}
