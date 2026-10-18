/**
 * Live preview of the real LED lattice, drawn from the same core geometry the daemon maps with,
 * so what you see is what the lid shows (subject to the orientation caveat in the docs).
 * Media files can be dropped onto it.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { latticeFor, profileById } from "@anshmehta7x/animatrix-core";
import { bridge, call, effectForFile } from "../lib/api";
import { useStore } from "../lib/store";
import styles from "./Preview.module.css";

const WIDTH = 376;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Preview({
  onDropped,
  compact = false,
}: {
  onDropped(effect: string): void;
  compact?: boolean;
}): ReactNode {
  const { snap, state, run } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<Uint8Array | null>(null);
  const [dragging, setDragging] = useState(false);
  const profile = useMemo(() => profileById(snap?.info?.model ?? "GA402"), [snap?.info?.model]);
  const lattice = useMemo(() => (profile ? latticeFor(profile) : null), [profile]);
  const height = lattice ? Math.round((WIDTH * lattice.heightCm) / lattice.widthCm) : 240;
  const lit = Boolean(state?.connected && !state.gate);
  const level = state?.hardwareBrightness ?? 3;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !lattice || !profile) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = WIDTH * dpr;
    el.height = height * dpr;
    glow.current ??= document.createElement("canvas");
    glow.current.width = el.width;
    glow.current.height = el.height;
    const scale = (WIDTH / lattice.widthCm) * dpr;
    const r =
      Math.min(profile.pitchCm.x / 2, Math.hypot(profile.pitchCm.x / 2, profile.pitchCm.y)) *
      0.42 *
      scale;
    let raf = 0;
    const draw = (): void => {
      const ctx = el.getContext("2d")!;
      const g = glow.current!.getContext("2d")!;
      ctx.clearRect(0, 0, el.width, el.height);
      g.clearRect(0, 0, el.width, el.height);
      const off = cssVar("--led-off");
      const on = cssVar("--led-on");
      const f = frame.current;
      for (const led of lattice.leds) {
        const x = (led.xCm + profile.pitchCm.x / 2) * scale;
        const y = (led.yCm + profile.pitchCm.y / 2) * scale;
        const raw = lit && f ? (f[led.index] ?? 0) : 0;
        const v = raw <= 3 ? 0 : Math.pow(raw / 255, 0.6) * (level === 0 ? 0 : 0.45 + level * 0.18);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = off;
        ctx.fill();
        if (v > 0) {
          ctx.globalAlpha = Math.min(1, v);
          ctx.fillStyle = on;
          ctx.fill();
          g.globalAlpha = Math.min(1, v);
          g.fillStyle = cssVar("--led-glow");
          g.beginPath();
          g.arc(x, y, r * 1.6, 0, Math.PI * 2);
          g.fill();
          ctx.globalAlpha = 1;
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${3 * dpr}px)`;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glow.current!, 0, 0);
      ctx.restore();
    };
    const schedule = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const offPreview = bridge().onPreview((f) => {
      frame.current = f;
      schedule();
    });
    if (snap?.daemon) {
      void (call("frame") as Promise<Uint8Array>)
        .then((f) => {
          if (f.length) frame.current = f;
          schedule();
        })
        .catch(() => undefined);
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", schedule);
    schedule();
    return () => {
      offPreview();
      mq.removeEventListener("change", schedule);
      cancelAnimationFrame(raf);
    };
  }, [lattice, profile, height, lit, level, snap?.daemon]);

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const path = bridge().pathForFile(file);
    const effect = effectForFile(path);
    void run(() => call("play", effect, { file: path }));
    onDropped(effect);
  };

  return (
    <div
      className={`${styles.lid} ${dragging ? styles.dragging : ""}`}
      style={{ width: compact ? WIDTH / 2 : WIDTH, height: compact ? height / 2 : height }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-label="Live preview of the AniMe Matrix"
      role="img"
    >
      <canvas ref={canvas} className={styles.canvas} />
      {dragging && <div className={styles.dropHint}>Drop to show on the lid</div>}
    </div>
  );
}
