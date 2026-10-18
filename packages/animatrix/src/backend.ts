/** The two ways {@link Matrix} can reach the panel. */
import type { Effect } from "@anshmehta7x/animatrix-effects";
import type {
  BuiltinSelection,
  HardwareBrightness,
  ModelProfile,
} from "@anshmehta7x/animatrix-core";

/** Common operations implemented by the direct and daemon backends. */
export interface Backend {
  readonly via: "direct" | "daemon";
  readonly profile: ModelProfile;
  setHardwareBrightness(level: HardwareBrightness): Promise<void>;
  setDisplay(on: boolean): Promise<void>;
  setBuiltins(sel: Partial<BuiltinSelection>, enable: boolean): Promise<void>;
  showFrame(frame: Uint8Array): Promise<void>;
  showTestPattern(): Promise<void>;
  play(effect: string, params: Record<string, unknown>): Promise<void>;
  /** Run an effect object in this process (custom effects). */
  runEffect(effect: Effect, params: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
  /** Resolves when the current locally run effect ends or is stopped. */
  wait(): Promise<void>;
  close(): Promise<void>;
}
