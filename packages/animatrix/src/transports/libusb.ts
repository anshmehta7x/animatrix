/**
 * libusb fallback: HID SET_REPORT(Feature, 0x5E) as a control transfer on interface 0, the way
 * asusctl does it. Detaches the kernel HID driver while open (the hidraw node disappears) and
 * re-attaches it on close. Does NOT reset the device. Not exercised on hardware (hidraw works).
 */
import { createRequire } from "node:module";
import type * as UsbNs from "usb";
import type { Device, Interface } from "usb";
import {
  DeviceBusyError,
  DeviceNotFoundError,
  PermissionDeniedError,
  TransportError,
} from "@anshmehta7x/animatrix-core";
import type { Transport } from "../transport.js";
import { PRODUCT_ID, VENDOR_ID } from "./hidraw.js";

type UsbModule = typeof UsbNs;
const require = createRequire(import.meta.url);

class LibusbTransport implements Transport {
  readonly kind = "libusb";
  readonly path: string;
  private open = true;

  constructor(
    private readonly device: Device,
    private readonly iface: Interface,
    private readonly detached: boolean,
  ) {
    this.path = `usb:${device.busNumber}-${device.deviceAddress}`;
  }

  send(packet: Uint8Array): Promise<void> {
    if (!this.open) return Promise.reject(new TransportError("libusb transport is closed"));
    return new Promise((resolve, reject) => {
      this.device.controlTransfer(0x21, 0x09, 0x035e, 0, Buffer.from(packet), (err) =>
        err ? reject(new TransportError("SET_REPORT control transfer failed", err)) : resolve(),
      );
    });
  }

  async close(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    await new Promise<void>((resolve) => this.iface.release(() => resolve()));
    if (this.detached) {
      try {
        this.iface.attachKernelDriver();
      } catch {
        // best effort; the kernel re-binds on next replug/resume anyway
      }
    }
    this.device.close();
  }
}

/** Open the AniMe Matrix over libusb. */
export async function openLibusb(): Promise<Transport> {
  const usb = require("usb") as UsbModule;
  const device = usb.findByIds(VENDOR_ID, PRODUCT_ID);
  if (!device) throw new DeviceNotFoundError();
  try {
    device.open();
  } catch (err) {
    const msg = String(err);
    if (msg.includes("ACCESS")) throw new PermissionDeniedError("usb 0b05:193b", err);
    throw new TransportError("libusb open failed", err);
  }
  const iface = device.interface(0);
  let detached = false;
  try {
    if (iface.isKernelDriverActive()) {
      iface.detachKernelDriver();
      detached = true;
    }
    iface.claim();
  } catch (err) {
    device.close();
    if (String(err).includes("BUSY")) throw new DeviceBusyError("unknown", err);
    throw new TransportError("libusb claim failed", err);
  }
  return new LibusbTransport(device, iface, detached);
}
