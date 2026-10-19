/**
 * Starts a private D-Bus session bus and the built animatrixd on it in mock mode. The mock
 * device records every packet it receives, so tests can assert the bytes that would reach the
 * lid. Nothing here touches the real session bus or hardware.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { DaemonClient } from "@anshmehta7x/animatrix";

const root = new URL("..", import.meta.url).pathname;
/**
 * ANIMATRIX_E2E_BUNDLE=<unpacked release dir> runs the release launchers instead of the
 * workspace build, so the pruned bundle gets the same tests.
 */
const bundle = process.env.ANIMATRIX_E2E_BUNDLE || null;
const DAEMON: string[] = bundle
  ? [join(bundle, "bin/animatrixd")]
  : [process.execPath, join(root, "packages/daemon/dist/main.js")];
const CLI: string[] = bundle
  ? [join(bundle, "bin/animatrix")]
  : [process.execPath, join(root, "packages/cli/dist/main.js")];

export interface CliResult {
  code: number | null;
  out: string;
  err: string;
}

export function hasDbusDaemon(): boolean {
  return ["/usr/bin/dbus-daemon", "/bin/dbus-daemon"].some((p) => existsSync(p));
}

export async function waitFor<T>(
  fn: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  what: string,
  timeoutMs = 5000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

function exited(p: ChildProcess): Promise<number | null> {
  return p.exitCode !== null
    ? Promise.resolve(p.exitCode)
    : new Promise((r) => p.once("exit", (code) => r(code)));
}

/** Write a greyscale PNG, white where `lit(x, y)` is true, so tests can exercise image decoding. */
export function writePng(
  file: string,
  w: number,
  h: number,
  lit: (x: number, y: number) => boolean,
): void {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth; colour type 0 (grey), no interlace
  const rows = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) rows[y * (w + 1) + 1 + x] = lit(x, y) ? 255 : 0;
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

export class Harness {
  readonly dir = mkdtempSync(join(tmpdir(), "animatrix-e2e-"));
  readonly record = join(this.dir, "packets.hex");
  readonly config = join(this.dir, "config.toml");
  bus = "";
  daemon: ChildProcess | null = null;
  daemonLog = "";
  private dbus: ChildProcess | null = null;
  private clients: DaemonClient[] = [];

  /** Environment for child processes and in-process clients: the private bus only. */
  get env(): NodeJS.ProcessEnv {
    return { ...process.env, DBUS_SESSION_BUS_ADDRESS: this.bus, XDG_CONFIG_HOME: this.dir };
  }

  async start(): Promise<void> {
    const dbus = spawn("dbus-daemon", ["--session", "--nofork", "--print-address=1"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    this.dbus = dbus;
    let buf = "";
    this.bus = await new Promise<string>((resolve, reject) => {
      dbus.on("error", reject);
      dbus.stdout!.on("data", (d: Buffer) => {
        buf += d.toString();
        if (buf.includes("\n")) resolve(buf.split("\n")[0]!.trim());
      });
    });
    // In-process clients (DaemonClient, Matrix) read the bus address from the environment.
    process.env.DBUS_SESSION_BUS_ADDRESS = this.bus;
    await this.startDaemon();
  }

  /** Start animatrixd and wait until it answers on the bus. */
  async startDaemon(extra: string[] = []): Promise<void> {
    this.daemon = this.spawnDaemon(extra);
    await waitFor(async () => {
      const c = await DaemonClient.connect().catch(() => null);
      const info = await c?.info().catch(() => null);
      c?.close();
      return info;
    }, "animatrixd on the bus");
  }

  spawnDaemon(extra: string[] = []): ChildProcess {
    const p = spawn(
      DAEMON[0]!,
      [...DAEMON.slice(1), "--mock", "--record", this.record, "--config", this.config, ...extra],
      { env: this.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    p.stdout!.on("data", (d: Buffer) => (this.daemonLog += d.toString()));
    p.stderr!.on("data", (d: Buffer) => (this.daemonLog += d.toString()));
    return p;
  }

  /** SIGTERM the daemon and return its exit code. */
  async stopDaemon(): Promise<number | null> {
    const p = this.daemon;
    this.daemon = null;
    if (!p || p.exitCode !== null) return p?.exitCode ?? null;
    p.kill("SIGTERM");
    return exited(p);
  }

  async client(): Promise<DaemonClient> {
    const c = await DaemonClient.connect();
    this.clients.push(c);
    return c;
  }

  /** Run the built CLI against the private bus. */
  cli(...args: string[]): Promise<CliResult> {
    const p = spawn(CLI[0]!, [...CLI.slice(1), ...args], {
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr!.on("data", (d: Buffer) => (err += d.toString()));
    return exited(p).then((code) => ({ code, out, err }));
  }

  /** Every packet the mock device has received so far, as lowercase hex. */
  packets(): string[] {
    if (!existsSync(this.record)) return [];
    return readFileSync(this.record, "utf8").split("\n").filter(Boolean);
  }

  /** Wait for a packet starting with `prefix` (hex) after index `since`. */
  waitForPacket(prefix: string, since: number, what = prefix): Promise<string> {
    return waitFor(
      () =>
        this.packets()
          .slice(since)
          .find((p) => p.startsWith(prefix)),
      what,
    );
  }

  async stop(): Promise<void> {
    this.clients.forEach((c) => c.close());
    await this.stopDaemon();
    this.dbus?.kill("SIGTERM");
    if (this.dbus) await exited(this.dbus);
    rmSync(this.dir, { recursive: true, force: true });
  }
}
