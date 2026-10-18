# Architecture

```
 ┌─────────────────┐  ┌───────────────┐  ┌──────────────────────────┐
 │ tray (Electron) │  │ animatrix CLI │  │ scripts / Python / busctl │
 └────────┬────────┘  └───────┬───────┘  └─────────────┬────────────┘
          └──────── D-Bus session: dev.animatrix.Matrix1 ┘
                              │
                     ┌────────▼────────┐   UPower, logind (system bus)
                     │   animatrixd    │◄─ lid, battery, sleep, shutdown
                     │ controller      │   MPRIS, PipeWire, /proc
                     │ runner, effects │   (data for effects)
                     └────────┬────────┘
                              │ 640-byte HID feature reports (hidraw; libusb fallback)
                     ┌────────▼────────┐
                     │  AniMe Matrix   │   0b05:193b, report 0x5E, page 0xFF31
                     └─────────────────┘
```

**Exactly one process writes to the device.** That process is `animatrixd`. Everything else goes through its D-Bus API. The library can open the device directly for standalone scripts. It refuses to do so while animatrixd or asusd is running, unless forced.

## Packages

| Package                                               | Role                                                                                                                                                                                                                             | I/O                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `packages/core` (`@anshmehta7x/animatrix-core`)       | Model profiles (data), lattice geometry, greyscale `Canvas` with pixel fonts, planar and diagonal mapping, safe-area computation, tone and dither, packet encoding, built-in selection bits, typed errors, the test pattern      | none                                |
| `packages/effects` (`@anshmehta7x/animatrix-effects`) | The `Effect` plugin contract, the `Runner` (fps cap, idling, dedupe), media decoding (sharp, ffmpeg), system-font text, services (audio, MPRIS, stats), and the built-in effects                                                 | files, child processes, session bus |
| `packages/animatrix` (`@anshmehta7x/animatrix`)       | Public library: transports (hidraw via node-hid, libusb via usb@2, `MockTransport`), `AnimeDevice` (mode tracking), `Matrix` facade (daemon or direct backend), `DaemonClient`. `…/client` is a native-free subpath for Electron | device, session bus                 |
| `packages/daemon` (`animatrixd`)                      | `Controller` (content, gates, reconnect), `Policy` (power events, night schedule, playlist), `Flasher`, TOML config, the D-Bus service                                                                                           | device, both buses                  |
| `packages/cli` (`animatrix`)                          | Command-line front end                                                                                                                                                                                                           | via library                         |
| `apps/tray`                                           | Electron main (D-Bus only, no native modules) plus a React renderer (Vite)                                                                                                                                                       | session bus                         |

Dependencies point one way: core ← effects ← animatrix ← daemon, cli. The tray uses core (pure, for the preview geometry) and `@anshmehta7x/animatrix/client`.

## Rendering pipeline

1. An effect draws into a `Canvas`, a plain greyscale raster. Effects never see LED addresses. Each effect gets a context with the canvas size, the mapping mode, `safe` (the largest fully visible rectangle) and `visible` (a per-pixel mask). The panel has a cut corner, so text and meters lay out inside `safe`.
2. The `Runner` calls `render(t, canvas)` at the effect's fps, capped by the profile's measured ceiling (30 fps). A render can return `{ changed: false }`, a per-frame `delay` (GIFs), or `done`. Effects with `fps: 0` render once and the runner idles.
3. The `Mapper` turns the canvas into an LED frame:
   - **planar**: each LED averages a 3×3 supersampled footprint at its real position (in cm) on a square-pixel canvas (68×44 on GA402).
   - **diagonal**: G-Helper's 45° mode. The staggered lattice is a rotated square grid, so one canvas pixel maps to exactly one LED (64×39 on GA402).
4. Identical consecutive frames are dropped, so static content costs nothing after the first write.
5. The daemon applies software brightness, night dimming and gamma through a LUT, skips writes while a power gate is active, and hands the frame to `AnimeDevice`.
6. `AnimeDevice` sends the mode setup (`init`, `C4 01 80`, `C3 01 00`, `C0 04 n`) once per session, then 3 × `C0 02` panes plus `C0 03` per frame. Writes are serialised so frames never interleave.

## Daemon state machine

`Controller` holds the current **content**: `idle`, `builtins`, a raw `frame`, or an `effect` with params and an optional scene name. It also holds a set of **gates** (`sleep`, `lid`, `battery`, `user`). Any gate turns the display off (`C3 01 80`) and pauses writes. Clearing the last gate re-applies the content.

- **Reconnect:** a transport error closes the device, marks the controller disconnected and retries every 5 s. On reconnect the content is re-applied. Unsupported models are not retried.
- **Policy:**
  - UPower `OnBattery` / `LidIsClosed` changes set or clear the battery and lid gates. These arrive as PropertiesChanged signals; nothing is polled.
  - logind `PrepareForSleep` / `PrepareForShutdown` trigger the configured action: firmware built-ins, off, a scene streamed for 1.5 s, or keep.
  - A delay inhibitor taken through `systemd-inhibit` gives the daemon time to act. dbus-next cannot receive the fd that `Inhibit()` returns.
  - On resume the daemon re-sends the handshake and restores the content.
  - The night-dim schedule checks once a minute. The playlist rotates saved scenes.

## Tray

The Electron main process keeps a `DaemonLink`. It watches `NameOwnerChanged` for the daemon's name and connects whenever the daemon appears. While the panel is visible it renews a preview lease every 4 s; the daemon then emits `Preview(ay)` signals throttled to 15 fps. The renderer draws the lattice with the same core `Lattice` the daemon maps with, so dot positions are real.

The renderer never touches Node. It calls a typed `window.animatrix` bridge (preload, context isolation, sandbox), and errors cross IPC as `{ code, message, hint }`. Effect settings pages are generated from each effect's params schema. Optional `visibleWhen` hints hide fields that don't apply.

## Design decisions

- **TypeScript everywhere, no Rust or C.** node-hid and usb ship prebuilt N-API binaries.
- **hidraw first.** It is verified working on this kernel, contradicting asusctl's "not HID" note. libusb is a fallback; it detaches the kernel driver and reattaches it on close, and never resets the device.
- **JSON-in-strings on D-Bus** for complex values, so Python and busctl need no custom marshalling. Simple values (brightness, booleans, frames) use native D-Bus types.
- **Pane skipping is off by default.** The firmware may not keep untouched panes between flushes, which is unverified. `skipUnchangedPanes` exists for experiments.
- **Notification text is off by default.** The lid faces other people.
- **No polling where events exist.** UPower, logind, MPRIS, the daemon's bus name, the tray host and default-sink changes (`pactl subscribe`) are all event-driven. CPU and RAM statistics are sampled once a second, and only while the stats effect runs.
