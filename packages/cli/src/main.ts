#!/usr/bin/env node
/** `animatrix` command-line entry point. */
import { parseArgs } from "./args.js";
import { USAGE, reportError, run, type Io } from "./commands.js";

const io: Io = { out: (l) => console.log(l), err: (l) => console.error(l) };
const args = parseArgs(process.argv.slice(2));

if (args.options.help || args.positional[0] === "help") {
  io.out(USAGE);
  process.exit(0);
}

run(args, io).then(
  (code) => process.exit(code),
  (err: unknown) => process.exit(reportError(err, io)),
);
