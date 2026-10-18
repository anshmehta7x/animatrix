/** Tiny argument parser: positionals plus `--key value`, `--key=value`, `--flag`, `--no-flag`. */

export interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean>;
}

/** Option names that never take a value. */
const FLAGS = new Set([
  "direct",
  "json",
  "help",
  "force",
  "12h",
  "loop",
  "scroll",
  "enable",
  "invert",
]);

const camel = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Parse argv (without node and script). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith("--") || a === "-") {
      positional.push(a);
      continue;
    }
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      options[camel(body.slice(0, eq))] = body.slice(eq + 1);
    } else if (body.startsWith("no-")) {
      options[camel(body.slice(3))] = false;
    } else if (FLAGS.has(body) || i + 1 >= argv.length || argv[i + 1]!.startsWith("--")) {
      options[camel(body)] = true;
    } else {
      options[camel(body)] = argv[++i]!;
    }
  }
  return { positional, options };
}

/** `key=value` pairs (from `play <effect> k=v ...`) into an object. */
export function parsePairs(pairs: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    pairs.map((p) => {
      const eq = p.indexOf("=");
      if (eq <= 0) throw new Error(`expected key=value, got "${p}"`);
      return [p.slice(0, eq), p.slice(eq + 1)];
    }),
  );
}
