/** Panel chrome: top controls, notices, navigation grid and drill-down pages. */
import type { ReactNode } from "react";
import { ChevronLeft, Power, Sun, X } from "lucide-react";
import { call } from "../lib/api";
import { useStore } from "../lib/store";
import { Button, Segmented, Slider, Toggle } from "./controls";
import styles from "./Shell.module.css";

export function TopControls(): ReactNode {
  const { state, snap, run } = useStore();
  if (!snap?.daemon || !state) return null;
  const on = state.gate !== "user";
  const name =
    state.content === "builtins"
      ? "Built-in animations"
      : state.content === "frame"
        ? "Custom frame"
        : state.content === "idle"
          ? "Nothing playing"
          : (state.scene ??
            snap.effects.find((e) => e.id === state.effect)?.name ??
            state.effect ??
            "");
  const gateText =
    state.gate && state.gate !== "user"
      ? `Off: ${state.gate === "lid" ? "lid closed" : state.gate === "battery" ? "on battery" : "sleeping"}`
      : null;
  return (
    <div className={styles.top}>
      <div className={styles.statusRow}>
        <div className={styles.status}>
          <span className={styles.nowLabel}>{state.connected ? name : "Device not connected"}</span>
          <span className={styles.nowSub}>
            {gateText ?? (state.connected ? `${snap.info?.modelName ?? ""}` : (state.error ?? ""))}
          </span>
        </div>
        <Power size={15} className={styles.powerIcon} aria-hidden />
        <Toggle
          label="Display"
          checked={on}
          onChange={(v) => void run(() => call("setDisplay", v))}
        />
      </div>
      <div className={styles.brightRow}>
        <Sun size={15} className={styles.sun} aria-hidden />
        <Slider
          label="Brightness"
          min={0}
          max={100}
          value={Math.round(state.softBrightness * 100)}
          onChange={(v) => void run(() => call("setSoftBrightness", v / 100))}
        />
        <Segmented
          label="Hardware level"
          value={state.hardwareBrightness}
          options={[
            { value: 1, label: "Low" },
            { value: 2, label: "Mid" },
            { value: 3, label: "High" },
          ]}
          onChange={(v) => void run(() => call("setBrightness", v))}
        />
      </div>
    </div>
  );
}

export function NoticeBar(): ReactNode {
  const { notice, dismiss, snap, run } = useStore();
  if (snap && !snap.daemon) {
    return (
      <div className={styles.notice}>
        <div>
          <strong>animatrixd isn’t running.</strong>
          <span className={styles.noticeHint}>The panel controls the lid through it.</span>
        </div>
        <Button kind="primary" onClick={() => void run(() => call("startDaemon"))}>
          Start
        </Button>
      </div>
    );
  }
  if (snap?.env.showTrayHint) {
    return (
      <div className={styles.notice}>
        <div>
          <strong>No tray on this desktop.</strong>
          <span className={styles.noticeHint}>
            On GNOME, install gnome-shell-extension-appindicator and log out and back in. The panel
            and the animatrix CLI work without it.
          </span>
        </div>
        <button
          className={styles.close}
          aria-label="Dismiss"
          onClick={() => void call("dismissTrayHint")}
        >
          <X size={14} />
        </button>
      </div>
    );
  }
  if (!notice) return null;
  return (
    <div className={`${styles.notice} ${styles.error}`} role="alert">
      <div>
        <strong>{notice.message}</strong>
        {notice.hint && <span className={styles.noticeHint}>{notice.hint}</span>}
      </div>
      <button className={styles.close} aria-label="Dismiss" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export function NavGrid({
  items,
  onOpen,
}: {
  items: NavItem[];
  onOpen(id: string): void;
}): ReactNode {
  return (
    <nav className={styles.grid}>
      {items.map((it) => (
        <button key={it.id} className={styles.tile} onClick={() => onOpen(it.id)}>
          <span className={styles.tileIcon}>{it.icon}</span>
          <span className={styles.tileLabel}>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Page({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack(): void;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <button className={styles.back} onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <h2 className={styles.pageTitle}>{title}</h2>
      </header>
      <div className={styles.pageBody}>{children}</div>
    </div>
  );
}

/** Connection and device facts, shown under the navigation grid. */
export function StatusFooter(): ReactNode {
  const { snap, state } = useStore();
  const connected = Boolean(snap?.daemon && state?.connected);
  const info = snap?.info;
  const text = !snap?.daemon
    ? "animatrixd not running"
    : connected
      ? `Connected over ${info?.transport ?? "hidraw"}`
      : "Device not connected";
  return (
    <footer className={styles.footer}>
      <span className={styles.footerStatus}>
        <span className={`${styles.dot} ${connected ? styles.dotOn : ""}`} aria-hidden />
        {text}
      </span>
      {info && (
        <span className={styles.footerStats}>
          <span>{info.leds} LEDs</span>
          <span>{state?.fps ? `${state.fps} fps` : "idle"}</span>
        </span>
      )}
    </footer>
  );
}
