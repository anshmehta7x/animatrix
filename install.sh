#!/usr/bin/env bash
# animatrix installer: downloads the latest self-contained release and installs it for this user.
#
#   curl -fsSL https://raw.githubusercontent.com/anshmehta7x/animatrix/main/install.sh | bash
#
# Options (environment variables):
#   ANIMATRIX_VERSION=v0.2.0   install a specific release tag instead of the latest
#   ANIMATRIX_TARBALL=path     install from a local release tarball (no download)
#   GITHUB_TOKEN=...           needed while the repository is private
#   ANIMATRIX_PREFIX=~/.local  install prefix (default ~/.local)
#   ANIMATRIX_NO_UDEV=1        skip the udev rule (no sudo)
#   ANIMATRIX_NO_ENABLE=1      don't enable/start the daemon or autostart the tray
set -euo pipefail

REPO="anshmehta7x/animatrix"
PREFIX="${ANIMATRIX_PREFIX:-$HOME/.local}"
DEST="$PREFIX/lib/animatrix"
UNITDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UDEV_RULE=/etc/udev/rules.d/70-animatrix.rules

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- checks
[ "$(uname -s)" = "Linux" ] || die "animatrix only runs on Linux."
[ "$(uname -m)" = "x86_64" ] || die "release builds are x86_64 only (found $(uname -m))."
[ "$(id -u)" -ne 0 ] || die "run this as your normal user, not root (it asks for sudo when needed)."
for tool in curl tar sha256sum; do have "$tool" || die "$tool is required."; done

