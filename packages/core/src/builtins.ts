/**
 * Firmware built-in animations. The panel stores one bit per power state in the `C5` command
 * and plays the chosen animation by itself (research doc §2.3).
 */

/** Animation while the laptop is running (bit 0). */
export type AwakeAnimation = "binaryBannerScroll" | "rogLogoGlitch";
/** Animation while suspended (bit 1). */
export type SleepAnimation = "bannerSwipe" | "starfield";
/** Animation on shutdown (bit 2). */
export type ShutdownAnimation = "glitchOut" | "seeYa";
/** Animation on boot (bit 3). */
export type BootAnimation = "glitchConstruction" | "staticEmergence";

/** A full selection of built-in animations, one per power state. */
export interface BuiltinSelection {
  awake: AwakeAnimation;
  sleep: SleepAnimation;
  shutdown: ShutdownAnimation;
  boot: BootAnimation;
}

/** Variant names per state, index = bit value. */
export const BUILTIN_VARIANTS = {
  awake: ["binaryBannerScroll", "rogLogoGlitch"],
  sleep: ["bannerSwipe", "starfield"],
  shutdown: ["glitchOut", "seeYa"],
  boot: ["glitchConstruction", "staticEmergence"],
} as const satisfies Record<keyof BuiltinSelection, readonly [string, string]>;

/** Human-readable labels for each variant. */
export const BUILTIN_LABELS: Record<string, string> = {
  binaryBannerScroll: "ROG logo + binary banner scroll",
  rogLogoGlitch: "ROG logo glitch",
  bannerSwipe: "Banner swipe",
  starfield: "Starfield",
  glitchOut: "Glitch out",
  seeYa: "“See ya” text",
  glitchConstruction: "Glitch construction",
  staticEmergence: "ROG logo emerging from static",
};

/** G-Helper's defaults: logo glitch, starfield, see-ya, static emergence. */
export const DEFAULT_BUILTINS: BuiltinSelection = {
  awake: "rogLogoGlitch",
  sleep: "starfield",
  shutdown: "seeYa",
  boot: "staticEmergence",
};

const BIT: Record<keyof BuiltinSelection, number> = { awake: 0, sleep: 1, shutdown: 2, boot: 3 };

/** Encode a selection as the `C5` argument byte. */
export function encodeBuiltins(sel: BuiltinSelection): number {
  return (Object.keys(BIT) as (keyof BuiltinSelection)[]).reduce((byte, state) => {
    const variants: readonly string[] = BUILTIN_VARIANTS[state];
    return byte | (variants.indexOf(sel[state]) === 1 ? 1 << BIT[state] : 0);
  }, 0);
}

/** Decode a `C5` argument byte into a selection. */
export function decodeBuiltins(byte: number): BuiltinSelection {
  const pick = <K extends keyof BuiltinSelection>(state: K): BuiltinSelection[K] =>
    BUILTIN_VARIANTS[state][(byte >> BIT[state]) & 1] as BuiltinSelection[K];
  return {
    awake: pick("awake"),
    sleep: pick("sleep"),
    shutdown: pick("shutdown"),
    boot: pick("boot"),
  };
}

/** Type guard for a partial selection coming from user input. */
export function isBuiltinVariant(state: keyof BuiltinSelection, value: unknown): boolean {
  return (BUILTIN_VARIANTS[state] as readonly unknown[]).includes(value);
}
