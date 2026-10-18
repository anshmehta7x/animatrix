/** CLI command implementations. Each returns a process exit code. */
import {
  AnimatrixError,
  DaemonClient,
  InvalidArgumentError,
  Matrix,
  isAsusdRunning,
  isDaemonRunning,
  type BuiltinSelection,
} from "@anshmehta7x/animatrix";
import { BUILTIN_LABELS, BUILTIN_VARIANTS } from "@anshmehta7x/animatrix-core";
import { EffectRegistry, type EffectDescriptor } from "@anshmehta7x/animatrix-effects";
import { parsePairs, type ParsedArgs } from "./args.js";

/** Output sink (so tests can capture). */
export interface Io {
  out(line: string): void;
  err(line: string): void;
}

type Opts = ParsedArgs["options"];
const GLOBAL = new Set(["direct", "json", "force", "help", "model"]);

/** Options minus global flags, renamed for effect params. */
function effectParams(opts: Opts, rename: Record<string, string> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(opts)
      .filter(([k]) => !GLOBAL.has(k))
      .map(([k, v]) => [rename[k] ?? k, v]),
  );
}

async function withMatrix(
  opts: Opts,
  io: Io,
  fn: (m: Matrix) => Promise<void>,
  keepAlive = false,
): Promise<number> {
  const m = await Matrix.open({
    direct: opts.direct === true,
    force: opts.force === true,
    model: typeof opts.model === "string" ? opts.model : undefined,
  });
  await fn(m);
  if (keepAlive && m.via === "direct") {
    io.out("Playing in this process (direct mode). Press Ctrl-C to stop.");
    await Promise.race([m.wait(), new Promise((r) => process.once("SIGINT", r))]);
  }
  await m.close();
  return 0;
}

async function withDaemon<T>(fn: (c: DaemonClient) => Promise<T>): Promise<T> {
  const c = await DaemonClient.connect();
  try {
    return await fn(c);
  } finally {
    c.close();
  }
}

function needFile(args: ParsedArgs, what: string): string {
  const f = args.positional[1];
  if (!f) throw new InvalidArgumentError(`usage: animatrix ${what} <file> [options]`);
  return f;
}

function describeEffect(e: EffectDescriptor): string[] {
  const lines = [`${e.id.padEnd(13)} ${e.name} — ${e.description}`];
  for (const [k, p] of Object.entries(e.params)) {
    const range =
      p.type === "number"
        ? ` ${p.min}..${p.max}`
        : p.type === "select"
          ? ` ${p.options.map((o) => o.value).join("|")}`
          : "";
    lines.push(`    ${k.padEnd(12)} ${p.type}${range} (default ${JSON.stringify(p.default)})`);
  }
  return lines;
}

