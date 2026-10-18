/**
 * Minimal structured logger. Output goes to stdout/stderr, which journald captures for the
 * systemd user service. Metadata keys are camelCase.
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(err: unknown, meta?: Record<string, unknown>): void;
}

const fmt = (meta?: Record<string, unknown>): string =>
  meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";

/** Console logger with optional debug silencing. */
export function consoleLogger(quiet = false): Logger {
  return {
    info: (m, meta) => {
      if (!quiet) console.log(`${m}${fmt(meta)}`);
    },
    warn: (m, meta) => console.warn(`warning: ${m}${fmt(meta)}`),
    error: (err, meta) => {
      const e = err as { message?: string; cause?: unknown };
      const cause = e.cause
        ? ` (cause: ${String((e.cause as { message?: string }).message ?? e.cause)})`
        : "";
      console.error(`error: ${e.message ?? String(err)}${cause}${fmt(meta)}`);
    },
  };
}

/** A logger that records lines, for tests. */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => void lines.push(`info ${m}`),
    warn: (m) => void lines.push(`warn ${m}`),
    error: (e) => void lines.push(`error ${String((e as Error).message ?? e)}`),
  };
}
