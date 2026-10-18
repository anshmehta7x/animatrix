/**
 * The staggered LED lattice of a profile, in the viewer's frame (lid seen from behind).
 */
import { slotCount, type ModelProfile } from "./profile.js";

/** One physical LED. */
export interface Led {
  /** Index into the frame buffer. */
  readonly index: number;
  /** Buffer row (wire order). */
  readonly row: number;
  /** Lattice column within the row (wire order). */
  readonly col: number;
  /**
   * Horizontal position in half-pitch units, viewer frame, 0 at the leftmost LED. Always an
   * integer; neighbours in the same row differ by 2.
   */
  readonly u: number;
  /** Vertical position in rows, viewer frame, 0 at the top. */
  readonly v: number;
  /** Centre X in centimetres from the leftmost LED centre. */
  readonly xCm: number;
  /** Centre Y in centimetres from the top row centre. */
  readonly yCm: number;
}

/** Precomputed lattice: every LED with its buffer index and physical position. */
export class Lattice {
  /** The profile this lattice was built from. */
  readonly profile: ModelProfile;
  /** All real LEDs in buffer order. */
  readonly leds: readonly Led[];
  /** Frame buffer length in bytes. */
  readonly slots: number;
  /** Largest `u` over all LEDs (width in half-pitch units). */
  readonly maxU: number;
  /** Largest `v` (number of rows - 1). */
  readonly maxV: number;
  private readonly rowStart: readonly number[];

  constructor(profile: ModelProfile) {
    this.profile = profile;
    this.slots = slotCount(profile);
    this.rowStart = profile.rows.reduce<number[]>(
      (acc, row, y) => [
        ...acc,
        y === 0 ? profile.ledStart : acc[y - 1]! + profile.rows[y - 1]!.pitch,
      ],
      [],
    );
    const raw = profile.rows.flatMap((row, y) =>
      Array.from({ length: row.count }, (_, i) => ({
        index: this.rowStart[y]! + i,
        row: y,
        col: row.first + i,
        u2: 2 * (row.first + i) + Math.round(2 * profile.oddRowShift) * (y % 2),
      })),
    );
    const minU = Math.min(...raw.map((l) => l.u2));
    const maxU = Math.max(...raw.map((l) => l.u2)) - minU;
    const maxV = profile.rows.length - 1;
    const { flipX, flipY } = profile.orientation;
    this.maxU = maxU;
    this.maxV = maxV;
    this.leds = raw.map((l) => {
      const u = flipX ? maxU - (l.u2 - minU) : l.u2 - minU;
      const v = flipY ? maxV - l.row : l.row;
      return {
        index: l.index,
        row: l.row,
        col: l.col,
        u,
        v,
        xCm: (u / 2) * profile.pitchCm.x,
        yCm: v * profile.pitchCm.y,
      };
    });
  }

  /** Physical width in cm including one LED pitch of margin (half on each side). */
  get widthCm(): number {
    return (this.maxU / 2 + 1) * this.profile.pitchCm.x;
  }

  /** Physical height in cm including one row pitch of margin. */
  get heightCm(): number {
    return (this.maxV + 1) * this.profile.pitchCm.y;
  }

  /** Buffer index for a wire-order (col, row), or -1 if no LED exists there. */
  indexOf(col: number, row: number): number {
    const spec = this.profile.rows[row];
    if (!spec || col < spec.first || col >= spec.first + spec.count) return -1;
    return this.rowStart[row]! + (col - spec.first);
  }

  /** A new all-dark frame buffer for this lattice. */
  createFrame(): Uint8Array {
    return new Uint8Array(this.slots);
  }
}

const cache = new WeakMap<ModelProfile, Lattice>();

/** Get (and memoise) the lattice for a profile. */
export function latticeFor(profile: ModelProfile): Lattice {
  const hit = cache.get(profile);
  if (hit) return hit;
  const lattice = new Lattice(profile);
  cache.set(profile, lattice);
  return lattice;
}