bold "animatrix installer"
MODEL="$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo unknown)"
info "laptop: $MODEL"
found_device=0
for d in /sys/bus/usb/devices/*; do
  if [ "$(cat "$d/idVendor" 2>/dev/null)" = 0b05 ] && [ "$(cat "$d/idProduct" 2>/dev/null)" = 193b ]; then
    found_device=1
  fi
done
[ "$found_device" = 1 ] || warn "no AniMe Matrix USB device (0b05:193b) found. Installing anyway."
case "$MODEL" in
  *GA403*|*GU605*|*GA605*|*GA405*|*GU405*|*GU606*|*GX651*|*G614F*)
    die "$MODEL has Slash Lighting, not an AniMe Matrix. animatrix doesn't support it." ;;
esac

# ---------------------------------------------------------------- fetch
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# api <accept-type> <url> [curl args...]: GitHub API request, authenticated if GITHUB_TOKEN is set.
api() {
  local accept="$1"
  shift
  local auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL "${auth[@]}" -H "Accept: $accept" "$@"
}

if [ -n "${ANIMATRIX_TARBALL:-}" ]; then
  TARBALL="$ANIMATRIX_TARBALL"
  [ -f "$TARBALL" ] || die "no such file: $TARBALL"
  info "using local tarball $TARBALL"
else
  TAG="${ANIMATRIX_VERSION:-latest}"
  if [ "$TAG" = latest ]; then URL="https://api.github.com/repos/$REPO/releases/latest"
  else URL="https://api.github.com/repos/$REPO/releases/tags/$TAG"; fi
  info "looking up release ($TAG)"
  RELEASE="$(api application/vnd.github+json "$URL")" || die "could not read the release from GitHub. If the repo is private, set GITHUB_TOKEN (e.g. GITHUB_TOKEN=\$(gh auth token))."
  # Pick the tarball and checksum asset API URLs without needing jq.
  # Each asset object lists its API "url" before its "name"; remember the last asset URL seen.
  asset_url() {
    printf '%s' "$RELEASE" | tr ',{' '\n\n' | awk -v want="\"name\":\"$1\"" '
      /\/releases\/assets\/[0-9]+"/ { match($0, /https:[^"]*\/releases\/assets\/[0-9]+/); last = substr($0, RSTART, RLENGTH) }
      { line = $0; gsub(/[ \t]/, "", line) }
      index(line, want) { print last; exit }'
  }
  NAME="$(printf '%s' "$RELEASE" | grep -o 'animatrix-[^"]*-linux-x64\.tar\.gz' | head -1)"
  [ -n "$NAME" ] || die "the release has no linux-x64 tarball."
  TAR_URL="$(asset_url "$NAME")"
  SUM_URL="$(asset_url "$NAME.sha256")"
  info "downloading $NAME"
  api application/octet-stream "$TAR_URL" -o "$WORK/$NAME"
  api application/octet-stream "$SUM_URL" -o "$WORK/$NAME.sha256"
  (cd "$WORK" && sha256sum -c --quiet "$NAME.sha256") || die "checksum mismatch; download corrupted."
  TARBALL="$WORK/$NAME"
fi

tar -xzf "$TARBALL" -C "$WORK"
SRC="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'animatrix-*' | head -1)"
[ -n "$SRC" ] && [ -x "$SRC/bin/animatrixd" ] || die "tarball doesn't look like an animatrix release."
VERSION="$(cat "$SRC/VERSION")"

# ---------------------------------------------------------------- install files
bold "installing animatrix $VERSION to $DEST"
systemctl --user stop animatrixd 2>/dev/null || true
pkill -f "$DEST/" 2>/dev/null || true  # tray (any layout)
rm -rf "$DEST.new" && mv "$SRC" "$DEST.new"
rm -rf "$DEST" && mv "$DEST.new" "$DEST"

mkdir -p "$PREFIX/bin" "$UNITDIR" "$PREFIX/share/applications" \
  "$PREFIX/share/icons/hicolor/256x256/apps" "$PREFIX/share/icons/hicolor/scalable/apps"
for b in animatrixd animatrix animatrix-tray; do ln -sf "$DEST/bin/$b" "$PREFIX/bin/$b"; done
sed "s|@BINDIR@|$PREFIX/bin|g" "$DEST/share/animatrixd.service.in" > "$UNITDIR/animatrixd.service"
sed "s|@BINDIR@|$PREFIX/bin|g" "$DEST/share/animatrix.desktop.in" > "$PREFIX/share/applications/animatrix.desktop"
cp "$DEST/share/animatrix.png" "$PREFIX/share/icons/hicolor/256x256/apps/animatrix.png"
cp "$DEST/share/animatrix.svg" "$PREFIX/share/icons/hicolor/scalable/apps/animatrix.svg"
info "commands: animatrix, animatrixd, animatrix-tray (in $PREFIX/bin)"

# ---------------------------------------------------------------- udev (needs sudo once)
if [ "${ANIMATRIX_NO_UDEV:-0}" = 1 ]; then
  info "skipping the udev rule (ANIMATRIX_NO_UDEV=1)"
elif cmp -s "$DEST/share/70-animatrix.rules" "$UDEV_RULE"; then
  info "udev rule already installed"
else
  bold "device access needs a udev rule (one-time, asks for your password)"
  UDEV_CMD="sudo install -m 644 $DEST/share/70-animatrix.rules $UDEV_RULE && sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=hidraw --subsystem-match=usb"
  if [ -r /dev/tty ] && sudo -v </dev/tty; then
    sudo install -m 644 "$DEST/share/70-animatrix.rules" "$UDEV_RULE"
    sudo udevadm control --reload
    sudo udevadm trigger --subsystem-match=hidraw --subsystem-match=usb
    info "udev rule installed"
  else
    warn "couldn't ask for sudo here. Run this yourself:"
    printf '\n    %s\n\n' "$UDEV_CMD"
  fi
fi

# ---------------------------------------------------------------- services
systemctl --user daemon-reload 2>/dev/null || true
if [ "${ANIMATRIX_NO_ENABLE:-0}" = 1 ]; then
  info "not enabling services (ANIMATRIX_NO_ENABLE=1)"
else
  if systemctl --user enable --now animatrixd >/dev/null 2>&1; then
    info "animatrixd running and enabled at login"
  else
    warn "couldn't start the user service; start it with: systemctl --user enable --now animatrixd"
  fi
  mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
  cat > "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/animatrix-tray.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=animatrix
Comment=AniMe Matrix control panel
Exec=$PREFIX/bin/animatrix-tray --hidden
Icon=animatrix
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
  if [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
    (setsid "$PREFIX/bin/animatrix-tray" --hidden >/dev/null 2>&1 &) || true
  fi
  info "tray app starts at login"
fi

# ---------------------------------------------------------------- hints
if have systemctl && systemctl is-active --quiet asusd 2>/dev/null; then
  warn "asusd is running and claims the AniMe device. Stop it to use animatrix: sudo systemctl stop asusd"
fi
case ":$PATH:" in *":$PREFIX/bin:"*) ;; *) warn "$PREFIX/bin isn't on your PATH; add it to use the animatrix command." ;; esac
if [ "${XDG_CURRENT_DESKTOP:-}" != "${XDG_CURRENT_DESKTOP/GNOME/}" ] &&
  ! (have gnome-extensions && gnome-extensions list --enabled 2>/dev/null | grep -q appindicator); then
  warn "GNOME has no tray by default. For the tray icon install gnome-shell-extension-appindicator,"
  warn "log out and back in, then: gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com"
fi

bold "done"
info "open the panel:  animatrix-tray   (or find 'animatrix' in your apps)"
info "check status:    animatrix status"
info "uninstall:       $DEST/uninstall.sh"
