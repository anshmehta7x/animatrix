/**
 * Settings generated from an effect's params schema: every effect gets a settings UI for free.
 * Changes are applied live (debounced) by re-playing the effect with the new values.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EffectInfo, ParamSpecLite } from "../../shared/ipc";
import { call } from "../lib/api";
import { useStore } from "../lib/store";
import { Button, DraftField, Group, Row, Segmented, Select, Slider, Toggle } from "./controls";

type Values = Record<string, unknown>;

/** Defaults overlaid with the running params when this effect is active. */
export function useEffectValues(effect: EffectInfo | null): Values {
  const { state } = useStore();
  const defaults = Object.fromEntries(
    Object.entries(effect?.params ?? {}).map(([k, p]) => [k, p.default]),
  );
  return state?.effect === effect?.id ? { ...defaults, ...state?.params } : defaults;
}

function fmt(p: ParamSpecLite, v: number): string {
  const digits = (p.step ?? 1) < 0.1 ? 2 : (p.step ?? 1) < 1 ? 1 : 0;
  return `${v.toFixed(digits)}${p.unit && p.unit.length <= 2 ? p.unit : ""}`;
}

function Field(props: {
  name: string;
  spec: ParamSpecLite;
  value: unknown;
  set(v: unknown): void;
}): ReactNode {
  const { spec, value, set } = props;
  switch (spec.type) {
    case "boolean":
      return <Toggle label={spec.label} checked={Boolean(value)} onChange={set} />;
    case "number":
      return (
        <Slider
          label={spec.label}
          value={Number(value)}
          min={spec.min ?? 0}
          max={spec.max ?? 1}
          step={spec.step ?? 1}
          format={(v) => fmt(spec, v)}
          onChange={set}
        />
      );
    case "select":
      return (spec.options?.length ?? 0) <= 3 ? (
        <Segmented
          label={spec.label}
          value={String(value)}
          options={spec.options ?? []}
          onChange={set}
        />
      ) : (
        <Select
          label={spec.label}
          value={String(value)}
          options={spec.options ?? []}
          onChange={set}
        />
      );
    case "string":
      return <TextLive spec={spec} value={String(value ?? "")} set={set} />;
    case "file":
      return (
        <Button
          onClick={() =>
            void (call("pickFile", spec.accept ?? []) as Promise<string | null>).then(
              (p) => p && set(p),
            )
          }
        >
          {value ? String(value).split("/").pop() : "Choose file…"}
        </Button>
      );
  }
}

function TextLive({
  spec,
  value,
  set,
}: {
  spec: ParamSpecLite;
  value: string;
  set(v: string): void;
}): ReactNode {
  return (
    <DraftField label={spec.label} value={value} placeholder={spec.placeholder} onCommit={set} />
  );
}

/** Group keys into sections so long media schemas stay readable. */
const SECTIONS: [string, string[]][] = [
  ["Placement", ["fit", "scale", "rotate", "panX", "panY"]],
  ["Tone", ["brightness", "contrast", "gamma", "invert", "threshold", "dither", "levels"]],
  ["Layout", ["mapping"]],
];

export function ParamsForm({
  effect,
  hide = [],
}: {
  effect: EffectInfo;
  hide?: string[];
}): ReactNode {
  const { run } = useStore();
  const current = useEffectValues(effect);
  const [local, setLocal] = useState<Values>(current);
  const timer = useRef<number | null>(null);
  const currentKey = JSON.stringify(current);
  useEffect(() => setLocal(JSON.parse(currentKey) as Values), [currentKey]);

  const set = (key: string, v: unknown): void => {
    const next = { ...local, [key]: v };
    setLocal(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(() => call("play", effect.id, next)), 160);
  };

  const shown = (k: string): boolean =>
    Object.entries(effect.params[k]!.visibleWhen ?? {}).every(([dep, want]) => local[dep] === want);
  const keys = Object.keys(effect.params).filter((k) => !hide.includes(k) && shown(k));
  const grouped = new Set(SECTIONS.flatMap(([, ks]) => ks));
  const main = keys.filter((k) => !grouped.has(k));
  const rows = (ks: string[]): ReactNode =>
    ks.map((k) => (
      <Row key={k} label={effect.params[k]!.label}>
        <Field name={k} spec={effect.params[k]!} value={local[k]} set={(v) => set(k, v)} />
      </Row>
    ));

  return (
    <>
      {main.length > 0 && <Group>{rows(main)}</Group>}
      {SECTIONS.map(([title, ks]) => {
        const present = ks.filter((k) => keys.includes(k));
        return present.length ? (
          <Group key={title} title={title}>
            {rows(present)}
          </Group>
        ) : null;
      })}
    </>
  );
}
