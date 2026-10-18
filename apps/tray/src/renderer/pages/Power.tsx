import type { ReactNode } from "react";
import { DraftField, Group, Row, Select, Slider, Toggle } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";

const ACTIONS = [
  { value: "builtins", label: "Firmware animation" },
  { value: "off", label: "Turn off" },
  { value: "scene", label: "Play a scene first" },
  { value: "keep", label: "Leave as is" },
];

export function PowerPage(): ReactNode {
  const { snap, run } = useStore();
  const cfg = snap?.config;
  if (!cfg) return null;
  const set = (patch: Record<string, unknown>): void => void run(() => call("updateConfig", patch));
  const scenes = [
    { value: "", label: "None" },
    ...Object.keys(cfg.scenes).map((s) => ({ value: s, label: s })),
  ];
  const p = cfg.power;
  const s = cfg.schedule;
  return (
    <>
      <Group>
        <Row label="Off on battery">
          <Toggle
            label="Off on battery"
            checked={p.offOnBattery}
            onChange={(v) => set({ power: { offOnBattery: v } })}
          />
        </Row>
        <Row label="Off when the lid is closed">
          <Toggle
            label="Off when the lid is closed"
            checked={p.offOnLidClose}
            onChange={(v) => set({ power: { offOnLidClose: v } })}
          />
        </Row>
      </Group>
      <Group title="Sleep and shutdown">
        <Row label="On sleep">
          <Select
            label="On sleep"
            value={p.onSuspend}
            options={ACTIONS}
            onChange={(v) => set({ power: { onSuspend: v } })}
          />
        </Row>
        {p.onSuspend === "scene" && (
          <Row label="Sleep scene">
            <Select
              label="Sleep scene"
              value={p.sleepScene}
              options={scenes}
              onChange={(v) => set({ power: { sleepScene: v } })}
            />
          </Row>
        )}
        <Row label="On shutdown">
          <Select
            label="On shutdown"
            value={p.onShutdown}
            options={ACTIONS}
            onChange={(v) => set({ power: { onShutdown: v } })}
          />
        </Row>
        {p.onShutdown === "scene" && (
          <Row label="Shutdown scene">
            <Select
              label="Shutdown scene"
              value={p.shutdownScene}
              options={scenes}
              onChange={(v) => set({ power: { shutdownScene: v } })}
            />
          </Row>
        )}
      </Group>
      <Group title="Night">
        <Row label="Dim at night">
          <Toggle
            label="Dim at night"
            checked={s.enabled}
            onChange={(v) => set({ schedule: { enabled: v } })}
          />
        </Row>
        {s.enabled && (
          <>
            <Row label="From">
              <DraftField
                label="From"
                value={s.dimFrom}
                placeholder="22:00"
                onCommit={(v) => set({ schedule: { dimFrom: v } })}
              />
            </Row>
            <Row label="Until">
              <DraftField
                label="Until"
                value={s.dimTo}
                placeholder="07:00"
                onCommit={(v) => set({ schedule: { dimTo: v } })}
              />
            </Row>
            <Row label="Level">
              <Slider
                label="Night level"
                min={0}
                max={100}
                value={Math.round(s.dimBrightness * 100)}
                format={(v) => `${v}%`}
                onChange={(v) => set({ schedule: { dimBrightness: v / 100 } })}
              />
            </Row>
          </>
        )}
      </Group>
    </>
  );
}
