/**
 * Direct protocol driver. Owns a transport and tracks the panel's mode so that mode packets are
 * sent once per session, not per frame (toggling `C4` clears the panel and flickers).
 */
import {
  DEFAULT_BUILTINS,
  DeviceBusyError,
  UnsupportedModelError,
  brightnessPacket,
  builtinModeSetup,
  builtinsSelectPacket,
  customModeSetup,
  detectProfile,
  displayPacket,
  encodeFrame,
  initPacket,
  profileById,
  toAnimatrixError,
  TransportError,
  type BuiltinSelection,
  type HardwareBrightness,
  type ModelProfile,
} from "@anshmehta7x/animatrix-core";
import { isAsusdRunning, readDmiModel } from "./system.js";
import type { Transport } from "./transport.js";
import { openHidraw } from "./transports/hidraw.js";
import { openLibusb } from "./transports/libusb.js";

/** Options for {@link AnimeDevice.open}. */
export interface DeviceOptions {
  /** Force a model profile id instead of DMI detection (e.g. `"GA402"`). */
  model?: string;
  /** `auto` (hidraw, then libusb), a specific mechanism, or a ready transport (e.g. a mock). */
  transport?: "auto" | "hidraw" | "libusb" | Transport;
  /** Skip the asusd check. */
  ignoreAsusd?: boolean;
  /**
   * Skip pane bytes that did not change since the last frame. Off by default: it is not
   * known whether the firmware keeps untouched panes between flushes.
   */
  skipUnchangedPanes?: boolean;
}

type PanelMode = "unknown" | "custom" | "builtin";

/** Resolve the profile from options or DMI. */
export async function resolveProfile(model?: string): Promise<ModelProfile> {
  if (model) {
    const p = profileById(model);
    if (!p) throw new UnsupportedModelError(model, "no such profile id");
    return p;
  }
  const dmi = await readDmiModel();
  if (!dmi) throw new UnsupportedModelError("unknown", "could not read DMI model");
  return detectProfile(dmi);
}

async function resolveTransport(opt: DeviceOptions["transport"]): Promise<Transport> {
  if (typeof opt === "object") return opt;
  if (opt === "hidraw") return openHidraw();
  if (opt === "libusb") return openLibusb();
  try {
    return await openHidraw();
  } catch (err) {
    const e = toAnimatrixError(err, (c) => new TransportError("hidraw failed", c));
    if (e.code === "PERMISSION_DENIED") throw e;
    return openLibusb();
  }
}

/** A directly opened AniMe Matrix. Prefer {@link Matrix} unless you need raw control. */
export class AnimeDevice {
  readonly profile: ModelProfile;
  readonly transport: Transport;
  private mode: PanelMode = "unknown";
  private brightness: HardwareBrightness = 3;
  private builtins: BuiltinSelection = DEFAULT_BUILTINS;
  private displayOn = true;
  private last: Uint8Array | null = null;
  private readonly skipUnchanged: boolean;
  private queue: Promise<void> = Promise.resolve();

  private constructor(profile: ModelProfile, transport: Transport, skipUnchanged: boolean) {
    this.profile = profile;
    this.transport = transport;
    this.skipUnchanged = skipUnchanged;
  }

  /**
   * Detect the model, open a transport and send the init handshake.
   *
   * @throws {@link UnsupportedModelError}, {@link DeviceNotFoundError},
   *   {@link PermissionDeniedError}, {@link DeviceBusyError}
   */
  static async open(opts: DeviceOptions = {}): Promise<AnimeDevice> {
    const profile = await resolveProfile(opts.model);
    const isMock = typeof opts.transport === "object";
    if (!isMock && !opts.ignoreAsusd && (await isAsusdRunning())) {
      throw new DeviceBusyError("asusd");
    }
    const transport = await resolveTransport(opts.transport);
    const dev = new AnimeDevice(profile, transport, opts.skipUnchangedPanes ?? false);
    await dev.send([initPacket()]);
    return dev;
  }

  /** Current hardware brightness. */
  get hardwareBrightness(): HardwareBrightness {
    return this.brightness;
  }

  /** Whether the display is on. */
  get isDisplayOn(): boolean {
    return this.displayOn;
  }

  /** Last built-in selection sent or stored. */
  get builtinSelection(): BuiltinSelection {
    return this.builtins;
  }

  /** Send packets in order; serialised so concurrent callers never interleave a frame. */
  private send(packets: Uint8Array[]): Promise<void> {
    const run = this.queue.then(async () => {
      for (const p of packets) await this.transport.send(p);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Set hardware brightness 0..3 (`C0 04`). */
  async setHardwareBrightness(level: HardwareBrightness): Promise<void> {
    await this.send([brightnessPacket(level)]);
    this.brightness = level;
  }

  /** Turn the display on or off (`C3 01`). */
  async setDisplay(on: boolean): Promise<void> {
    await this.send([displayPacket(on)]);
    this.displayOn = on;
  }

  /** Hand the panel to its firmware animations with the given selection (`C4 01 00`, `C5`). */
  async useBuiltins(sel: BuiltinSelection = this.builtins): Promise<void> {
    await this.send(builtinModeSetup(sel, this.brightness));
    this.builtins = sel;
    this.mode = "builtin";
    this.displayOn = true;
    this.last = null;
  }

  /**
   * Choose built-in variants. Sent immediately in built-in mode; otherwise stored and sent the
   * next time built-ins are enabled. The sleep/shutdown/boot bits matter even in custom mode
   * only once built-ins are re-enabled.
   */
  async setBuiltinSelection(sel: BuiltinSelection): Promise<void> {
    this.builtins = sel;
    if (this.mode === "builtin") await this.send([builtinsSelectPacket(sel)]);
  }

  /** Upload and show one frame (switches to custom mode once if needed). */
  async writeFrame(frame: Uint8Array): Promise<void> {
    const setup = this.mode !== "custom";
    const prev = this.skipUnchanged && !setup ? this.last : null;
    const packets = [
      ...(setup ? customModeSetup(this.brightness) : []),
      ...encodeFrame(this.profile, frame, { previous: prev }),
    ];
    if (packets.length === 0) return;
    await this.send(packets);
    if (setup) {
      this.mode = "custom";
      this.displayOn = true;
    }
    this.last = frame.slice();
  }

  /**
   * Re-send the handshake and restore mode/brightness/display, e.g. after resume. The daemon
   * always does this on resume; it is cheap and works whether or not the firmware forgot.
   */
  async reinit(): Promise<void> {
    const wasBuiltin = this.mode === "builtin";
    this.mode = "unknown";
    this.last = null;
    await this.send([initPacket()]);
    if (wasBuiltin) {
      await this.useBuiltins();
    } else {
      await this.send([displayPacket(this.displayOn), brightnessPacket(this.brightness)]);
    }
  }

  /** Close the transport. */
  async close(): Promise<void> {
    await this.queue;
    await this.transport.close();
  }
}
