/** Commands that only make sense through animatrixd: status, scenes, config. */
import { InvalidArgumentError, isAsusdRunning, isDaemonRunning } from "@anshmehta7x/animatrix";
import type { ParsedArgs } from "./args.js";
import { withDaemon, type Io } from "./support.js";

export async function status(args: ParsedArgs, io: Io): Promise<number> {
  const daemon = await isDaemonRunning();
  const asusd = await isAsusdRunning();
  if (!daemon) {
    if (args.options.json) io.out(JSON.stringify({ daemon: false, asusd }));
    else {
      io.out("animatrixd: not running (start it with: systemctl --user start animatrixd)");
      if (asusd) io.out("asusd: running — it claims the AniMe device; stop it to use animatrix.");
    }
    return daemon ? 0 : 3;
  }
  const [info, state] = await withDaemon(
    async (c) => [await c.info().catch(() => null), await c.state()] as const,
  );
  if (args.options.json) {
    io.out(JSON.stringify({ daemon: true, asusd, info, state }, null, 2));
    return 0;
  }
  io.out(
    `animatrixd: running${info ? ` (v${info.version}, ${info.model}${info.tested ? "" : " UNTESTED"}, ${info.transport})` : ""}`,
  );
  io.out(
    `device:     ${state.connected ? "connected" : `not connected${state.error ? ` — ${state.error}` : ""}`}`,
  );
  io.out(
    `display:    ${state.gate ? `off (${state.gate})` : "on"}, brightness ${state.hardwareBrightness}/3, soft ${Math.round(state.softBrightness * 100)}%`,
  );
  io.out(
    `showing:    ${state.content}${state.effect ? ` ${state.effect}` : ""}${state.scene ? ` (scene "${state.scene}")` : ""}`,
  );
  if (asusd) io.out("warning:    asusd is running and may fight over the device");
  return 0;
}

export async function scene(rest: string[], io: Io): Promise<number> {
  const [sub, ...nameParts] = rest;
  const name = nameParts.join(" ");
  return withDaemon(async (c) => {
    if (!sub || sub === "list") {
      const scenes = await c.listScenes<Record<string, { effect: string }>>();
      for (const [n, s] of Object.entries(scenes)) io.out(`${n.padEnd(16)} ${s.effect}`);
    } else if (sub === "apply") await c.applyScene(name);
    else if (sub === "save") await c.saveScene(name);
    else if (sub === "delete") await c.deleteScene(name);
    else throw new InvalidArgumentError("usage: animatrix scene list|apply|save|delete <name>");
    return 0;
  });
}

/** Turn `a.b.c=value` into a nested patch with a JSON-ish value. */
export function patchFrom(assignment: string): Record<string, unknown> {
  const eq = assignment.indexOf("=");
  if (eq <= 0) throw new InvalidArgumentError("usage: animatrix config set section.key=value");
  const keys = assignment.slice(0, eq).split(".");
  const raw = assignment.slice(eq + 1);
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // plain string
  }
  return keys.reduceRight<unknown>((acc, k) => ({ [k]: acc }), value) as Record<string, unknown>;
}

export async function config(rest: string[], io: Io): Promise<number> {
  const [sub, arg] = rest;
  return withDaemon(async (c) => {
    if (!sub || sub === "get") io.out(JSON.stringify(await c.config(), null, 2));
    else if (sub === "set" && arg) await c.updateConfig(patchFrom(arg));
    else
      throw new InvalidArgumentError("usage: animatrix config get | config set section.key=value");
    return 0;
  });
}

/** Print an error nicely and pick an exit code. */
