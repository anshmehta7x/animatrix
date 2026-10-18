/**
 * hidraw transport via node-hid (HIDIOCSFEATURE). Verified on GA402XU, see
 * docs/hardware-notes.md.
 */
import { access, constants } from "node:fs/promises";
import { createRequire } from "node:module";
import type * as NodeHidModule from "node-hid";
import type { HIDAsync, Device } from "node-hid";
import {
  DeviceNotFoundError,
  PACKET_SIZE,
  PermissionDeniedError,
  TransportError,
} from "@anshmehta7x/animatrix-core";
import type { Transport } from "../transport.js";

/** USB vendor / product of the AniMe Matrix. */
export const VENDOR_ID = 0x0b05;
export const PRODUCT_ID = 0x193b;
/** The AniMe collection: vendor usage page 0xFF31, usage 0x80. */
export const USAGE_PAGE = 0xff31;
export const USAGE = 0x80;

type NodeHid = typeof NodeHidModule;

const require = createRequire(import.meta.url);

function loadHid(): NodeHid {
  const hid = require("node-hid") as NodeHid;
  hid.setDriverType("hidraw");
  return hid;
}

/** Find the AniMe collection's hidraw path, or null. */
export async function findHidrawPath(): Promise<string | null> {
  const devices: Device[] = await loadHid().devicesAsync(VENDOR_ID, PRODUCT_ID);
  const hit = devices.find((d) => d.usagePage === USAGE_PAGE && d.usage === USAGE);
  return hit?.path ?? null;
}

class HidrawTransport implements Transport {
  readonly kind = "hidraw";
  private dev: HIDAsync | null;

  constructor(
    readonly path: string,
    dev: HIDAsync,
  ) {
    this.dev = dev;
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.dev) throw new TransportError("hidraw transport is closed");
    let written: number;
    try {
      written = await this.dev.sendFeatureReport(Buffer.from(packet));
    } catch (err) {
      throw new TransportError(`sendFeatureReport failed on ${this.path}`, err);
    }
    if (written !== PACKET_SIZE) {
      throw new TransportError(`sendFeatureReport wrote ${written} of ${PACKET_SIZE} bytes`);
    }
  }

  async close(): Promise<void> {
    const dev = this.dev;
    this.dev = null;
    if (dev) await dev.close().catch(() => undefined);
  }
}

/**
 * Open the AniMe collection over hidraw.
 *
 * @throws {@link DeviceNotFoundError} if no FF31/0080 collection exists.
 * @throws {@link PermissionDeniedError} if the node is not accessible (udev rule missing).
 */
export async function openHidraw(path?: string): Promise<Transport> {
  const target = path ?? (await findHidrawPath());
  if (!target)
    throw new DeviceNotFoundError("No hidraw node with the AniMe collection (FF31/0080)");
  try {
    await access(target, constants.R_OK | constants.W_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") throw new PermissionDeniedError(target, err);
    throw new DeviceNotFoundError(`Cannot access ${target}`, err);
  }
  try {
    const dev = await loadHid().HIDAsync.open(target, { nonExclusive: true });
    return new HidrawTransport(target, dev);
  } catch (err) {
    throw new TransportError(`Failed to open ${target}`, err);
  }
}
