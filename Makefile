# animatrix — build and install.
#
#   make                 build everything
#   make install         install to ~/.local (user) — no root needed
#   sudo make install-udev   install the udev rule (needed once, for device access)
#   make enable          enable + start the animatrixd user service
#   make uninstall
#
# Distro packaging: make install PREFIX=/usr DESTDIR=$pkgdir USERUNITDIR=/usr/lib/systemd/user

PREFIX      ?= $(HOME)/.local
BINDIR      ?= $(PREFIX)/bin
LIBDIR      ?= $(PREFIX)/lib/animatrix
DATADIR     ?= $(PREFIX)/share
USERUNITDIR ?= $(if $(filter $(HOME)/%,$(PREFIX)),$(HOME)/.config/systemd/user,$(PREFIX)/lib/systemd/user)
UDEVDIR     ?= /etc/udev/rules.d
NODE        ?= $(shell command -v node)
DESTDIR     ?=

SUBST = sed -e 's|@NODE@|$(NODE)|g' -e 's|@LIBDIR@|$(LIBDIR)|g' -e 's|@BINDIR@|$(BINDIR)|g'

.PHONY: all build test lint install install-udev enable disable uninstall clean

all: build

build:
	pnpm install --frozen-lockfile
	pnpm build
	pnpm -C apps/tray build

test:
	pnpm test

lint:
	pnpm typecheck && pnpm lint && pnpm format:check

install: build
	@test -n "$(NODE)" || { echo "node not found; pass NODE=/path/to/node"; exit 1; }
	rm -rf "$(DESTDIR)$(LIBDIR)"
	mkdir -p "$(DESTDIR)$(LIBDIR)" "$(DESTDIR)$(BINDIR)" "$(DESTDIR)$(USERUNITDIR)" \
	  "$(DESTDIR)$(DATADIR)/applications" "$(DESTDIR)$(DATADIR)/icons/hicolor/256x256/apps" \
	  "$(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps"
	pnpm --filter @anshmehta7x/animatrixd deploy --legacy --prod "$(DESTDIR)$(LIBDIR)/daemon"
	pnpm --filter @anshmehta7x/animatrix-cli deploy --legacy --prod "$(DESTDIR)$(LIBDIR)/cli"
	pnpm --filter @anshmehta7x/animatrix-tray deploy --legacy --prod "$(DESTDIR)$(LIBDIR)/tray"
	@test -x "$(DESTDIR)$(LIBDIR)/tray/node_modules/electron/dist/electron" || \
	  (cd "$(DESTDIR)$(LIBDIR)/tray/node_modules/electron" && "$(NODE)" install.js)
	for b in animatrixd animatrix animatrix-tray; do \
	  $(SUBST) packaging/bin/$$b.in > "$(DESTDIR)$(BINDIR)/$$b"; chmod 755 "$(DESTDIR)$(BINDIR)/$$b"; done
	$(SUBST) packaging/systemd/animatrixd.service.in > "$(DESTDIR)$(USERUNITDIR)/animatrixd.service"
	$(SUBST) packaging/desktop/animatrix.desktop.in > "$(DESTDIR)$(DATADIR)/applications/animatrix.desktop"
	install -m 644 apps/tray/assets/icon-256.png "$(DESTDIR)$(DATADIR)/icons/hicolor/256x256/apps/animatrix.png"
	install -m 644 apps/tray/assets/icon.svg "$(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/animatrix.svg"
	@if [ -z "$(DESTDIR)" ]; then systemctl --user daemon-reload || true; \
	  systemctl --user try-restart animatrixd || true; fi
	@echo
	@echo "Installed. Next steps:"
	@echo "  sudo make install-udev     # once, for device access"
	@echo "  make enable                # start animatrixd now and at login"
	@echo "  animatrix-tray             # open the panel"

install-udev:
	install -D -m 644 packaging/udev/70-animatrix.rules "$(DESTDIR)$(UDEVDIR)/70-animatrix.rules"
	@if [ -z "$(DESTDIR)" ]; then udevadm control --reload && udevadm trigger --subsystem-match=hidraw --subsystem-match=usb; fi

enable:
	systemctl --user enable --now animatrixd

disable:
	systemctl --user disable --now animatrixd || true

uninstall: disable
	rm -rf "$(DESTDIR)$(LIBDIR)"
	rm -f "$(DESTDIR)$(BINDIR)/animatrixd" "$(DESTDIR)$(BINDIR)/animatrix" "$(DESTDIR)$(BINDIR)/animatrix-tray"
	rm -f "$(DESTDIR)$(USERUNITDIR)/animatrixd.service" "$(DESTDIR)$(DATADIR)/applications/animatrix.desktop"
	rm -f "$(DESTDIR)$(DATADIR)/icons/hicolor/256x256/apps/animatrix.png" "$(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/animatrix.svg"
	@echo "Config in ~/.config/animatrix and the udev rule are left in place."

clean:
	rm -rf packages/*/dist apps/tray/dist apps/tray/dist-electron packages/*/tsconfig.tsbuildinfo
