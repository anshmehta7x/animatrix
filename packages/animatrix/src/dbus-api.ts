/**
 * The stable D-Bus contract between animatrixd and its clients (tray, CLI, other languages).
 * See docs/dbus-api.md. Complex values travel as JSON strings so that any language (or busctl)
 * can use them without custom D-Bus type marshalling.
 */
import type {
  BuiltinSelection,
  HardwareBrightness,
  MappingMode,
} from "@anshmehta7x/animatrix-core";

/** Well-known bus name on the session bus. */
export const BUS_NAME = "dev.animatrix.Matrix1";
/** Object path. */
export const OBJECT_PATH = "/dev/animatrix/Matrix1";
/** Interface name. */
export const INTERFACE = "dev.animatrix.Matrix1";
/** Prefix of D-Bus error names; the suffix is an {@link AnimatrixErrorCode}. */
export const ERROR_PREFIX = "dev.animatrix.Error.";

/** `GetInfo()` result. */
export interface DaemonInfo {
  version: string;
  model: string;
  modelName: string;
  tested: boolean;
  leds: number;
  slots: number;
  transport: string;
  maxFps: number;
  canvas: {
    planar: { width: number; height: number };
    diagonal: { width: number; height: number };
  };
}

/** What the panel is currently doing. */
export type ContentKind = "idle" | "effect" | "frame" | "builtins";

/** Why the display is gated off by power policy, if it is. */
export type GateReason = "battery" | "lid" | "sleep" | "user" | null;

/** `GetState()` result and `StateChanged` payload. */
export interface DaemonState {
  connected: boolean;
  displayOn: boolean;
  gate: GateReason;
  hardwareBrightness: HardwareBrightness;
  softBrightness: number;
  content: ContentKind;
  effect: string | null;
  params: Record<string, unknown>;
  scene: string | null;
  builtins: BuiltinSelection;
  fps: number;
  error: string | null;
}

/** Option shared by canvas-sending calls. */
export interface CanvasMessage {
  width: number;
  height: number;
  mode: MappingMode;
}
