/** Parameter validation and shared parameter groups. */
import { InvalidArgumentError } from "@anshmehta7x/animatrix-core";
import type { ParamSchema, ParamSpec, ParamValues } from "./types.js";

function coerce(key: string, spec: ParamSpec, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return spec.default;
  switch (spec.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw new InvalidArgumentError(`${key}: not a number`);
      return Math.min(spec.max, Math.max(spec.min, n));
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "1" || value === 1) return true;
      if (value === "false" || value === "0" || value === 0) return false;
      throw new InvalidArgumentError(`${key}: not a boolean`);
    case "select":
      if (!spec.options.some((o) => o.value === value)) {
        const allowed = spec.options.map((o) => o.value).join(", ");
        throw new InvalidArgumentError(`${key}: must be one of ${allowed}`);
      }
      return value;
    case "string":
    case "file":
      if (typeof value !== "string") throw new InvalidArgumentError(`${key}: not a string`);
      return value;
  }
}

/**
 * Fill defaults, clamp numbers, coerce strings ("true", "12") and reject unknown keys or bad
 * values.
 *
 * @throws {@link InvalidArgumentError}
 */
export function resolveParams(schema: ParamSchema, input: ParamValues = {}): ParamValues {
  const unknown = Object.keys(input).filter((k) => !(k in schema));
  if (unknown.length > 0) {
    throw new InvalidArgumentError(`unknown parameter(s): ${unknown.join(", ")}`);
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, spec]) => [key, coerce(key, spec, input[key])]),
  );
}

/** Typed accessors for resolved params. */
export const num = (p: ParamValues, k: string): number => p[k] as number;
export const bool = (p: ParamValues, k: string): boolean => p[k] as boolean;
export const str = (p: ParamValues, k: string): string => p[k] as string;

const opts = (pairs: [string, string][]): { value: string; label: string }[] =>
  pairs.map(([value, label]) => ({ value, label }));

/** `mapping` param: planar or diagonal. */
export const MAPPING_PARAM: ParamSchema = {
  mapping: {
    type: "select",
    label: "Mapping",
    options: opts([
      ["planar", "Planar"],
      ["diagonal", "Diagonal 45°"],
    ]),
    default: "planar",
  },
};

/** Tone params shared by media effects. */
export const TONE_PARAMS: ParamSchema = {
  brightness: { type: "number", label: "Brightness", min: 0, max: 3, step: 0.05, default: 1 },
  contrast: { type: "number", label: "Contrast", min: 0, max: 3, step: 0.05, default: 1 },
  gamma: { type: "number", label: "Gamma", min: 0.2, max: 4, step: 0.05, default: 1 },
  invert: { type: "boolean", label: "Invert", default: false },
  threshold: {
    type: "number",
    label: "Threshold (0 = off)",
    min: 0,
    max: 255,
    step: 1,
    default: 0,
  },
  dither: {
    type: "select",
    label: "Dither",
    options: opts([
      ["none", "None"],
      ["ordered", "Ordered"],
      ["floyd-steinberg", "Floyd–Steinberg"],
    ]),
    default: "none",
  },
  levels: { type: "number", label: "Dither levels", min: 2, max: 16, step: 1, default: 2 },
};

/** Placement params shared by media effects. */
export const PLACEMENT_PARAMS: ParamSchema = {
  fit: {
    type: "select",
    label: "Fit",
    options: opts([
      ["contain", "Fit"],
      ["cover", "Fill"],
      ["stretch", "Stretch"],
    ]),
    default: "contain",
  },
  scale: { type: "number", label: "Scale", min: 0.1, max: 8, step: 0.05, default: 1 },
  rotate: { type: "number", label: "Rotate", min: -180, max: 180, step: 1, unit: "°", default: 0 },
  panX: { type: "number", label: "Pan X", min: -1, max: 1, step: 0.01, default: 0 },
  panY: { type: "number", label: "Pan Y", min: -1, max: 1, step: 0.01, default: 0 },
};

/** Font choice shared by text effects. */
export const FONT_PARAMS: ParamSchema = {
  font: {
    type: "select",
    label: "Font",
    options: opts([
      ["5x7", "Pixel 5×7"],
      ["3x5", "Pixel 3×5"],
      ["sans", "Sans"],
      ["serif", "Serif"],
      ["monospace", "Mono"],
      ["custom", "Custom…"],
    ]),
    default: "5x7",
  },
  customFont: { type: "string", label: "Custom font family", default: "", placeholder: "Inter" },
  size: { type: "number", label: "Size", min: 5, max: 40, step: 1, unit: "px", default: 7 },
};
