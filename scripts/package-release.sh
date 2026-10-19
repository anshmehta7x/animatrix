#!/usr/bin/env bash
# Build a self-contained release tarball: dist/animatrix-<version>-linux-x64.tar.gz
# Contents: deployed daemon/cli/tray (with Electron and native modules),
# launchers, udev rule, systemd unit, desktop entry, icons, uninstall.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(node -p 'require("./package.json").version')}"
NODE_VERSION="$(node -p 'process.version')"
ARCH="linux-x64"
NAME="animatrix-${VERSION}-${ARCH}"
OUT="$PWD/dist"
STAGE="$OUT/$NAME"

[ "$(uname -m)" = "x86_64" ] || { echo "release builds are x86_64 only" >&2; exit 1; }

echo "==> building ($VERSION, for Node $NODE_VERSION)"
pnpm install --frozen-lockfile
pnpm build
pnpm -C apps/tray build

rm -rf "$STAGE" && mkdir -p "$STAGE"/{bin,lib,share}
echo "==> deploying packages"
pnpm --filter @anshmehta7x/animatrixd deploy --legacy --prod "$STAGE/lib/daemon" >/dev/null
pnpm --filter @anshmehta7x/animatrix-cli deploy --legacy --prod "$STAGE/lib/cli" >/dev/null
pnpm --filter @anshmehta7x/animatrix-tray deploy --legacy --prod "$STAGE/lib/tray" >/dev/null
# Stamp the release version (the tag) into what the daemon, CLI and tray report.
for p in daemon cli tray; do
  node -e 'const f=process.argv[1],j=require(f);j.version=process.argv[2];require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")' \
    "$STAGE/lib/$p/package.json" "$VERSION"
done
if [ ! -x "$STAGE/lib/tray/node_modules/electron/dist/electron" ]; then
  (cd "$STAGE/lib/tray/node_modules/electron" && node install.js)
fi

# Electron's Chromium UI locales are unused (the panel is English); keep en-US only.
find "$STAGE/lib/tray/node_modules/.pnpm/" -path "*electron/dist/locales/*.pak" ! -name "en-US.pak" -delete

echo "==> pruning"
for app in daemon cli tray; do
  M="$STAGE/lib/$app/node_modules/.pnpm"
  # Native prebuilds for other platforms, and the C sources they were built from.
  find "$M" -path "*/node-hid/prebuilds/*" -maxdepth 5 -type d ! -name "HID-linux-x64" ! -name "HID_hidraw-linux-x64" -prune -exec rm -rf {} +
  find "$M" -path "*/usb/prebuilds/*" -maxdepth 5 -type d ! -name "linux-x64" -prune -exec rm -rf {} +
  rm -rf "$M"/node-hid@*/node_modules/node-hid/{hidapi,src} "$M"/usb@*/node_modules/usb/{libusb,src}
  # Type declarations and docs aren't needed at runtime.
  rm -rf "$M"/@types+*
  find "$M" -type f \( -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" -o -name "*.map" -o -iname "README*" -o -iname "CHANGELOG*" \) -delete
done
# Chromium's licence file must ship, but it compresses from 20 MB to under 2.
gzip -9 "$STAGE"/lib/tray/node_modules/.pnpm/electron@*/node_modules/electron/dist/LICENSES.chromium.html

# Node isn't bundled: install.sh uses the system Node when it's new enough and otherwise
# downloads this exact version from nodejs.org (verified against its SHASUMS256.txt).
echo "${NODE_VERSION#v}" > "$STAGE/NODE_VERSION"

echo "==> launchers and data files"
for b in animatrixd animatrix animatrix-tray; do
  install -m 755 packaging/release/bin-template.sh "$STAGE/bin/$b"
done
install -m 644 packaging/udev/70-animatrix.rules "$STAGE/share/70-animatrix.rules"
install -m 644 packaging/systemd/animatrixd.service.in "$STAGE/share/animatrixd.service.in"
install -m 644 packaging/desktop/animatrix.desktop.in "$STAGE/share/animatrix.desktop.in"
install -m 644 apps/tray/assets/icon-256.png "$STAGE/share/animatrix.png"
install -m 644 apps/tray/assets/icon.svg "$STAGE/share/animatrix.svg"
install -m 755 packaging/release/uninstall.sh "$STAGE/uninstall.sh"
install -m 644 LICENSE NOTICE README.md "$STAGE/"
echo "$VERSION" > "$STAGE/VERSION"

echo "==> smoke test"
# Loads core, effects (sharp) and the library, then enumerates through the pruned native HID
# and USB modules (read-only). Uses the build Node through the same link the installer makes.
mkdir -p "$STAGE/node/bin" && ln -sf "$(command -v node)" "$STAGE/node/bin/node"
"$STAGE/bin/animatrix" builtins list >/dev/null
LIBPKG="$(readlink -f "$STAGE/lib/daemon/node_modules/@anshmehta7x/animatrix/package.json")"
node -e "const r=require('module').createRequire('$LIBPKG'); r('node-hid').devices(); r('usb').getDeviceList(); r('dbus-next')"
rm -rf "$STAGE/node"
[ -x "$STAGE/lib/tray/node_modules/electron/dist/electron" ]

echo "==> packing"
tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
du -h "$OUT/$NAME.tar.gz" | cut -f1 | xargs echo "    size:"
echo "$OUT/$NAME.tar.gz"
