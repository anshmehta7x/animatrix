# Packaging

Every distro uses the same layout. `make install` honours `PREFIX`, `DESTDIR`, `USERUNITDIR`, `UDEVDIR` and `NODE`:

| What                                                 | User install (default)                         | Distro package                       |
| ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| App files (daemon, CLI, tray with Electron)          | `~/.local/lib/animatrix/{daemon,cli,tray}`     | `/usr/lib/animatrix/...`             |
| Wrappers `animatrixd`, `animatrix`, `animatrix-tray` | `~/.local/bin`                                 | `/usr/bin`                           |
| systemd **user** unit `animatrixd.service`           | `~/.config/systemd/user`                       | `/usr/lib/systemd/user`              |
| Desktop entry and icon                               | `~/.local/share/{applications,icons}`          | `/usr/share/...`                     |
| udev rule `70-animatrix.rules`                       | `sudo make install-udev` → `/etc/udev/rules.d` | `/usr/lib/udev/rules.d` (`UDEVDIR=`) |

```sh
make install PREFIX=/usr DESTDIR="$pkgdir" USERUNITDIR=/usr/lib/systemd/user NODE=/usr/bin/node
make install-udev DESTDIR="$pkgdir" UDEVDIR=/usr/lib/udev/rules.d
```

Notes for packagers:

- **Node.** The wrappers pin `NODE` because systemd user units don't see shell PATH tweaks such as nvm. The native modules (node-hid, usb, sharp) use Node-API, so any Node ≥ 22 runs them.
- **Runtime dependencies:** nodejs ≥ 22, ffmpeg (video), pipewire-utils or pulseaudio-utils (visualiser), dbus (`dbus-monitor` for the optional notification flash), systemd (`systemd-inhibit`), and libudev (node-hid).
- **No distro-specific code paths.** Detection uses DMI sysfs, `/proc` and D-Bus only.
- Users enable the service themselves (`systemctl --user enable --now animatrixd`). Don't enable it globally; a laptop without an AniMe Matrix would log "unsupported model" and do nothing.
- The tray bundles Electron. A distro could use its system Electron instead by pointing `animatrix-tray` at it, if the version is ≥ 33.

## Release tarball and one-line installer

`scripts/package-release.sh <version>` builds `dist/animatrix-<version>-linux-x64.tar.gz` (about 130 MB). The tag workflow builds it, runs the e2e suite against the packed bundle, and publishes it with a `.sha256`.

- **Contents:** the deployed daemon, CLI and tray (with Electron), the launchers, the udev rule, the unit and desktop templates, icons and `uninstall.sh`. Other platforms' native prebuilds, C sources, type declarations and source maps are pruned, and Chromium's licence file is gzipped.
- **Node isn't bundled.** `install.sh` links `node/bin/node` to the first Node ≥ 22 it finds: `/usr/bin/node`, `/usr/local/bin/node`, then the `node` on PATH (nvm, fnm), resolved to its real versioned path. Shims (Volta) and temporary per-shell paths are skipped. Otherwise it downloads the version in the tarball's `NODE_VERSION` from nodejs.org and checks it against `SHASUMS256.txt`. `ANIMATRIX_BUNDLE_NODE=1` forces the download.
- If the linked Node disappears later, the launchers say so and point at the installer.

Installed size is about 295 MB with an existing Node, or about 415 MB with a downloaded one. Electron is most of it.

## Fedora (RPM)

[`packaging/fedora/animatrix.spec`](../packaging/fedora/animatrix.spec) is a starting point. It builds with network access (pnpm fetches dependencies), so it targets COPR rather than Fedora proper. Fedora proper would need every npm dependency packaged, which is unrealistic for Electron.

## Arch (PKGBUILD)

[`packaging/arch/PKGBUILD`](../packaging/arch/PKGBUILD) is suitable for the AUR as `animatrix-git`.

## Debian / Ubuntu

There is no `.deb` recipe yet. `make install PREFIX=/usr DESTDIR=debian/animatrix ...` inside a `debhelper` `override_dh_auto_install` works the same way. [`packaging/debian/README.md`](../packaging/debian/README.md) lists the build dependencies.

## Flatpak

**Blocked by device access.** A Flatpak needs `--device=all` to reach `/dev/hidraw*` (there is no finer-grained HID permission). It also can't ship the udev rule, which must be installed on the host. The daemon needs the system bus (UPower, logind) and `systemd-inhibit`, and it should run as a host systemd user service, which Flatpaks can't install. A realistic split would be to Flatpak only the tray, which talks to a host-installed daemon over the session bus with `--talk-name=dev.animatrix.Matrix1`, and ship the daemon natively.
