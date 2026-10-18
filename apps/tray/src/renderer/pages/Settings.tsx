import type { ReactNode } from "react";
import { Button, Group, Row, Slider, Toggle } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";

export function SettingsPage(): ReactNode {
  const { snap, run } = useStore();
  const cfg = snap?.config;
  const info = snap?.info;
  if (!cfg || !snap) return null;
  const set = (patch: Record<string, unknown>): void => void run(() => call("updateConfig", patch));
  return (
    <>
      <Group title="Panel">
        <Row label="Hide when I click elsewhere" hint="Off lets you drag files in from other apps">
          <Toggle
            label="Hide on focus loss"
            checked={cfg.ui.closeOnBlur}
            onChange={(v) => set({ ui: { closeOnBlur: v } })}
          />
        </Row>
        <Row label="Open at login" hint="Adds animatrix to ~/.config/autostart">
          <Toggle
            label="Open at login"
            checked={snap.env.autostart}
            onChange={(v) => void run(() => call("setAutostart", v))}
          />
        </Row>
      </Group>
      <Group title="Display">
        <Row label="Gamma" hint="Applied on top of every effect">
          <Slider
            label="Gamma"
            min={0.4}
            max={2.5}
            step={0.05}
            value={cfg.device.gamma}
            format={(v) => v.toFixed(2)}
            onChange={(v) => set({ device: { gamma: v } })}
          />
        </Row>
        <Row label="Frame-rate cap" hint={`This panel tops out near ${info?.maxFps ?? 30} fps`}>
          <Slider
            label="Frame-rate cap"
            min={5}
            max={30}
            value={Math.min(30, cfg.device.maxFps)}
            format={(v) => `${v}`}
            onChange={(v) => set({ device: { maxFps: v } })}
          />
        </Row>
        <Row label="Orientation test" hint="Shows a block at row 0, column 0 and a large F">
          <Button onClick={() => void run(() => call("showTestPattern"))}>Show</Button>
        </Row>
      </Group>
      <Group title="Notifications">
        <Row label="Flash on notifications">
          <Toggle
            label="Flash on notifications"
            checked={cfg.notifications.flash}
            onChange={(v) => set({ notifications: { flash: v } })}
          />
        </Row>
        {cfg.notifications.flash && (
          <Row label="Show the notification title" hint="Anyone facing the lid can read it">
            <Toggle
              label="Show the notification title"
              checked={cfg.notifications.showText}
              onChange={(v) => set({ notifications: { showText: v } })}
            />
          </Row>
        )}
      </Group>
      <Group title="About">
        <Row
          label={info ? `${info.modelName} (${info.model})` : "No device"}
          hint={
            info
              ? `${info.leds} LEDs · ${info.transport} · animatrixd ${info.version}${info.tested ? "" : " · untested model"}`
              : undefined
          }
        >
          <Button onClick={() => void call("openConfigFile")}>Config file</Button>
        </Row>
        <Row label="Quit the panel" hint="animatrixd keeps running">
          <Button kind="danger" onClick={() => void call("quit")}>
            Quit
          </Button>
        </Row>
      </Group>
    </>
  );
}
