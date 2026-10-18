#!/bin/sh
# animatrix launcher (release build). Resolves its own install directory, so the bundle can live
# anywhere; uses the bundled Node runtime so system Node versions don't matter.
set -e
SELF="$(readlink -f "$0")"
ROOT="$(dirname "$(dirname "$SELF")")"
case "$(basename "$SELF")" in
  animatrixd) exec "$ROOT/node/bin/node" "$ROOT/lib/daemon/dist/main.js" "$@" ;;
  animatrix) exec "$ROOT/node/bin/node" "$ROOT/lib/cli/dist/main.js" "$@" ;;
  animatrix-tray)
    export ANIMATRIX_TRAY_BIN="${ANIMATRIX_TRAY_BIN:-$SELF}"
    exec "$ROOT/lib/tray/node_modules/electron/dist/electron" --ozone-platform-hint=auto "$ROOT/lib/tray" "$@"
    ;;
  *) echo "unknown launcher name: $(basename "$SELF")" >&2; exit 1 ;;
esac
