/**
 * Model profiles describe one AniMe Matrix panel as pure data. Adding a model means adding a
 * profile file, not branching in code.
 *
 * @packageDocumentation
 */
import { InvalidArgumentError } from "./errors.js";

/** One physical row of the staggered LED lattice. */
export interface RowSpec {
  /** Lattice column of the first LED in this row. */
  readonly first: number;
  /** Number of real LEDs in this row. */
  readonly count: number;
  /**
   * Buffer slots this row consumes. Equal to `count` unless the row has dead (padding) slots,
   * which always trail the real LEDs.
   */
  readonly pitch: number;
}

/** How the buffer frame relates to the lid as seen from behind (lid open, standing behind). */
export interface Orientation {
  /** Mirror horizontally: true means lattice column 0 is on the right. */
  readonly flipX: boolean;
  /** Mirror vertically: true means row 0 is at the bottom. */
  readonly flipY: boolean;
}

/** A complete, data-only description of one AniMe Matrix panel. */
export interface ModelProfile {
  /** Stable identifier, e.g. `"GA402"`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Whether this profile has been verified on real hardware by this project. */
  readonly tested: boolean;
  /** Substrings of DMI `product_name`/`board_name` that select this profile. */
  readonly dmiMatch: readonly string[];
  /** Per-row layout, row 0 first. */
  readonly rows: readonly RowSpec[];
  /** Buffer index of the first LED of row 0 (GA401 starts at 1). */
  readonly ledStart: number;
  /**
   * Horizontal offset of odd rows in lattice columns (+0.5 or -0.5). The sign follows the
   * convention of the source the row table came from.
   */
  readonly oddRowShift: number;
  /** Centre-to-centre LED spacing in centimetres. */
  readonly pitchCm: { readonly x: number; readonly y: number };
  /** Frame transport: every frame is `count` data panes of `length` bytes, then a flush. */
  readonly pane: { readonly length: number; readonly count: number };
  /** Default logical canvas size for planar mapping (square pixels). */
  readonly canvas: { readonly width: number; readonly height: number };
  /** Orientation relative to the lid seen from behind. */
  readonly orientation: Orientation;
  /** Largest per-LED value to send (255 unless proven otherwise). */
  readonly maxValue: number;
  /** Measured or assumed full-frame ceiling in frames per second. */
  readonly maxFps: number;
  /** Free-form provenance and caveats. */
  readonly notes: string;
}

/** Number of real LEDs in a profile. */
export function ledCount(profile: ModelProfile): number {
  return profile.rows.reduce((sum, row) => sum + row.count, 0);
}

/** Number of buffer slots a frame occupies (including `ledStart` and dead slots). */
export function slotCount(profile: ModelProfile): number {
  return profile.rows.reduce((sum, row) => sum + row.pitch, profile.ledStart);
}

/** Length of the zero-padded wire buffer (`pane.length * pane.count`). */
export function wireLength(profile: ModelProfile): number {
  return profile.pane.length * profile.pane.count;
}

/**
 * Build a row table from parallel arrays. Pitches default to counts.
 *
 * @internal
 */
export function rowsFrom(
  first: readonly number[],
  count: readonly number[],
  pitch: readonly number[] = count,
): RowSpec[] {
  if (first.length !== count.length || pitch.length !== count.length) {
    throw new InvalidArgumentError("row table arrays differ in length");
  }
  return first.map((f, i) => ({ first: f, count: count[i]!, pitch: pitch[i]! }));
}
