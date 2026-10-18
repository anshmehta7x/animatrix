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

## Orientation — verified 2026-10-18

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

| Check                               | Expected (default) | Observed    |
| ----------------------------------- | ------------------ | ----------- |
| Bright block corner (row 0 / col 0) | top-left           | as expected |
| "F" reads                           | normally           | _pending_   |
| Diagonal cut                        | bottom-left        | _pending_   |

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

animatrix caps output at 30 fps by default. The library uses node-hid's `HIDAsync`, so
transfers run off the event loop. Skipping unchanged panes (`skipUnchangedPanes`) could speed up
sparse updates, but it is **off by default**: nobody has checked visually whether the firmware
keeps untouched panes between flushes.

## 254 vs 255 — verified: 255 is safe

`node scripts/phase0-spike.ts levels` lights the top 8 rows at 254 on the left half and 255 on the
right half, plus a 0–15 ramp. The firmware accepted both values without error. Whether they look
the same is _pending_. Until that is confirmed, animatrix sends 255 as-is: G-Helper does too, and
Armoury Crate's gamma LUT maps 255 → 255.

## Init after resume — pending

Whether `ASUS Tech.Inc.` is needed after s2idle resume (this machine uses `s2idle`) is not
settled. The daemon re-sends the full setup sequence on every logind `PrepareForSleep(false)`,
which is safe either way.

## Brightness — verified

Hardware levels `C0 04` 0–3 change brightness visibly (confirmed by eye).

`node scripts/phase0-spike.ts brightness` steps `C0 04` through 0, 1, 2, 3 with 1.5 s per step.
All writes are accepted. The visual result is _pending_.

## Other verified findings (2026-10-18)

- **The daemon works end to end** as a systemd user service on GA402XU. It connects over hidraw,
  shows the startup clock, and is driven through the CLI, the tray panel and Python (jeepney). All
  writes succeed; the lid image itself is not yet confirmed by eye.
- **logind delay inhibitor:** dbus-next can't receive the unix fd returned by
  `org.freedesktop.login1.Manager.Inhibit()`. The call never resolves and the connection drops. The
  daemon holds the lock through `systemd-inhibit --mode=delay … tail --pid=<daemon> -f /dev/null`
  instead, which also releases the lock if the daemon dies.
- **usb@3 is WebUSB-only** (no `findByIds` or kernel-driver detach), so the libusb fallback pins
  `usb@^2`.
- **Visible area:** the planar canvas is 68×44. Its largest fully lit rectangle is **41×29 at
  x=27, y=0**, the top-right part above the diagonal cut. Text effects lay out inside it. The
  diagonal canvas is 64×39.
- **Visualiser capture follows the default sink.** Tested silently: a null sink was made the
  default during capture and a tone was played into it. Spectrum peak was 0.74 (0.00 before), and
  the original default sink was restored afterwards.
- **Media and notifications through the installed daemon:** a PNG, an animated GIF (10 fps) and
  an MP4 (ffmpeg, 20 fps) all played with `error: null`, and video frames kept changing.
  `animatrix flash` worked. With `notifications.flash` on, `notify-send` triggered a flash through
  `dbus-monitor` (Fedora's dbus-broker), and the previous content came back afterwards.
- **Policy logic** (sleep → firmware animation → resume restores content; the lid gate wins over
  the sleep animation; off on battery) is covered by tests with a fake power monitor. A real
  suspend has not been tried.
- **UPower** reports `OnBattery` and `LidIsClosed` on this machine, and **logind** emits
  `PrepareForSleep`. A real suspend/resume cycle has not been exercised yet.

## When you're back: checklist

The checks below write to the device directly. Stop the daemon first so the two don't fight:

```sh
systemctl --user stop animatrixd
node scripts/phase0-spike.ts pattern     # orientation (or: animatrix --direct test-pattern)
node scripts/phase0-spike.ts levels      # 254 vs 255 and the 0–15 ramp
node scripts/phase0-spike.ts brightness  # C0 04 steps 0..3
systemctl --user start animatrixd
```

1. Fill in the orientation table above. If it's wrong, set `flipX`/`flipY` in
   `packages/core/src/profiles/ga402.ts`, then rebuild and run `make install`.
2. Note whether the 254 and 255 halves look the same, and the lowest visible ramp step.
3. Suspend and resume with animatrixd running. Check that the content comes back and see what the
   lid did while asleep (`journalctl --user -u animatrixd`).
4. Log out and back in to activate the AppIndicator extension, then run
   `gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com` and check the tray icon.

## Visual confirmation (2026-10-18)

- The clock (planar mapping, top-right safe area) reads **upright and not mirrored**. That confirms
  the default orientation: row 0 is at the top and column 0 on the left, seen from behind. No flip
  is needed.
- The raw test pattern looks sheared. That is expected: it is drawn in wire coordinates, and odd
  rows are offset by half a pitch, so straight buffer columns zig-zag on the lid. Use content
  through the mapping (the clock, text, `animatrix draw`) to judge shapes.
- Brightness levels 0–3 work.
- 254 and 255 look identical, so 255 is safe. asusctl's clamp to 254 is unnecessary on GA402XU.
- Lowest visible level: **3** (the 4th dash) at hardware brightness 3. Values 0–2 are off. vddCore
  reported 4 as the first visible level, so this panel is one step more sensitive.
- **Suspend/resume verified:** on sleep the daemon hands over to the firmware animation; on resume
  it re-initialises and the content comes back (journal: "preparing for sleep", "resumed").
- **Tray icon verified** on GNOME 49 with the AppIndicator extension (the item registers with
  StatusNotifierWatcher). The tray only appears while `animatrix-tray` runs, so enable "Open at
  login" in Settings or add the autostart entry.
