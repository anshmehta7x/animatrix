#!/bin/sh
# animatrix launcher (release build). Resolves its own install directory, so the bundle can live
# anywhere. node/bin/node is either a link to the system Node (22+) or a copy the installer
# downloaded.
set -e
SELF="$(readlink -f "$0")"
ROOT="$(dirname "$(dirname "$SELF")")"
case "$(basename "$SELF")" in animatrixd | animatrix)
  if [ ! -x "$ROOT/node/bin/node" ]; then
    echo "animatrix: Node.js not found (was the system nodejs package removed?)." >&2
    echo "Re-run the installer to fix it:" >&2
    echo "  curl -fsSL https://raw.githubusercontent.com/anshmehta7x/animatrix/main/install.sh | bash" >&2
    exit 1
  fi ;;
esac
case "$(basename "$SELF")" in
  animatrixd) exec "$ROOT/node/bin/node" "$ROOT/lib/daemon/dist/main.js" "$@" ;;
  animatrix) exec "$ROOT/node/bin/node" "$ROOT/lib/cli/dist/main.js" "$@" ;;
  animatrix-tray)
    export ANIMATRIX_TRAY_BIN="${ANIMATRIX_TRAY_BIN:-$SELF}"
    exec "$ROOT/lib/tray/node_modules/electron/dist/electron" --ozone-platform-hint=auto "$ROOT/lib/tray" "$@"
    ;;
  *) echo "unknown launcher name: $(basename "$SELF")" >&2; exit 1 ;;
esac
