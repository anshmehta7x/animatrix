# Sketch for COPR (network access during build). Untested as an RPM build.
Name:           animatrix
Version:        0.1.0
Release:        1%{?dist}
Summary:        Control the ASUS ROG AniMe Matrix lid display
License:        MIT
URL:            https://github.com/anshmehta7x/animatrix
Source0:        %{url}/archive/refs/heads/main.tar.gz#/%{name}-%{version}.tar.gz

BuildRequires:  nodejs >= 22, make, systemd-rpm-macros
Requires:       nodejs >= 22, ffmpeg, systemd, dbus-tools
Recommends:     pipewire-utils
Suggests:       gnome-shell-extension-appindicator
%global debug_package %{nil}
%global __requires_exclude_from ^%{_prefix}/lib/animatrix/.*$

%description
animatrix drives the AniMe Matrix LED display on ROG Zephyrus laptops: images, GIFs, video,
text, clocks, a music visualiser and generative effects, with a daemon (D-Bus API), a CLI,
a tray panel and a TypeScript library.

%prep
%autosetup -n %{name}-main

%build
corepack enable --install-directory %{_builddir}/bin
export PATH=%{_builddir}/bin:$PATH
make build

%install
export PATH=%{_builddir}/bin:$PATH
make install PREFIX=%{_prefix} DESTDIR=%{buildroot} USERUNITDIR=%{_userunitdir} NODE=%{_bindir}/node
make install-udev DESTDIR=%{buildroot} UDEVDIR=%{_udevrulesdir}

%post
%systemd_user_post animatrixd.service
udevadm control --reload >/dev/null 2>&1 || :
udevadm trigger --subsystem-match=hidraw --subsystem-match=usb >/dev/null 2>&1 || :

%preun
%systemd_user_preun animatrixd.service

%files
%license LICENSE NOTICE
%doc README.md
%{_bindir}/animatrix
%{_bindir}/animatrixd
%{_bindir}/animatrix-tray
%{_prefix}/lib/animatrix/
%{_userunitdir}/animatrixd.service
%{_udevrulesdir}/70-animatrix.rules
%{_datadir}/applications/animatrix.desktop
%{_datadir}/icons/hicolor/*/apps/animatrix.*
