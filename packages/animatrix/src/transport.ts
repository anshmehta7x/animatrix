/** Low-level packet transports. A transport only moves 640-byte feature reports. */

/** Which mechanism a transport uses. */
export type TransportKind = "hidraw" | "libusb" | "mock";

/** Something that can deliver feature reports to the AniMe Matrix. */
export interface Transport {
  /** The mechanism in use. */
  readonly kind: TransportKind;
  /** Device path or description (for diagnostics). */
  readonly path: string;
  /** Send one 640-byte feature report (byte 0 = report ID). */
  send(packet: Uint8Array): Promise<void>;
  /** Release the device. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * A transport that records packets instead of sending them. Use it in tests and to develop
 * without hardware.
 */
export class MockTransport implements Transport {
  readonly kind = "mock";
  readonly path = "mock";
  /** Every packet sent, in order (copies). */
  readonly packets: Uint8Array[] = [];
  /** True after {@link close}. */
  closed = false;
  /** If set, `send` rejects with this error (to test failure paths). */
  failWith: Error | null = null;

  async send(packet: Uint8Array): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.packets.push(packet.slice());
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Packets as hex prefixes, e.g. `"5E C0 03"`, for readable assertions. */
  summary(bytes = 3): string[] {
    return this.packets.map((p) =>
      Array.from(p.subarray(0, bytes), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(
        " ",
      ),
    );
  }

  /** Forget recorded packets. */
  reset(): void {
    this.packets.length = 0;
  }
}
