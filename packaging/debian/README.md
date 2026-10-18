# Debian / Ubuntu notes

There is no `debian/` directory yet. With debhelper, the important parts are:

- Build-Depends: `nodejs (>= 22)`, `make`. pnpm comes from corepack, and the build needs network access.
- Depends: `nodejs (>= 22)`, `ffmpeg`, `systemd`, `dbus-bin`. Recommends: `pipewire-bin | pulseaudio-utils`. Suggests: `gnome-shell-extension-appindicator`.
- `override_dh_auto_install`:
  `make install PREFIX=/usr DESTDIR=debian/animatrix USERUNITDIR=/usr/lib/systemd/user NODE=/usr/bin/node`
  `make install-udev DESTDIR=debian/animatrix UDEVDIR=/usr/lib/udev/rules.d`
- Use `dh_installsystemduser` for the user unit. Don't auto-enable it.
