# animatrix: AniMe Matrix control for Linux

[Website](https://anshmehta7x.github.io/animatrix/) · [Releases](https://github.com/anshmehta7x/animatrix/releases) · [D-Bus API](docs/dbus-api.md)

Control the **ASUS ROG AniMe Matrix** LED display on the lid of the ROG Zephyrus G14 and G16 from Linux. Show images, GIFs, video, text, clocks, a music visualiser, generative effects and the firmware's own animations. It's an open-source Linux alternative to the AniMe Matrix controls in Armoury Crate and G-Helper, and it needs neither Windows tools nor asusd.

<p><img src="docs/images/gallery.png" alt="The animatrix panel showing matrix rain, the music visualiser, an image being placed, and the clock, each on a live preview of the AniMe Matrix LED lattice" /></p>

It comes in four parts:

- **`animatrixd`**: a small daemon, the only process that writes to the device. It runs as a systemd user service and exposes a D-Bus API.
- **A tray app**: a compact 400×600 panel with a live preview of the real LED lattice.
- **`animatrix`**: a command-line tool.
- **`@anshmehta7x/animatrix`**: a TypeScript library for your own scripts.

| Model                                          | Status                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Zephyrus G14 2022/2023 (GA402R/X/N)            | **Tested on a GA402XU** for the transport, frame timing, daemon, CLI and tray. Orientation and brightness confirmed by eye; see [hardware notes](docs/hardware-notes.md) |
| Zephyrus G14 2020/21 (GA401), G16 2023 (GU604) | Profiles from G-Helper and asusctl data, **untested**                                                                                                                    |
| Slash Lighting laptops (GA403, GU605, …)       | Refused: same USB ID, different hardware                                                                                                                                 |

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/anshmehta7x/animatrix/main/install.sh | bash
```

This downloads a self-contained release (it bundles its own Node.js and Electron) into `~/.local`, and asks for your password once to install the udev rule. It then starts the `animatrixd` user service and adds the tray to your login items. Run the same line again to update. To remove everything, run `~/.local/lib/animatrix/uninstall.sh` (add `--purge` to delete your config too).

Video playback needs `ffmpeg`. The visualiser needs PipeWire's `pw-record` or PulseAudio's `parec`. Most desktops already have both.

### Build from source

You need Node.js ≥ 22, pnpm (`corepack enable`) and ffmpeg (for video). The visualiser needs PipeWire's `pw-record` or PulseAudio's `parec`.

```sh
git clone https://github.com/anshmehta7x/animatrix.git && cd animatrix
make install            # builds and installs to ~/.local (no root)
sudo make install-udev  # once: lets your user open the device
make enable             # start animatrixd now and at every login
animatrix-tray          # open the panel
```

### Device access (udev)

The AniMe Matrix (`0b05:193b`) is root-only by default. [`packaging/udev/70-animatrix.rules`](packaging/udev/70-animatrix.rules) gives the logged-in user access through `uaccess`. If you see _Permission denied_, install it:

```sh
sudo cp packaging/udev/70-animatrix.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger
```

### The tray icon on GNOME

Stock GNOME has no tray. Install the AppIndicator extension, log out and back in (required on Wayland), then enable it:

```sh
sudo dnf install gnome-shell-extension-appindicator        # Fedora
sudo apt install gnome-shell-extension-appindicator        # Debian/Ubuntu
gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
```

Everything also works **without a tray**. Open the panel from the app grid ("animatrix"). Launching it again toggles it, so a keyboard shortcut bound to `animatrix-tray` works as a toggle. The panel shows a one-time hint when no tray host is found.

On Wayland the compositor decides where windows open, so GNOME centres the panel; on X11 it opens next to the tray icon.

### asusd

If `asusd` (asusctl) is running it claims the AniMe device, and animatrix tells you so rather than fighting it. Stop it with `sudo systemctl stop asusd` to use animatrix.

## Command line

```sh
animatrix status
animatrix brightness medium            # hardware level: off | low | medium | high | 0-3
animatrix image cat.png --fit cover --dither floyd-steinberg
animatrix gif loop.gif --speed 1.5
animatrix video clip.mp4 --fps 24
animatrix text "hello" --speed 20
animatrix clock --face analogue
animatrix play visualiser style=spectrum
animatrix builtins --awake rogLogoGlitch --sleep starfield
animatrix scene apply "Matrix rain"
animatrix effects                      # every effect and its parameters
animatrix --direct test-pattern        # bypass the daemon
```

## Library

```ts
import { Matrix } from "@anshmehta7x/animatrix";

const m = await Matrix.open(); // via the daemon if running, else direct
await m.setBrightness("medium");
await m.showImage("cat.png", { fit: "contain" });
await m.playGif("loop.gif");
await m.draw((c) => {
  c.clear();
  c.text(0, 10, "hi");
  c.pixel(5, 5, 255);
});
await m.setBuiltins({ awake: "rogLogoGlitch", sleep: "starfield" });
await m.close();
```

Through the daemon, effects keep running after your script exits. In direct mode (`Matrix.open({ direct: true })`, or when no daemon runs) animations live in your process; `await m.wait()` keeps it alive until a non-looping animation ends. Errors are typed: `DeviceNotFoundError`, `PermissionDeniedError` (its `hint` explains the udev rule), `DeviceBusyError` (`holder` is `"asusd"` or `"animatrixd"`), `UnsupportedModelError`, and so on. They all extend `AnimatrixError`, which has a `code`.

- More examples are in [`examples/`](examples): hello pixel, image, GIF, clock, a custom effect, and [Python over D-Bus](examples/python/dbus_example.py).
- API reference: `pnpm docs:api` generates TypeDoc into `docs/api/`.
- The daemon's D-Bus API is documented in [docs/dbus-api.md](docs/dbus-api.md).

## Configuration

`~/.config/animatrix/config.toml` holds brightness, power policy (off on battery or with the lid closed, what to do on sleep and shutdown), scenes, the playlist, night dimming and notification flash. The tray and `animatrix config set section.key=value` edit it for you.

## Docs

- [Architecture](docs/architecture.md)
- [Protocol summary](docs/protocol.md)
- [Hardware notes](docs/hardware-notes.md)
- [D-Bus API](docs/dbus-api.md)
- [Packaging for distros](docs/packaging.md)
- [Contributing: add an effect or a model](CONTRIBUTING.md)

## FAQ

**How do I control the AniMe Matrix on Linux?**
Install animatrix with the one-line installer above, then open the panel or use `animatrix image cat.png`. It talks to the panel directly over hidraw, so it needs neither Windows, Armoury Crate nor G-Helper.

**Which laptops have an AniMe Matrix?**
The ROG Zephyrus G14 2020/2021 (GA401), the G14 2022/2023 (GA402R, GA402X, GA402N) and the Zephyrus G16 2023 (GU604). Since 2024 the G14 and G16 have _Slash Lighting_ instead (GA403, GU605), which is different hardware and not supported.

**Does it work with asusctl / asusd?**
asusctl handles fans, keyboard lighting and power profiles; keep using it for those. Its daemon, asusd, also claims the AniMe device, so stop asusd while animatrix runs. animatrix detects a running asusd and tells you.

**Can I play a GIF or a video on the lid?**
Yes: `animatrix gif loop.gif` uses each frame's own timing, and `animatrix video clip.mp4` streams through ffmpeg at up to 30 fps (the panel's measured limit).

**Can I write my own animations?**
Yes, with the TypeScript library (`Matrix.run(effect)`), any language over the D-Bus API, or by adding an effect plugin. See [CONTRIBUTING.md](CONTRIBUTING.md).

**What does the AniMe Matrix show while the laptop sleeps or shuts down?**
Its firmware animations (for example "starfield" while asleep and "see ya" on shutdown). Choose them under Built-ins or with `animatrix builtins`.

## Licence

MIT. Protocol facts come from public research on G-Helper, asusctl and Starlight; no code was copied. See [NOTICE](NOTICE). Not affiliated with ASUS.
