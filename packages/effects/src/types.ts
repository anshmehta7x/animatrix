/** The effect plugin contract. One effect = one file exporting an {@link Effect}. */
import type { Canvas, MappingMode, ModelProfile, Rect } from "@anshmehta7x/animatrix-core";
import type { Services } from "./services/index.js";

/** A numeric slider. */
export interface NumberParam {
  type: "number";
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  default: number;
}

/** A toggle. */
export interface BooleanParam {
  type: "boolean";
  label: string;
  default: boolean;
}

/** A dropdown / segmented choice. */
export interface SelectParam {
  type: "select";
  label: string;
  options: readonly { value: string; label: string }[];
  default: string;
}

/** Free text. */
export interface StringParam {
  type: "string";
  label: string;
  default: string;
  placeholder?: string;
}

/** A local file path (the UI shows a picker / drop target). */
export interface FileParam {
  type: "file";
  label: string;
  /** File extensions without dots, e.g. `["png", "gif"]`. */
  accept: readonly string[];
  default: string;
}

/** Show a parameter only when other parameters have these values (UI hint, not validation). */
export interface VisibleWhen {
  visibleWhen?: Readonly<Record<string, string | number | boolean>>;
}

/** One parameter's schema. The UI renders settings from these. */
export type ParamSpec = (NumberParam | BooleanParam | SelectParam | StringParam | FileParam) &
  VisibleWhen;

/** An effect's parameter schema, keyed by parameter name. Order is display order. */
export type ParamSchema = Readonly<Record<string, ParamSpec>>;

/** Concrete parameter values. */
export type ParamValues = Record<string, unknown>;

/** Effect categories, used to group effects in the UI. */
export type EffectCategory = "media" | "text" | "clock" | "visualiser" | "generative" | "system";

/** Everything an effect instance may use. */
export interface EffectContext {
  /** Canvas width/height the effect will be handed every frame. */
  readonly width: number;
  readonly height: number;
  /** Active mapping. */
  readonly mode: MappingMode;
  /**
   * Largest rectangle of the canvas that is fully visible on the panel (the panel has a cut
   * corner). Lay out text and meters inside it.
   */
  readonly safe: Rect;
  /** Per-pixel visibility mask (1 = reaches an LED), `width * height`. */
  readonly visible: Uint8Array;
  /** The panel profile. */
  readonly profile: ModelProfile;
  /** Shared, lazily started data sources (audio, now-playing, system stats). */
  readonly services: Services;
}

/** Optional feedback from {@link EffectInstance.render}. */
export interface RenderResult {
  /** `false` means "canvas unchanged, don't send". Default true. */
  changed?: boolean;
  /** Override the delay in ms until the next render (e.g. GIF per-frame delays). */
  delay?: number;
  /** `true` means the effect is finished (non-looping media); the runner stops after this frame. */
  done?: boolean;
}

/** A running effect. */
export interface EffectInstance {
  /**
   * Draw one frame. `t` is milliseconds since the effect started. The same canvas is passed every
   * time (not cleared), so trail effects can fade it.
   */
  render(t: number, canvas: Canvas): RenderResult | void;
  /**
   * Apply new (validated) params without recreating the instance, e.g. to pan an image while
   * dragging. Return false if the change needs a restart (say, a different file).
   */
  update?(params: ParamValues): boolean;
  /** Release resources (child processes, subscriptions). */
  dispose?(): void | Promise<void>;
}

/** An effect plugin. */
export interface Effect {
  /** Stable id, kebab-case. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: EffectCategory;
  /** Parameter schema; validated values are passed to {@link create}. */
  readonly params: ParamSchema;
  /** Preferred frames per second; 0 = static (render once, then idle). */
  readonly fps: number;
  /** Default mapping if the params have no `mapping` value. */
  readonly mapping?: MappingMode;
  /** Build an instance. May be async (e.g. to decode media). */
  create(params: ParamValues, ctx: EffectContext): EffectInstance | Promise<EffectInstance>;
}

/** Serializable effect description (for D-Bus `ListEffects` and the UI). */
export interface EffectDescriptor {
  id: string;
  name: string;
  description: string;
  category: EffectCategory;
  fps: number;
  params: ParamSchema;
}
