import { rowsFrom, type ModelProfile } from "../profile.js";

// Row table: G-Helper's GA402 formulas (firstX = ceil(max(0, y-11)/2), width 34), computed in
// the research notes (g-helper-geometry-computed.txt). Total 1449 LEDs, matching ASUS's figure.
const FIRST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
  11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22,
  23, 23, 24, 24, 25,
];

/** ROG Zephyrus G14 2022/2023 (GA402R*, GA402X*, GA402N*). Verified on a GA402XU. */
export const GA402: ModelProfile = {
  id: "GA402",
  name: "Zephyrus G14 (2022–2023)",
  tested: true,
  dmiMatch: ["GA402R", "GA402X", "GA402N"],
  rows: rowsFrom(
    FIRST,
    FIRST.map((f) => 34 - f),
  ),
  ledStart: 0,
  oddRowShift: 0.5,
  // asusctl's measured pitch (27.4 / 35.5 and 17.3 / 61 cm).
  pitchCm: { x: 0.77, y: 0.283 },
  // AC-RS / Armoury Crate pane layout: 3 × 627, headers 0x0001 / 0x0274 / 0x04E7.
  pane: { length: 627, count: 3 },
  canvas: { width: 68, height: 44 },
  // Verified on GA402XU: row 0 top, column 0 left, seen from behind (docs/hardware-notes.md).
  orientation: { flipX: false, flipY: false },
  maxValue: 255,
  // Measured: ~31.7 fps for full frames over hidraw (docs/hardware-notes.md).
  maxFps: 30,
  notes: "hidraw transport, frame timing, orientation and brightness verified on GA402XU.",
};
