import { rowsFrom, type ModelProfile } from "../profile.js";

// Row table: asusctl's GU604 formulas (rog-anime image.rs), 62 rows, 1711 LEDs (matches G-Helper's
// LedCount). G-Helper's own GU604 row formulas (92 rows) do not sum consistently, so asusctl's are
// used. The AC-RS diagonal table packs 1724 instead — an open question (research doc §9).
const FIRST = Array.from({ length: 62 }, (_, y) => (y <= 9 ? 0 : Math.floor((y - 9) / 2)));
const COUNT = FIRST.map((f, y) => (y <= 9 ? 38 + (y % 2) : 38 - f + (y % 2)));

/** ROG Zephyrus G16 2023 (GU604V*). UNTESTED: from the research doc only. */
export const GU604: ModelProfile = {
  id: "GU604",
  name: "Zephyrus G16 (2023)",
  tested: false,
  dmiMatch: ["GU604V"],
  rows: rowsFrom(FIRST, COUNT),
  ledStart: 0,
  oddRowShift: -0.5,
  pitchCm: { x: 0.78, y: 0.28 },
  pane: { length: 627, count: 3 },
  canvas: { width: 78, height: 45 },
  orientation: { flipX: false, flipY: false },
  maxValue: 255,
  maxFps: 30,
  notes: "Untested. LED count 1711 vs 1724 unresolved.",
};
