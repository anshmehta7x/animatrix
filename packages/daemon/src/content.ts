/** What the daemon shows, power gates, and the D-Bus state snapshot. */
import type { DaemonState, GateReason } from "@anshmehta7x/animatrix";
import type { Config } from "./config.js";

/** What should be on the panel when it is not gated. */
export type Content =
  | { kind: "idle" }
  | { kind: "builtins" }
  | { kind: "frame"; frame: Uint8Array }
  | { kind: "effect"; effect: string; params: Record<string, unknown>; scene: string | null };

/** A reason to keep the display off. */
export type GateKey = Exclude<GateReason, null>;

/** Gates in priority order (the first present one is reported). */
export const GATE_ORDER: readonly GateKey[] = ["sleep", "lid", "battery", "user"];

/** Content to show at startup: the configured scene, or the firmware animations. */
export function startupContent(config: Config): Content {
  const scene = config.scenes[config.startupScene];
  return scene
    ? { kind: "effect", effect: scene.effect, params: scene.params, scene: config.startupScene }
    : { kind: "builtins" };
}

/** Inputs for {@link snapshot}. */
export interface SnapshotInput {
  content: Content;
  config: Config;
  connected: boolean;
  displayOn: boolean;
  gate: GateReason;
  fps: number;
  error: string | null;
}

/** Build the `GetState` / `StateChanged` payload. */
export function snapshot(s: SnapshotInput): DaemonState {
  const c = s.content;
  return {
    connected: s.connected,
    displayOn: s.displayOn,
    gate: s.gate,
    hardwareBrightness: s.config.device.hardwareBrightness,
    softBrightness: s.config.device.softBrightness,
    content: c.kind,
    effect: c.kind === "effect" ? c.effect : null,
    params: c.kind === "effect" ? c.params : {},
    scene: c.kind === "effect" ? c.scene : null,
    builtins: s.config.builtins,
    fps: s.fps,
    error: s.error,
  };
}
