/**
 * Starts a private D-Bus session bus and the built animatrixd on it in mock mode. The mock
 * device records every packet it receives, so tests can assert the bytes that would reach the
 * lid. Nothing here touches the real session bus or hardware.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonClient } from "@anshmehta7x/animatrix";

const root = new URL("..", import.meta.url).pathname;
export const DAEMON = join(root, "packages/daemon/dist/main.js");
export const CLI = join(root, "packages/cli/dist/main.js");

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
      process.execPath,
      [DAEMON, "--mock", "--record", this.record, "--config", this.config, ...extra],
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
    const p = spawn(process.execPath, [CLI, ...args], {
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
