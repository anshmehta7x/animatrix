/** Types shared by the Electron main process, the preload bridge and the renderer. */
import type { DaemonInfo, DaemonState } from "@anshmehta7x/animatrix/client";
import type { BuiltinSelection } from "@anshmehta7x/animatrix-core";

/** Effect descriptor as returned by the daemon's ListEffects (kept structural here). */
export interface ParamSpecLite {
  type: "number" | "boolean" | "select" | "string" | "file";
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  accept?: string[];
  placeholder?: string;
  visibleWhen?: Record<string, string | number | boolean>;
}

export interface EffectInfo {
  id: string;
  name: string;
  description: string;
  category: "media" | "text" | "clock" | "visualiser" | "generative" | "system";
  fps: number;
  params: Record<string, ParamSpecLite>;
}

/** Desktop environment facts the UI adapts to. */
export interface EnvInfo {
  session: "wayland" | "x11" | "unknown";
  /** Whether a StatusNotifierItem host (tray) is present. */
  trayHost: boolean;
  /** Show the one-time "install the AppIndicator extension" hint. */
  showTrayHint: boolean;
  autostart: boolean;
  desktop: string;
}

/** Daemon config as the UI sees it (structural subset of the daemon's Config). */
export interface UiConfig {
  device: {
    hardwareBrightness: number;
    softBrightness: number;
    gamma: number;
    maxFps: number;
    model: string;
  };
  power: {
    offOnBattery: boolean;
    offOnLidClose: boolean;
    onSuspend: string;
    onShutdown: string;
    sleepScene: string;
    shutdownScene: string;
  };
  builtins: BuiltinSelection;
  startupScene: string;
  scenes: Record<string, { effect: string; params: Record<string, unknown> }>;
  playlist: { enabled: boolean; scenes: string[]; intervalSec: number };
  schedule: { enabled: boolean; dimFrom: string; dimTo: string; dimBrightness: number };
  notifications: { flash: boolean; showText: boolean };
  ui: { closeOnBlur: boolean; trayHintShown: boolean; autostart: boolean };
}

/** Everything the panel needs to render. `daemon: false` means animatrixd is unreachable. */
export interface Snapshot {
  daemon: boolean;
  daemonError: string | null;
  info: DaemonInfo | null;
  state: DaemonState | null;
  effects: EffectInfo[];
  config: UiConfig | null;
  env: EnvInfo;
}

/** Result envelope used over IPC so errors keep their code and hint. */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; hint: string | null } };

/** Methods the renderer may invoke (name → argument tuple). */
export interface BridgeMethods {
  snapshot: [];
  play: [effect: string, params: Record<string, unknown>];
  stop: [];
  setBrightness: [level: number];
  setSoftBrightness: [value: number];
  setDisplay: [on: boolean];
  setBuiltins: [sel: Partial<BuiltinSelection>, enable: boolean];
  applyScene: [name: string];
  saveScene: [name: string];
  deleteScene: [name: string];
  updateConfig: [patch: Record<string, unknown>];
  showTestPattern: [];
  startDaemon: [];
  watchPreview: [on: boolean];
  frame: [];
  pickFile: [accept: string[]];
  setAutostart: [on: boolean];
  dismissTrayHint: [];
  openConfigFile: [];
  hidePanel: [];
  quit: [];
}

/** The API exposed on `window.animatrix` by the preload script. */
export interface BridgeApi {
  invoke<K extends keyof BridgeMethods>(method: K, ...args: BridgeMethods[K]): Promise<unknown>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  onState(fn: (s: DaemonState) => void): () => void;
  onPreview(fn: (frame: Uint8Array) => void): () => void;
  /** Absolute path of a dropped file. */
  pathForFile(file: File): string;
}

export const IPC = {
  invoke: "animatrix:invoke",
  snapshot: "animatrix:snapshot",
  state: "animatrix:state",
  preview: "animatrix:preview",
} as const;
