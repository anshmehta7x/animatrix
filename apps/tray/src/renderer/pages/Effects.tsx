import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ParamsForm } from "../components/ParamsForm";
import { Group } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";
import styles from "./pages.module.css";

const SKIP = new Set(["image", "gif", "video", "clock", "visualiser"]);

export function EffectsPage(): ReactNode {
  const { snap, state, run } = useStore();
  const list = (snap?.effects ?? []).filter((e) => !SKIP.has(e.id));
  const active = list.find((e) => e.id === state?.effect) ?? null;
  return (
    <>
      <Group>
        {list.map((e) => (
          <button
            key={e.id}
            className={styles.listRow}
            onClick={() => void run(() => call("play", e.id, {}))}
          >
            <span className={styles.listText}>
              <span className={styles.listName}>{e.name}</span>
              <span className={styles.listSub}>{e.description}</span>
            </span>
            {state?.effect === e.id && <Check size={16} className={styles.check} />}
          </button>
        ))}
      </Group>
      {active && <ParamsForm effect={active} />}
    </>
  );
}
