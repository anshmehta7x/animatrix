/**
 * Wire encoding. Every packet is a 640-byte HID feature report whose first byte is the report ID
 * `0x5E`. Only the opcodes listed in docs/protocol.md are produced here.
 */
import { encodeBuiltins, type BuiltinSelection } from "./builtins.js";
import { InvalidArgumentError } from "./errors.js";
import { slotCount, type ModelProfile } from "./profile.js";

/** Feature report ID of the AniMe collection. */
export const REPORT_ID = 0x5e;
/** Size of every feature report including the ID byte. */
export const PACKET_SIZE = 640;
/** Offset of LED data inside a `C0 02` pane. */
export const PANE_HEADER = 7;

/** Hardware brightness levels accepted by `C0 04`. */
export type HardwareBrightness = 0 | 1 | 2 | 3;

/** Build a zero-padded packet: `5E <bytes…>`. */
export function packet(bytes: ArrayLike<number>): Uint8Array {
  if (bytes.length > PACKET_SIZE - 1) {
    throw new InvalidArgumentError(`packet payload too long: ${bytes.length}`);
  }
  const out = new Uint8Array(PACKET_SIZE);
  out[0] = REPORT_ID;
  out.set(bytes, 1);
  return out;
}

/** `5E "ASUS Tech.Inc."`: init / wake handshake. */
export function initPacket(): Uint8Array {
  return packet(Array.from("ASUS Tech.Inc.", (c) => c.charCodeAt(0)));
}

/** `5E C0 04 <0..3>`: global hardware brightness. */
export function brightnessPacket(level: HardwareBrightness): Uint8Array {
  if (![0, 1, 2, 3].includes(level)) {
    throw new InvalidArgumentError(`hardware brightness must be 0..3, got ${String(level)}`);
  }
  return packet([0xc0, 0x04, level]);
}

/** `5E C3 01 <00 on | 80 off>`: display on/off. */
export function displayPacket(on: boolean): Uint8Array {
  return packet([0xc3, 0x01, on ? 0x00 : 0x80]);
}

/** `5E C4 01 <00 on | 80 off>`: firmware built-in animation mode on/off. */
export function builtinsEnabledPacket(on: boolean): Uint8Array {
  return packet([0xc4, 0x01, on ? 0x00 : 0x80]);
}

/** `5E C5 <bits>`: choose built-in animation variants. */
export function builtinsSelectPacket(sel: BuiltinSelection): Uint8Array {
  return packet([0xc5, encodeBuiltins(sel)]);
}

/** `5E C0 03`: show the uploaded frame. Nothing is visible without it. */
export function flushPacket(): Uint8Array {
  return packet([0xc0, 0x03]);
}

/**
 * Encode one `C0 02` data pane. `start` is the 0-based buffer index; the wire address is 1-based.
 * The header always carries the profile's full pane length, and the data is zero-padded
 * (matches asusctl and Armoury Crate headers `5E C0 02 E7 04 73 02` for GA402 pane 3).
 */
export function panePacket(frame: Uint8Array, start: number, length: number): Uint8Array {
  if (length > PACKET_SIZE - PANE_HEADER) {
    throw new InvalidArgumentError(`pane length ${length} does not fit a packet`);
  }
  const addr = start + 1;
  const out = packet([0xc0, 0x02, addr & 0xff, addr >> 8, length & 0xff, length >> 8]);
  out.set(frame.subarray(start, Math.min(frame.length, start + length)), PANE_HEADER);
  return out;
}

/** Options for {@link encodeFrame}. */
export interface EncodeOptions {
  /**
   * Previous frame. When given, panes whose bytes are identical are skipped. It is not known
   * whether the firmware keeps untouched panes between flushes, so callers keep this off.
   */
  previous?: Uint8Array | null;
}

/**
 * Encode a frame as data panes followed by a flush. Returns an empty array if `previous` is given
 * and nothing changed (idle: send nothing).
 */
export function encodeFrame(
  profile: ModelProfile,
  frame: Uint8Array,
  opts: EncodeOptions = {},
): Uint8Array[] {
  if (frame.length !== slotCount(profile)) {
    throw new InvalidArgumentError(
      `frame has ${frame.length} slots, ${profile.id} needs ${slotCount(profile)}`,
    );
  }
  const { length, count } = profile.pane;
  const prev = opts.previous ?? null;
  const panes = Array.from({ length: count }, (_, i) => i * length)
    .filter((start) => start < frame.length)
    .filter((start) => prev === null || !sameRange(frame, prev, start, start + length))
    .map((start) => panePacket(frame, start, length));
  return panes.length === 0 ? [] : [...panes, flushPacket()];
}

function sameRange(a: Uint8Array, b: Uint8Array, from: number, to: number): boolean {
  const end = Math.min(to, a.length);
  if (b.length !== a.length) return false;
  for (let i = from; i < end; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * The once-per-session setup that puts the panel in custom-frame mode: init, built-ins off,
 * display on, brightness. Toggling `C4` clears the panel, so do not repeat it per frame.
 */
export function customModeSetup(brightness: HardwareBrightness): Uint8Array[] {
  return [
    initPacket(),
    builtinsEnabledPacket(false),
    displayPacket(true),
    brightnessPacket(brightness),
  ];
}

/** Setup that hands the panel back to its firmware animations. */
export function builtinModeSetup(
  sel: BuiltinSelection,
  brightness: HardwareBrightness,
): Uint8Array[] {
  return [
    initPacket(),
    displayPacket(true),
    brightnessPacket(brightness),
    builtinsEnabledPacket(true),
    builtinsSelectPacket(sel),
  ];
}
