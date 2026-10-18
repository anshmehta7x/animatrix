/**
 * Notification flash: a short overlay, then the previous content comes back. Desktop
 * notifications are picked up (optionally) by watching `Notify` calls with `dbus-monitor`.
 *
 * Privacy: the lid faces other people, so notification text is only shown when
 * `notifications.showText` is on (off by default); otherwise the panel just pulses.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { Effect } from "@anshmehta7x/animatrix-effects";
import type { Controller } from "./controller.js";

const FLASH_MS = 1800;

/** A brief triple pulse, optionally with centred text. Stops by itself. */
export const flashEffect: Effect = {
  id: "flash",
  name: "Notification flash",
  description: "Short pulse used for notifications",
  category: "system",
  fps: 30,
  params: {
    text: { type: "string", label: "Text", default: "" },
  },
  create(params) {
    const text = String(params.text ?? "").slice(0, 40);
    return {
      render(t, c) {
        const phase = (t % 600) / 600;
        const v = Math.round(255 * Math.sin(Math.PI * phase));
        c.clear();
        if (text) {
          const w = c.measureText(text);
          const x =
            w <= c.width ? (c.width - w) / 2 : c.width - (((t / 1000) * 30) % (w + c.width));
          c.text(x, Math.round((c.height - 7) / 2), text, { value: Math.max(60, v) });
          c.rect(0, 0, c.width, c.height, Math.round(v * 0.5), false);
        } else {
          c.clear(Math.round(v * 0.8));
        }
        return { done: t >= FLASH_MS };
      },
    };
  },
};

/** Shows flashes on top of whatever is playing. */
export class Flasher {
  private monitor: ChildProcess | null = null;
  private busy = false;

  constructor(private readonly ctl: Controller) {}

  /** Flash now, then restore the previous content. Overlapping flashes are dropped. */
  async flash(text: string): Promise<void> {
    if (this.busy || this.ctl.gate) return;
    this.busy = true;
    const saved = this.ctl.currentContent;
    try {
      await this.ctl.play("flash", { text });
      await new Promise((r) => setTimeout(r, FLASH_MS + 100));
      const now = this.ctl.currentContent;
      if (now.kind === "effect" && now.effect === "flash") await this.ctl.restore(saved);
    } finally {
      this.busy = false;
    }
  }

  /** Start/stop watching desktop notifications according to config. */
  configure(enabled: boolean, showText: boolean): void {
    this.monitor?.kill();
    this.monitor = null;
    if (!enabled) return;
    const p = spawn(
      "dbus-monitor",
      ["--session", "type='method_call',interface='org.freedesktop.Notifications',member='Notify'"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    this.monitor = p;
    p.on("error", () => (this.monitor = null));
    let strings: string[] = [];
    let inCall = false;
    p.stdout?.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n")) {
        if (line.startsWith("method call")) {
          inCall = /member=Notify/.test(line);
          strings = [];
          continue;
        }
        const m = /^\s+string "(.*)"$/.exec(line);
        if (inCall && m) {
          strings.push(m[1]!);
          // Notify(app_name, replaces_id, app_icon, summary, ...): third string is the summary.
          if (strings.length === 3) {
            inCall = false;
            void this.flash(showText ? strings[2]! : "");
          }
        }
      }
    });
  }

  /** Stop the monitor. */
  stop(): void {
    this.monitor?.kill();
    this.monitor = null;
  }
}
