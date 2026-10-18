import { rowsFrom, type ModelProfile } from "../profile.js";

// Row table: asusctl's GA401 formulas (rog-anime image.rs first_x/width/pitch), via the research
// doc §1.2. 1215 real LEDs (ASUS figure) in 1244 slots starting at buffer index 1.
const FIRST = [
  0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
  13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24,
];
const COUNT = FIRST.map((_, y) => (y < 5 ? 33 : 36 - Math.ceil(y / 2)));
const PITCH = COUNT.map((c, y) => (y === 1 || y === 3 ? 35 : y < 5 ? 33 : 36 - Math.floor(y / 2)));

/** ROG Zephyrus G14 2020/2021 (GA401I*, GA401Q*). UNTESTED: from the research doc only. */
export const GA401: ModelProfile = {
  id: "GA401",
  name: "Zephyrus G14 (2020–2021)",
  tested: false,
  dmiMatch: ["GA401I", "GA401Q"],
  rows: rowsFrom(FIRST, COUNT, PITCH),
  ledStart: 1,
  oddRowShift: -0.5,
  pitchCm: { x: 0.8, y: 0.3 },
  pane: { length: 627, count: 2 },
  canvas: { width: 66, height: 41 },
  orientation: { flipX: false, flipY: false },
  maxValue: 255,
  maxFps: 30,
  notes: "Untested. Geometry from asusctl; dead slots trail rows 1, 3 and 5+.",
};
