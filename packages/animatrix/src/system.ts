/** Host inspection: DMI model string and other processes that may own the device. */
import { readdir, readFile } from "node:fs/promises";

/** Read the DMI model string (`product_name`, falling back to `board_name`). */
export async function readDmiModel(root = "/sys/class/dmi/id"): Promise<string | null> {
  const parts = await Promise.all(
    ["product_name", "board_name"].map((f) =>
      readFile(`${root}/${f}`, "utf8").then(
        (s) => s.trim(),
        () => "",
      ),
    ),
  );
  const joined = parts.filter(Boolean).join(" ");
  return joined.length > 0 ? joined : null;
}

/** True if a process named `name` is running (scans /proc; no extra tools needed). */
export async function isProcessRunning(name: string, proc = "/proc"): Promise<boolean> {
  const entries = await readdir(proc).catch(() => [] as string[]);
  const pids = entries.filter((e) => /^\d+$/.test(e));
  const comms = await Promise.all(
    pids.map((pid) =>
      readFile(`${proc}/${pid}/comm`, "utf8").then(
        (s) => s.trim(),
        () => "",
      ),
    ),
  );
  return comms.includes(name);
}

/** True if asusd (asusctl's daemon), which claims the device via libusb, is running. */
export function isAsusdRunning(): Promise<boolean> {
  return isProcessRunning("asusd");
}
