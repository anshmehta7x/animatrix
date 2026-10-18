import { UnsupportedModelError } from "../errors.js";
import type { ModelProfile } from "../profile.js";
import { GA401 } from "./ga401.js";
import { GA402 } from "./ga402.js";
import { GU604 } from "./gu604.js";

export { GA401, GA402, GU604 };

/** All shipped profiles. */
export const PROFILES: readonly ModelProfile[] = [GA402, GA401, GU604];

/**
 * Models that share USB ID 0b05:193b (or 0b05:19b6) but carry Slash Lighting instead of a dot
 * matrix. Driving them with AniMe frames is wrong, so they are refused (research doc §2.1).
 */
export const SLASH_MODELS: readonly string[] = [
  "GA403",
  "GU605",
  "GA605",
  "GA405",
  "GU405",
  "GU606",
  "GX651",
  "G614F",
];

/** Look up a profile by id (case-insensitive). Returns null when unknown. */
export function profileById(id: string): ModelProfile | null {
  const want = id.toUpperCase();
  return PROFILES.find((p) => p.id === want) ?? null;
}

/**
 * Pick the profile for a DMI model string (`/sys/class/dmi/id/product_name` or `board_name`).
 *
 * @throws {@link UnsupportedModelError} for Slash laptops and unknown models.
 */
export function detectProfile(dmi: string): ModelProfile {
  const upper = dmi.toUpperCase();
  const slash = SLASH_MODELS.find((m) => upper.includes(m));
  if (slash) {
    throw new UnsupportedModelError(dmi, `${slash} has Slash Lighting, not an AniMe Matrix`);
  }
  const hit = PROFILES.find((p) => p.dmiMatch.some((m) => upper.includes(m)));
  if (!hit) {
    throw new UnsupportedModelError(
      dmi,
      "no AniMe Matrix profile matches; force one with the `model` option if you are sure",
    );
  }
  return hit;
}
