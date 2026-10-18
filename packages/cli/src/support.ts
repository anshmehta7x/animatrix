/** Shared CLI plumbing: IO, opening the matrix or daemon, option helpers, error output. */
import { AnimatrixError, DaemonClient, InvalidArgumentError, Matrix } from "@anshmehta7x/animatrix";
import type { ParsedArgs } from "./args.js";

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

export type Opts = ParsedArgs["options"];
const GLOBAL = new Set(["direct", "json", "force", "help", "model"]);

/** Options minus global flags, renamed for effect params. */
export function effectParams(
  opts: Opts,
  rename: Record<string, string> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(opts)
      .filter(([k]) => !GLOBAL.has(k))
      .map(([k, v]) => [rename[k] ?? k, v]),
  );
}

export async function withMatrix(
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

export async function withDaemon<T>(fn: (c: DaemonClient) => Promise<T>): Promise<T> {
  const c = await DaemonClient.connect();
  try {
    return await fn(c);
  } finally {
    c.close();
  }
}

export function needFile(args: ParsedArgs, what: string): string {
  const f = args.positional[1];
  if (!f) throw new InvalidArgumentError(`usage: animatrix ${what} <file> [options]`);
  return f;
}

export const absolute = (p: string): string => (p.startsWith("/") ? p : `${process.cwd()}/${p}`);

export function reportError(err: unknown, io: Io): number {
  if (err instanceof AnimatrixError) {
    io.err(`animatrix: ${err.message}`);
    if (err.hint) io.err(`hint: ${err.hint}`);
    return err.code === "INVALID_ARGUMENT" ? 2 : 1;
  }
  io.err(`animatrix: ${String((err as Error)?.message ?? err)}`);
  return 1;
}
