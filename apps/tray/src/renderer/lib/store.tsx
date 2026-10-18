/** App-wide state: daemon snapshot, live state, and an action runner that surfaces errors. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DaemonState } from "@anshmehta7x/animatrix/client";
import type { EffectInfo, Snapshot } from "../../shared/ipc";
import { bridge, call, type BridgeError } from "./api";

export interface Notice {
  kind: "error" | "info";
  message: string;
  hint: string | null;
}

interface Store {
  snap: Snapshot | null;
  state: DaemonState | null;
  notice: Notice | null;
  dismiss(): void;
  /** Run an action; failures become a dismissible notice. */
  run(fn: () => Promise<unknown>): Promise<void>;
  effect(id: string): EffectInfo | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [state, setState] = useState<DaemonState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    void (call("snapshot") as Promise<Snapshot>).then((s) => {
      setSnap(s);
      setState(s.state);
    });
    const offSnap = bridge().onSnapshot((s) => {
      setSnap(s);
      setState(s.state);
    });
    const offState = bridge().onState(setState);
    return () => {
      offSnap();
      offState();
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const e = err as BridgeError;
      setNotice({
        kind: "error",
        message: e.message.replace(/^Error invoking remote method '[^']+': /, ""),
        hint: e.hint ?? null,
      });
    }
  }, []);

  const value = useMemo<Store>(
    () => ({
      snap,
      state,
      notice,
      dismiss: () => setNotice(null),
      run,
      effect: (id) => snap?.effects.find((e) => e.id === id) ?? null,
    }),
    [snap, state, notice, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
