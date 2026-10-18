/** CLI command dispatch. Each command returns a process exit code. */
import {
  InvalidArgumentError,
  isDaemonRunning,
  type BuiltinSelection,
} from "@anshmehta7x/animatrix";
import { BUILTIN_LABELS, BUILTIN_VARIANTS } from "@anshmehta7x/animatrix-core";
import { EffectRegistry, type EffectDescriptor } from "@anshmehta7x/animatrix-effects";
import { parsePairs, type ParsedArgs } from "./args.js";
import { config, patchFrom, scene, status } from "./daemon-commands.js";
import {
  absolute,
  effectParams,
  needFile,
  reportError,
  withDaemon,
  withMatrix,
  type Io,
  type Opts,
} from "./support.js";
import { USAGE } from "./usage.js";

export { patchFrom, reportError, USAGE, type Io };

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
