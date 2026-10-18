/**
 * Direct manipulation of media on the preview: drag to pan, wheel to zoom, Shift+wheel to
 * rotate, double-click to reset. Updates are throttled and sent as `play` calls, which the daemon
 * applies in place (no re-decode).
 */
import { useCallback, useEffect, useRef, type PointerEvent, type WheelEvent } from "react";
import { call } from "./api";
import { useStore } from "./store";

const MEDIA = new Set(["image", "gif", "video"]);
const SEND_EVERY_MS = 40;

interface Placement {
  panX: number;
  panY: number;
  scale: number;
  rotate: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface PlacementGestures {
  active: boolean;
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerMove(e: PointerEvent<HTMLElement>): void;
  onPointerUp(e: PointerEvent<HTMLElement>): void;
  onWheel(e: WheelEvent<HTMLElement>): void;
  onDoubleClick(): void;
}

export function usePlacementGestures(): PlacementGestures {
  const { state, run } = useStore();
  const effect = state?.effect ?? null;
  const active = Boolean(effect && MEDIA.has(effect) && state?.content === "effect");
  const params = useRef<Record<string, unknown>>({});
  const place = useRef<Placement>({ panX: 0, panY: 0, scale: 1, rotate: 0 });
  const drag = useRef<{ x: number; y: number; w: number; h: number; from: Placement } | null>(null);
  const timer = useRef<number | null>(null);
  const interacting = useRef(false);

  // Follow the daemon's params, except while the user is mid-gesture.
  useEffect(() => {
    if (!active || interacting.current) return;
    const p = state?.params ?? {};
    params.current = p;
    place.current = {
      panX: Number(p.panX ?? 0),
      panY: Number(p.panY ?? 0),
      scale: Number(p.scale ?? 1),
      rotate: Number(p.rotate ?? 0),
    };
  }, [active, state?.params]);

  const send = useCallback(() => {
    if (timer.current !== null || !effect) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const next = { ...params.current, ...place.current };
      params.current = next;
      void run(() => call("play", effect, next));
    }, SEND_EVERY_MS);
  }, [effect, run]);

  const settle = (): void => {
    window.setTimeout(() => (interacting.current = false), SEND_EVERY_MS * 3);
  };

  return {
    active,
    onPointerDown(e) {
      if (!active || e.button !== 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        w: r.width,
        h: r.height,
        from: { ...place.current },
      };
      interacting.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already-released pointer
      }
    },
    onPointerMove(e) {
      const d = drag.current;
      if (!d) return;
      place.current = {
        ...place.current,
        panX: clamp(d.from.panX + (e.clientX - d.x) / d.w, -1, 1),
        panY: clamp(d.from.panY + (e.clientY - d.y) / d.h, -1, 1),
      };
      send();
    },
    onPointerUp(e) {
      if (!drag.current) return;
      drag.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // not captured
      }
      send();
      settle();
    },
    onWheel(e) {
      if (!active) return;
      interacting.current = true;
      const p = place.current;
      place.current = e.shiftKey
        ? { ...p, rotate: ((((p.rotate + e.deltaY * 0.15 + 180) % 360) + 360) % 360) - 180 }
        : { ...p, scale: clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.1, 8) };
      send();
      settle();
    },
    onDoubleClick() {
      if (!active) return;
      place.current = { panX: 0, panY: 0, scale: 1, rotate: 0 };
      send();
    },
  };
}
