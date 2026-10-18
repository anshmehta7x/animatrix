# Hardware notes (Phase 0)

Findings from the Phase 0 spike (`scripts/phase0-spike.ts`) on the development machine. Protocol
background lives in [protocol.md](protocol.md) and the research write-up it links to.

## Machine

| Item                       | Value                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Model (DMI `product_name`) | `ROG Zephyrus G14 GA402XU_GA402XU`                                                                                        |
| Kernel / distro            | 7.2.11-200.fc44.x86_64, Fedora 44, GNOME Wayland                                                                          |
| Device                     | `0b05:193b` "ITE Device(8295)", bcdDevice 0.09, USB Full Speed (12 Mbit/s)                                                |
| Kernel driver              | `hid-generic`, single interface 0 (class HID, boot subclass, protocol "keyboard")                                         |
| hidraw node                | `/dev/hidraw1` on this boot. **Don't rely on the number**: the udev rule and the library match by VID:PID plus usage page |

## Report descriptor — verified 2026-10-18

`/sys/class/hidraw/hidraw1/device/report_descriptor` (66 bytes) decodes to two top-level collections:

| Collection                        | Report ID | Reports                                                      |
| --------------------------------- | --------- | ------------------------------------------------------------ |
| Usage page `0xFF89`, usage `0x10` | `0xA5`    | Feature, 16 bytes                                            |
| Usage page `0xFF31`, usage `0x80` | `0x5E`    | Input, 5 bytes; **Feature, 639 bytes (`0x027F`) + ID = 640** |

This matches the Armoury Crate HAL's selection rule (FF31/0080, report `0x5E`, 640 bytes) and the
reconstructed descriptor in asusctl's simulator. The `0xA5` report and the `0x5E` input report are
undocumented. animatrix never reads or writes them.

node-hid enumerates both collections with the same path (`/dev/hidraw1`). animatrix picks the one
with `usagePage === 0xFF31 && usage === 0x80`.

## Transport — hidraw works

**Transport A (hidraw `HIDIOCSFEATURE` through node-hid's hidraw backend) works.** Every
`sendFeatureReport` of a 640-byte buffer returned 640, with no errors. These sequences were sent:

- `ASUS Tech.Inc.`, then `C4 01 80`, `C3 01 00`, `C0 04 03`
- 3 × `C0 02` panes, then `C0 03`

The asusctl claim that the device is "not HID" does not hold on this kernel. The libusb transport
(B) is implemented as a fallback but is **not needed on this machine**, and it was not exercised
against the hardware.

> **Visual confirmation pending.** The user was away during Phase 0. Writes succeed at the
> kernel level, but nobody has yet looked at the lid to confirm that the frame appears. Run
> `animatrix test-pattern` and fill in the table below.

## Orientation — UNVERIFIED

The test pattern (`animatrix test-pattern`, or `node scripts/phase0-spike.ts pattern`) draws three things:

- a dim outline on the first and last LED of every row, which shows the diagonal cut
- a bright 4×6 block at buffer row 0 / column 0
- a large "F" (stem on the low-column side, bars toward higher columns, top bar at the low row numbers)

The current default follows G-Helper's convention, which displays images upright for its users.
Seen from behind the lid (lid open, standing behind the laptop):

- row 0 is at the **top** and rows increase downward
- column 0 is at the **left**
- odd rows are shifted half a pitch to the right
- the diagonal cut is at the bottom-left

| Check                               | Expected (default) | Observed  |
| ----------------------------------- | ------------------ | --------- |
| Bright block corner (row 0 / col 0) | top-left           | _pending_ |
| "F" reads                           | normally           | _pending_ |
| Diagonal cut                        | bottom-left        | _pending_ |

If the observation differs, change `orientation` in `packages/core/src/profiles/ga402.ts`
(`flipX` / `flipY`). The mapping, the preview and every effect follow from that one setting.

## Frame timing — measured

The benchmark sent 200 full frames (3 × 640-byte panes + flush = 4 feature reports), each changing
one LED, twice:

| Metric                     | Run 1                   | Run 2                   |
| -------------------------- | ----------------------- | ----------------------- |
| per report p50 / p95 / max | 7.98 / 10.09 / 11.05 ms | 8.02 / 10.03 / 11.21 ms |
| per frame p50 / p95        | 31.4 / 33.0 ms          | 31.5 / 32.8 ms          |
| **achieved fps**           | **31.7**                | **31.7**                |

About 8 ms per report fits a Full-Speed control transfer: 640 bytes is 10 × 64-byte packets, and
the controller adds some overhead. The device ceiling is therefore **≈31 fps for full frames**,
not the ≈25 fps the research doc inferred.

animatrix uses a default cap of 30 fps. It skips panes whose bytes didn't change, so sparse updates
can go faster. `sendFeatureReport` is synchronous and blocks the event loop for the length of the
transfer. That is acceptable in the daemon, which does nothing else heavy, but effects must not
assume free time between frames.

## 254 vs 255 — pending visual check

`node scripts/phase0-spike.ts levels` lights the top 8 rows at 254 on the left half and 255 on the
right half, plus a 0–15 ramp. The firmware accepted both values without error. Whether they look
the same is _pending_. Until that is confirmed, animatrix sends 255 as-is: G-Helper does too, and
Armoury Crate's gamma LUT maps 255 → 255.

## Init after resume — pending

Whether `ASUS Tech.Inc.` is needed after s2idle resume (this machine uses `s2idle`) is not
settled. The daemon re-sends the full setup sequence on every logind `PrepareForSleep(false)`,
which is safe either way.

## Brightness

`node scripts/phase0-spike.ts brightness` steps `C0 04` through 0, 1, 2, 3 with 1.5 s per step.
All writes are accepted. The visual result is _pending_.
