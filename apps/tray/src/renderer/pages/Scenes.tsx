import { useState, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button, Group, Row, Select, TextField, Toggle } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";
import styles from "./pages.module.css";

const INTERVALS = [60, 300, 900, 1800, 3600].map((s) => ({
  value: String(s),
  label: s < 3600 ? `${s / 60} min` : "1 hour",
}));

export function ScenesPage(): ReactNode {
  const { snap, state, run } = useStore();
  const [name, setName] = useState("");
  const cfg = snap?.config;
  if (!cfg) return null;
  const scenes = Object.entries(cfg.scenes);
  const pl = cfg.playlist;
  const togglePl = (scene: string, on: boolean): Promise<unknown> =>
    call("updateConfig", {
      playlist: { scenes: on ? [...pl.scenes, scene] : pl.scenes.filter((s) => s !== scene) },
    });
  return (
    <>
      <Group>
        {scenes.length === 0 && (
          <div className={styles.empty}>No scenes yet. Set something up, then save it below.</div>
        )}
        {scenes.map(([n, s]) => (
          <div key={n} className={styles.sceneRow}>
            <button
              className={styles.listRow}
              onClick={() => void run(() => call("applyScene", n))}
            >
              <span className={styles.listText}>
                <span>{n}</span>
                {(() => {
                  const effectName = snap.effects.find((e) => e.id === s.effect)?.name ?? s.effect;
                  return effectName !== n ? (
                    <span className={styles.listSub}>{effectName}</span>
                  ) : null;
                })()}
              </span>
              {state?.scene === n && <Check size={16} className={styles.check} />}
            </button>
            {pl.enabled && (
              <Toggle
                label={`Include ${n} in playlist`}
                checked={pl.scenes.includes(n)}
                onChange={(v) => void run(() => togglePl(n, v))}
              />
            )}
            <button
              className={styles.iconButton}
              aria-label={`Delete ${n}`}
              onClick={() => void run(() => call("deleteScene", n))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Group>
      <Group>
        <Row label="Save what's playing">
          <TextField label="Scene name" value={name} placeholder="Name" onChange={setName} />
          <span className={styles.gap} />
          <Button
            disabled={!name.trim() || state?.content !== "effect"}
            onClick={() =>
              void run(async () => {
                await call("saveScene", name.trim());
                setName("");
              })
            }
          >
            Save
          </Button>
        </Row>
      </Group>
      <Group title="Playlist">
        <Row label="Rotate scenes" hint="Switches between the scenes you tick above.">
          <Toggle
            label="Rotate scenes"
            checked={pl.enabled}
            onChange={(v) => void run(() => call("updateConfig", { playlist: { enabled: v } }))}
          />
        </Row>
        {pl.enabled && (
          <Row label="Every">
            <Select
              label="Interval"
              value={String(pl.intervalSec)}
              options={
                INTERVALS.some((i) => i.value === String(pl.intervalSec))
                  ? INTERVALS
                  : [...INTERVALS, { value: String(pl.intervalSec), label: `${pl.intervalSec} s` }]
              }
              onChange={(v) =>
                void run(() => call("updateConfig", { playlist: { intervalSec: Number(v) } }))
              }
            />
          </Row>
        )}
      </Group>
    </>
  );
}
