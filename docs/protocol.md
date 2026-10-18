# AniMe Matrix protocol (summary)

This summarises what animatrix sends to the AniMe Matrix. The facts come from the open-source projects that drive it: [G-Helper](https://github.com/seerge/g-helper), [asusctl](https://gitlab.com/asus-linux/asusctl), [Starlight](https://github.com/vddCore/Starlight), and vddCore's protocol write-up. Measurements from real hardware are in [hardware-notes.md](hardware-notes.md).

## Transport

- USB `0b05:193b`. The HID collection is usage page `0xFF31`, usage `0x80`.
- Feature report `0x5E`, **640 bytes** including the ID. This matches the descriptor read on GA402XU.
- Linux: hidraw `HIDIOCSFEATURE` works (verified). The libusb fallback is `SET_REPORT` control transfer `(0x21, 0x09, 0x035E, 0)` on interface 0.
- The device is treated as write-only. animatrix never reads from it.
- The same PID is used by **Slash Lighting** laptops, so the model is chosen from DMI and Slash models are refused.

## Commands

Every packet is `5E <bytes…>`, zero-padded to 640 bytes. These are the only commands animatrix sends:

| Purpose                    | Bytes after `5E`                                                           |
| -------------------------- | -------------------------------------------------------------------------- |
| Init / wake                | ASCII `ASUS Tech.Inc.`                                                     |
| LED data                   | `C0 02 <start u16 LE, 1-based> <count u16 LE> <data…>`, data from offset 7 |
| Flush (show)               | `C0 03`; nothing appears without it                                        |
| Hardware brightness        | `C0 04 <0..3>`                                                             |
| Display on/off             | `C3 01 <00 on, 80 off>`                                                    |
| Built-in animations on/off | `C4 01 <00 on, 80 off>`                                                    |
| Built-in selection         | `C5 <bits>`                                                                |

`C2` (the capability probe) and `C4 08` (an unknown Armoury Crate command) are **not** sent.

### `C5` bits

| Bit | State    | 0                  | 1               |
| --- | -------- | ------------------ | --------------- |
| 0   | awake    | binaryBannerScroll | rogLogoGlitch   |
| 1   | sleep    | bannerSwipe        | starfield       |
| 2   | shutdown | glitchOut          | seeYa           |
| 3   | boot     | glitchConstruction | staticEmergence |

## Frames

- Each LED is one byte of greyscale, scaled by the `C0 04` level. Values 0–3 are effectively invisible.
- GA402 sends 1449 bytes as **3 panes × 627** with headers `5E C0 02 01 00 73 02`, `5E C0 02 74 02 73 02` and `5E C0 02 E7 04 73 02`. The last pane is zero-padded, which matches asusctl and Armoury Crate. These are golden-byte tests in `packages/core/test/packets.test.ts`.
- GA401 sends 2 panes. Its data starts at buffer index 1 and has dead trailing slots in some rows.
- **Session setup is sent once:** init, `C4 01 80`, `C3 01 00`, `C0 04 n`. Toggling `C4` clears the panel and flickers.

## Geometry

- The lattice is staggered: odd rows are offset by half a pitch. The bottom-left corner is cut diagonally, so each row loses one LED every two rows after row 11 on GA402.
- Per-row tables (first column, LED count, slot pitch) live as data in `packages/core/src/profiles/*.ts`.
- The physical pitch on GA402 is 0.77 cm horizontally and 0.283 cm between rows (asusctl's measurement).
- Orientation (GA402, seen from behind): row 0 at the top, column 0 on the left.

## Timing (measured)

About 8 ms per feature report on GA402XU, so one full frame takes about 31.5 ms (**≈31.7 fps ceiling**). animatrix caps output at 30 fps.
