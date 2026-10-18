/** Preload bridge: exposes a small, typed API on `window.animatrix`. */
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC, type BridgeApi, type Result } from "../shared/ipc.js";

class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string | null,
  ) {
    super(message);
  }
}

const listen = <T>(channel: string, fn: (v: T) => void): (() => void) => {
  const h = (_e: unknown, v: T): void => fn(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

const api: BridgeApi = {
  async invoke(method, ...args) {
    const r = (await ipcRenderer.invoke(IPC.invoke, method, ...args)) as Result<unknown>;
    if (r.ok) return r.value;
    throw new BridgeError(r.error.code, r.error.message, r.error.hint);
  },
  onSnapshot: (fn) => listen(IPC.snapshot, fn),
  onState: (fn) => listen(IPC.state, fn),
  onPreview: (fn) => listen<Uint8Array>(IPC.preview, (f) => fn(new Uint8Array(f))),
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("animatrix", api);
