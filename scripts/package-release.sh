#!/usr/bin/env bash
# Build a self-contained release tarball: dist/animatrix-<version>-linux-x64.tar.gz
# Contents: bundled Node runtime, deployed daemon/cli/tray (with Electron and native modules),
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

echo "==> building ($VERSION, bundling Node $NODE_VERSION)"
pnpm install --frozen-lockfile
pnpm build
pnpm -C apps/tray build

rm -rf "$STAGE" && mkdir -p "$STAGE"/{bin,lib,share}
echo "==> deploying packages"
pnpm --filter @anshmehta7x/animatrixd deploy --legacy --prod "$STAGE/lib/daemon" >/dev/null
pnpm --filter @anshmehta7x/animatrix-cli deploy --legacy --prod "$STAGE/lib/cli" >/dev/null
pnpm --filter @anshmehta7x/animatrix-tray deploy --legacy --prod "$STAGE/lib/tray" >/dev/null
if [ ! -x "$STAGE/lib/tray/node_modules/electron/dist/electron" ]; then
  (cd "$STAGE/lib/tray/node_modules/electron" && node install.js)
fi

# Electron's Chromium UI locales are unused (the panel is English); keep en-US only.
find "$STAGE/lib/tray/node_modules/.pnpm/" -path "*electron/dist/locales/*.pak" ! -name "en-US.pak" -delete

echo "==> bundling Node $NODE_VERSION"
NODE_TGZ="node-${NODE_VERSION}-linux-x64.tar.xz"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/animatrix-release"
mkdir -p "$CACHE"
[ -f "$CACHE/$NODE_TGZ" ] || curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_TGZ}" -o "$CACHE/$NODE_TGZ"
mkdir -p "$STAGE/node/bin"
tar -xJf "$CACHE/$NODE_TGZ" -C "$STAGE/node/bin" --strip-components=2 "node-${NODE_VERSION}-linux-x64/bin/node"
tar -xJf "$CACHE/$NODE_TGZ" -C "$CACHE" "node-${NODE_VERSION}-linux-x64/LICENSE"
cp "$CACHE/node-${NODE_VERSION}-linux-x64/LICENSE" "$STAGE/node/LICENSE"

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
# Loads core, effects (sharp) and the library; then the native HID and USB modules.
"$STAGE/bin/animatrix" builtins list >/dev/null
LIBPKG="$(readlink -f "$STAGE/lib/daemon/node_modules/@anshmehta7x/animatrix/package.json")"
"$STAGE/node/bin/node" -e "const r=require('module').createRequire('$LIBPKG'); r('node-hid'); r('usb'); r('dbus-next')"
[ -x "$STAGE/lib/tray/node_modules/electron/dist/electron" ]

echo "==> packing"
tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
du -h "$OUT/$NAME.tar.gz" | cut -f1 | xargs echo "    size:"
echo "$OUT/$NAME.tar.gz"