async function status(args: ParsedArgs, io: Io): Promise<number> {
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

function builtinSelection(opts: Opts): Partial<BuiltinSelection> {
  const sel: Record<string, string> = {};
  for (const state of ["awake", "sleep", "shutdown", "boot"] as const) {
    const v = opts[state];
    if (v === undefined) continue;
    const variants: readonly string[] = BUILTIN_VARIANTS[state];
    if (typeof v !== "string" || !variants.includes(v)) {
      throw new InvalidArgumentError(`--${state} must be one of ${variants.join(", ")}`);
    }
    sel[state] = v;
  }
  return sel as Partial<BuiltinSelection>;
}

/** Dispatch a command. */
export async function run(args: ParsedArgs, io: Io): Promise<number> {
  const [cmd, ...rest] = args.positional;
  const o = args.options;
  switch (cmd) {
    case "status":
      return status(args, io);
    case "on":
      return withMatrix(o, io, (m) => m.on());
    case "off":
      return withMatrix(o, io, (m) => m.off());
    case "brightness": {
      const v = rest[0];
      if (!v)
        throw new InvalidArgumentError("usage: animatrix brightness <off|low|medium|high|0-3>");
      const level = /^\d$/.test(v)
        ? (Number(v) as 0 | 1 | 2 | 3)
        : (v as "off" | "low" | "medium" | "high");
      return withMatrix(o, io, (m) => m.setBrightness(level));
    }
    case "soft-brightness": {
      const v = Number(rest[0]);
      if (!Number.isFinite(v))
        throw new InvalidArgumentError("usage: animatrix soft-brightness <0..1>");
      await withDaemon((c) => c.setSoftBrightness(v));
      return 0;
    }
    case "test-pattern":
      return withMatrix(o, io, async (m) => {
        await m.showTestPattern();
        io.out(
          "Test pattern shown. See docs/hardware-notes.md (Orientation) for what to look for.",
        );
      });
    case "image":
      return withMatrix(
        o,
        io,
        (m) => m.play("image", { file: absolute(needFile(args, "image")), ...effectParams(o) }),
        true,
      );
    case "gif":
      return withMatrix(
        o,
        io,
        (m) => m.play("gif", { file: absolute(needFile(args, "gif")), ...effectParams(o) }),
        true,
      );
    case "video":
      return withMatrix(
        o,
        io,
        (m) => m.play("video", { file: absolute(needFile(args, "video")), ...effectParams(o) }),
        true,
      );
    case "text":
      if (!rest[0])
        throw new InvalidArgumentError('usage: animatrix text "hello" [--no-scroll] [--speed 20]');
      return withMatrix(
        o,
        io,
        (m) => m.play("text", { text: rest.join(" "), ...effectParams(o) }),
        true,
      );
    case "clock":
      return withMatrix(o, io, (m) => m.play("clock", effectParams(o, { "12h": "hour12" })), true);
    case "play": {
      const id = rest[0];
      if (!id) throw new InvalidArgumentError("usage: animatrix play <effect> [key=value ...]");
      return withMatrix(
        o,
        io,
        (m) => m.play(id, { ...parsePairs(rest.slice(1)), ...effectParams(o) }),
        true,
      );
    }
    case "stop":
      return withMatrix(o, io, (m) => m.stop());
    case "effects": {
      const list = (await isDaemonRunning())
        ? await withDaemon((c) => c.listEffects<EffectDescriptor[]>())
        : new EffectRegistry().describe();
      if (o.json) io.out(JSON.stringify(list, null, 2));
      else list.forEach((e) => describeEffect(e).forEach((l) => io.out(l)));
      return 0;
    }
    case "builtins": {
      if (rest[0] === "list") {
        for (const [state, variants] of Object.entries(BUILTIN_VARIANTS)) {
          io.out(`${state}: ${variants.map((v) => `${v} (${BUILTIN_LABELS[v]})`).join(", ")}`);
        }
        return 0;
      }
      const sel = builtinSelection(o);
      return withMatrix(o, io, (m) => m.setBuiltins(sel, { enable: o.enable !== false }));
    }
    case "scene":
      return scene(rest, io);
    case "flash":
      await withDaemon((c) => c.flash(rest.join(" ")));
      return 0;
    case "config":
      return config(rest, io);
    default:
      io.err(cmd ? `unknown command "${cmd}"` : "no command given");
      io.err(USAGE);
      return 2;
  }
}

const absolute = (p: string): string => (p.startsWith("/") ? p : `${process.cwd()}/${p}`);

async function scene(rest: string[], io: Io): Promise<number> {
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

async function config(rest: string[], io: Io): Promise<number> {
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
export function reportError(err: unknown, io: Io): number {
  if (err instanceof AnimatrixError) {
    io.err(`animatrix: ${err.message}`);
    if (err.hint) io.err(`hint: ${err.hint}`);
    return err.code === "INVALID_ARGUMENT" ? 2 : 1;
  }
  io.err(`animatrix: ${String((err as Error)?.message ?? err)}`);
  return 1;
}

export const USAGE = `usage: animatrix [--direct] [--json] <command>

  status                      daemon / device status
  on | off                    display on or off
  brightness <level>          off|low|medium|high or 0-3 (hardware)
  soft-brightness <0..1>      software brightness on top (daemon)
  image <file> [opts]         still image   (--fit contain|cover|stretch --scale --rotate
  gif <file> [opts]           animation      --pan-x --pan-y --mapping planar|diagonal
  video <file> [opts]         video          --brightness --contrast --gamma --invert
                                             --threshold --dither none|ordered|floyd-steinberg)
  text "<text>" [opts]        text (--no-scroll --speed --font 5x7|3x5|sans|serif|monospace)
  clock [--face date] [--12h] clock (digital|date|analogue|binary)
  play <effect> [k=v ...]     any effect; list them with "effects"
  effects                     list effects and their parameters
  stop                        stop the current effect
  builtins [--awake ...]      firmware animations (--awake --sleep --shutdown --boot,
                              --no-enable to only store); "builtins list" for names
  scene list|apply|save|delete <name>
  flash [text]                notification-style flash (daemon)
  config get | set k.k=value  read or change config (daemon)
  test-pattern                orientation test pattern

  --direct    talk to the device in this process instead of animatrixd`;
