#!/usr/bin/env bash
# Remove a release install of animatrix. Keeps ~/.config/animatrix unless --purge is given.
set -euo pipefail
PREFIX="${ANIMATRIX_PREFIX:-$HOME/.local}"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

systemctl --user disable --now animatrixd 2>/dev/null || true
pkill -x -f ".*$PREFIX/lib/animatrix/lib/tray.*" 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/animatrixd.service"
systemctl --user daemon-reload 2>/dev/null || true
rm -f "$PREFIX/bin/animatrixd" "$PREFIX/bin/animatrix" "$PREFIX/bin/animatrix-tray"
rm -f "$PREFIX/share/applications/animatrix.desktop" "$HOME/.config/autostart/animatrix-tray.desktop"
rm -f "$PREFIX/share/icons/hicolor/256x256/apps/animatrix.png" "$PREFIX/share/icons/hicolor/scalable/apps/animatrix.svg"
rm -rf "$PREFIX/lib/animatrix"
[ "$PURGE" = 1 ] && rm -rf "$HOME/.config/animatrix"

echo "animatrix removed."
if [ -f /etc/udev/rules.d/70-animatrix.rules ]; then
  echo "The udev rule is left in place. To remove it:"
  echo "  sudo rm /etc/udev/rules.d/70-animatrix.rules && sudo udevadm control --reload"
fi
