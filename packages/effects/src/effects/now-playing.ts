import { bandLeft, centreIn, clipLeft } from "../layout.js";
import { FONT_PARAMS, MAPPING_PARAM, bool, num } from "../params.js";
import type { NowPlaying } from "../services/index.js";
import { TextWriter, fontFromParams } from "../text/writer.js";
import type { Effect } from "../types.js";

/** Title text for a track. */
export function nowPlayingText(np: NowPlaying | null, withArtist: boolean): string {
  if (!np) return "";
  return withArtist && np.artist ? `${np.title} — ${np.artist}` : np.title;
}

/** Scrolls the current MPRIS track title. */
export const nowPlayingEffect: Effect = {
  id: "now-playing",
  name: "Now playing",
  description: "Scrolls the current track from any MPRIS player",
  category: "text",
  fps: 30,
  params: {
    artist: { type: "boolean", label: "Show artist", default: true },
    pausedHide: { type: "boolean", label: "Blank when paused", default: false },
    speed: { type: "number", label: "Speed", min: 2, max: 80, step: 1, unit: "px/s", default: 16 },
    ...FONT_PARAMS,
    ...MAPPING_PARAM,
  },
  create(params, ctx) {
    const writer = new TextWriter(fontFromParams(params));
    const withArtist = bool(params, "artist");
    const pausedHide = bool(params, "pausedHide");
    const speed = num(params, "speed");
    let np: NowPlaying | null = null;
    let since = 0;
    let now = 0;
    const unsub = ctx.services.nowPlaying().subscribe((v) => {
      np = v;
      since = now;
      void writer.prepare(nowPlayingText(v, withArtist)).catch(() => undefined);
    });
    return {
      render(t, c) {
        now = t;
        c.clear();
        const text = nowPlayingText(np, withArtist);
        if (!text || (pausedHide && !np?.playing)) return;
        const w = writer.measure(text);
        if (w === null) return { changed: false };
        const pos = centreIn(ctx.safe, c, w, writer.height);
        if (w <= ctx.safe.width) {
          writer.draw(c, pos.x, pos.y, text);
          return;
        }
        const left = bandLeft(ctx.visible, c.width, pos.y, writer.height);
        const off = (((t - since) / 1000) * speed) % (w + c.width - left);
        writer.draw(c, Math.round(c.width - off), pos.y, text);
        clipLeft(c, left, pos.y, writer.height);
      },
      dispose: unsub,
    };
  },
};
