/** Typed access to the preload bridge. */
import type { BridgeApi, BridgeMethods } from "../../shared/ipc";

declare global {
  interface Window {
    animatrix: BridgeApi;
  }
}

/** Error thrown by bridge calls (code + optional hint). */
export interface BridgeError extends Error {
  code?: string;
  hint?: string | null;
}

export const bridge = (): BridgeApi => window.animatrix;

/** Invoke a main-process method. */
export function call<K extends keyof BridgeMethods>(
  method: K,
  ...args: BridgeMethods[K]
): Promise<unknown> {
  return bridge().invoke(method, ...args);
}

/** Pick an effect for a media file by extension. */
export function effectForFile(path: string): "image" | "gif" | "video" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["gif", "webp", "apng"].includes(ext)) return "gif";
  if (["mp4", "mkv", "webm", "mov", "avi", "m4v"].includes(ext)) return "video";
  return "image";
}
