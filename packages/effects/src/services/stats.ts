/**
 * System statistics from /proc and /sys only (no helper processes). GPU load comes from
 * amdgpu's `gpu_busy_percent`; NVIDIA dGPUs are not queried, since spawning nvidia-smi would wake
 * a sleeping dGPU and cost battery.
 */
import { readFile, readdir } from "node:fs/promises";

/** One sample. Every field is 0..1, except temperature in °C. `null` = unavailable. */
export interface SystemStats {
  cpu: number;
  ram: number;
  gpu: number | null;
  tempC: number | null;
}

const read = (p: string): Promise<string | null> => readFile(p, "utf8").catch(() => null);

/** Polls system stats at a fixed interval while subscribed. */
export class StatsService {
  private prevIdle = 0;
  private prevTotal = 0;
  private timer: NodeJS.Timeout | null = null;
  private subscribers = 0;
  private gpuPath: string | null | undefined = undefined;
  private tempPath: string | null | undefined = undefined;
  /** Latest sample. */
  value: SystemStats = { cpu: 0, ram: 0, gpu: null, tempC: null };

  /** Start sampling (ref-counted). Returns an unsubscribe function. */
  subscribe(intervalMs = 1000): () => void {
    this.subscribers++;
    if (!this.timer) {
      void this.sample();
      this.timer = setInterval(() => void this.sample(), intervalMs);
    }
    return () => {
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (this.subscribers === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Take one sample now. */
  async sample(): Promise<SystemStats> {
    const [stat, mem] = await Promise.all([read("/proc/stat"), read("/proc/meminfo")]);
    this.value = {
      cpu: stat ? this.cpuLoad(stat) : 0,
      ram: mem ? ramUsage(mem) : 0,
      gpu: await this.gpuLoad(),
      tempC: await this.temperature(),
    };
    return this.value;
  }

  private cpuLoad(stat: string): number {
    const fields = (stat.split("\n")[0] ?? "").trim().split(/\s+/).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((a, b) => a + b, 0);
    const dIdle = idle - this.prevIdle;
    const dTotal = total - this.prevTotal;
    this.prevIdle = idle;
    this.prevTotal = total;
    return dTotal > 0 ? Math.min(1, Math.max(0, 1 - dIdle / dTotal)) : 0;
  }

  private async gpuLoad(): Promise<number | null> {
    if (this.gpuPath === undefined) {
      const cards = await readdir("/sys/class/drm").catch(() => [] as string[]);
      const paths = cards
        .filter((c) => /^card\d+$/.test(c))
        .map((c) => `/sys/class/drm/${c}/device/gpu_busy_percent`);
      const found = await Promise.all(
        paths.map(async (p) => ((await read(p)) !== null ? p : null)),
      );
      this.gpuPath = found.find((p) => p !== null) ?? null;
    }
    if (!this.gpuPath) return null;
    const v = await read(this.gpuPath);
    return v === null ? null : Number(v) / 100;
  }

  private async temperature(): Promise<number | null> {
    if (this.tempPath === undefined) this.tempPath = await findCpuTemp();
    if (!this.tempPath) return null;
    const v = await read(this.tempPath);
    return v === null ? null : Number(v) / 1000;
  }

  /** Stop sampling. */
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subscribers = 0;
  }
}

/** Parse /proc/meminfo into a used fraction. */
export function ramUsage(meminfo: string): number {
  const get = (k: string): number =>
    Number(new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(meminfo)?.[1] ?? 0);
  const total = get("MemTotal");
  return total > 0 ? 1 - get("MemAvailable") / total : 0;
}

async function findCpuTemp(): Promise<string | null> {
  const mons = await readdir("/sys/class/hwmon").catch(() => [] as string[]);
  const named = await Promise.all(
    mons.map(async (m) => ({ m, name: (await read(`/sys/class/hwmon/${m}/name`))?.trim() ?? "" })),
  );
  const pick =
    named.find((n) => n.name === "k10temp" || n.name === "coretemp") ??
    named.find((n) => n.name === "acpitz");
  return pick ? `/sys/class/hwmon/${pick.m}/temp1_input` : null;
}
