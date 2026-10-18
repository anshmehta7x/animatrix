/**
 * Asymmetric orientation test pattern, drawn in wire (buffer) coordinates on purpose: it shows
 * where buffer row 0 / column 0 really is on the lid, independent of the orientation flags.
 */
import { latticeFor } from "./geometry.js";
import type { ModelProfile } from "./profile.js";

/**
 * Build the test frame: a dim outline of each row's first and last LED (shows the diagonal cut),
 * a bright 4×6 block at row 0 / column 0, and a large "F" in the middle.
 */
export function testPatternFrame(profile: ModelProfile): Uint8Array {
  const lattice = latticeFor(profile);
  const frame = lattice.createFrame();
  const set = (col: number, row: number, v: number): void => {
    const i = lattice.indexOf(col, row);
    if (i >= 0) frame[i] = v;
  };
  const rows = profile.rows.length;
  profile.rows.forEach((r, y) => {
    set(r.first, y, 60);
    set(r.first + r.count - 1, y, 60);
  });
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) set(x, y, 255);
  const top = Math.round(rows * 0.26);
  const bottom = Math.round(rows * 0.72);
  const mid = Math.round((top + bottom) / 2);
  for (let y = top; y <= bottom; y++) for (let x = 12; x <= 14; x++) set(x, y, 255);
  for (let y = top; y <= top + 3; y++) for (let x = 12; x <= 24; x++) set(x, y, 255);
  for (let y = mid - 2; y <= mid + 1; y++) for (let x = 12; x <= 20; x++) set(x, y, 255);
  return frame;
}
