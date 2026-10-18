/** The effect registry. Adding an effect = one file in effects/ + one line here. */
import { breatheEffect } from "./effects/breathe.js";
import { clockEffect } from "./effects/clock.js";
import { gifEffect } from "./effects/gif.js";
import { imageEffect } from "./effects/image.js";
import { lifeEffect } from "./effects/life.js";
import { matrixRainEffect } from "./effects/matrix-rain.js";
import { nowPlayingEffect } from "./effects/now-playing.js";
import { plasmaEffect } from "./effects/plasma.js";
import { starfieldEffect } from "./effects/starfield.js";
import { statsEffect } from "./effects/stats.js";
import { textEffect } from "./effects/text.js";
import { videoEffect } from "./effects/video.js";
import { visualiserEffect } from "./effects/visualiser.js";
import type { Effect, EffectDescriptor } from "./types.js";

/** Built-in effects in display order. */
export const BUILTIN_EFFECTS: readonly Effect[] = [
  imageEffect,
  gifEffect,
  videoEffect,
  textEffect,
  nowPlayingEffect,
  clockEffect,
  visualiserEffect,
  matrixRainEffect,
  lifeEffect,
  starfieldEffect,
  plasmaEffect,
  breatheEffect,
  statsEffect,
];

/** A mutable registry, pre-filled with the built-ins. */
export class EffectRegistry {
  private readonly effects = new Map<string, Effect>();

  constructor(initial: readonly Effect[] = BUILTIN_EFFECTS) {
    initial.forEach((e) => this.register(e));
  }

  /** Add (or replace) an effect. */
  register(effect: Effect): void {
    this.effects.set(effect.id, effect);
  }

  /** Look up by id. */
  get(id: string): Effect | null {
    return this.effects.get(id) ?? null;
  }

  /** All effects in registration order. */
  list(): Effect[] {
    return [...this.effects.values()];
  }

  /** Serialisable descriptors (for D-Bus and the UI). */
  describe(): EffectDescriptor[] {
    return this.list().map(({ id, name, description, category, fps, params }) => ({
      id,
      name,
      description,
      category,
      fps,
      params,
    }));
  }
}
