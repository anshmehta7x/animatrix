# Hardware notes

These are measurements and observations from real hardware. Protocol background is in [protocol.md](protocol.md). To repeat the low-level checks on another machine, use [`scripts/hw-check.ts`](../scripts/hw-check.ts). It writes straight to the device, so stop animatrixd first.

## Test machine

| Item                       | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| Model (DMI `product_name`) | ROG Zephyrus G14 GA402XU                                       |
| OS                         | Fedora 44, kernel 7.2, GNOME Shell 50 (Wayland)                |
| Device                     | `0b05:193b` "ITE Device(8295)", bcdDevice 0.09, USB Full Speed |
| Kernel driver              | `hid-generic`, a single HID interface                          |

## HID descriptor

The report descriptor contains two top-level collections:

| Collection                        | Report ID | Reports                                           |
| --------------------------------- | --------- | ------------------------------------------------- |
| Usage page `0xFF89`, usage `0x10` | `0xA5`    | Feature, 16 bytes                                 |
| Usage page `0xFF31`, usage `0x80` | `0x5E`    | Input, 5 bytes; **Feature, 639 bytes + ID = 640** |

Both collections share one hidraw node. animatrix selects the `FF31/0080` collection and only ever writes feature report `0x5E`. The `0xA5` report and the `0x5E` input report are undocumented and never touched.

## Transport

**hidraw works.** `HIDIOCSFEATURE` through node-hid's hidraw backend accepts every 640-byte report. This contradicts asusctl's note that the device is "not HID", at least on this kernel. The libusb fallback (`SET_REPORT` control transfer) is implemented but wasn't needed here.

## Orientation

Seen from behind the lid (lid open, standing behind the laptop):

- buffer row 0 is at the **top**
- column 0 is at the **left**
- odd rows are shifted half a pitch to the right
- the diagonal cut is at the bottom-left

Text drawn through the mapping reads upright and is not mirrored, so the GA402 profile uses no flips.

The raw `pattern` check looks sheared, and that is expected. It draws in wire coordinates, and because odd rows are offset, straight buffer columns zig-zag on the lid. Judge shapes with mapped content (the clock, text) instead.

## Frame timing

Over 200 full frames, each made of 3 × 640-byte panes plus a flush (4 feature reports), measured twice:

| Metric                      | Value                  |
| --------------------------- | ---------------------- |
| Per report, p50 / p95 / max | ≈ 8.0 / 10.1 / 11.2 ms |
| Per frame, p50 / p95        | ≈ 31.5 / 33.0 ms       |
| **Achieved fps**            | **≈ 31.7**             |

That fits a Full-Speed control transfer: 640 bytes is 10 × 64-byte packets. animatrix caps output at 30 fps. Skipping unchanged panes would speed up sparse updates, but it stays off by default because it isn't known whether the firmware keeps untouched panes between flushes.

## Brightness and levels

- Hardware brightness `C0 04` levels 0–3 behave as expected.
- Values **254 and 255 look identical**, so animatrix sends 255. asusctl's clamp to 254 isn't needed here.
- At full hardware brightness the **lowest visible level is 3**; values 0–2 are off. Earlier reports put the threshold at 4.

## Visible area

- The planar canvas is 68×44. Its largest fully lit rectangle is **41×29 at (27, 0)**, the top-right area above the diagonal cut. Text effects lay out inside it, and visualiser bars rise from the slanted bottom edge.
- The diagonal (45°) canvas is 64×39.

## Power and session behaviour

- **Suspend and resume** work. On sleep the daemon hands over to the firmware animation. On resume it re-sends the handshake and the previous content comes back.
- UPower reports `OnBattery` and `LidIsClosed`, and logind emits `PrepareForSleep` and `PrepareForShutdown`.
- dbus-next can't receive the unix fd that logind's `Inhibit()` returns. The daemon holds its delay lock through `systemd-inhibit … tail --pid=<daemon> -f /dev/null` instead, which also releases the lock if the daemon dies.
- The visualiser captures the default sink's monitor with `pw-record` and follows changes of the default sink.
- The notification flash watches `Notify` calls with `dbus-monitor`. This works with Fedora's dbus-broker.
- The tray icon appears on GNOME once the AppIndicator extension is enabled and `animatrix-tray` is running.

## Not exercised on hardware

- the libusb fallback
- skipping unchanged panes
- the global shortcut on Wayland
- GA401 and GU604 (no hardware). The GU604 LED count is unresolved: 1711 by one source, 1724 by another.
