import type { ReactNode } from "react";
import {
  BUILTIN_LABELS,
  BUILTIN_VARIANTS,
  type BuiltinSelection,
} from "@anshmehta7x/animatrix-core";
import { Button, Group, Row, Select } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";

const STATES: [keyof BuiltinSelection, string][] = [
  ["awake", "While running"],
  ["sleep", "While asleep"],
  ["shutdown", "On shutdown"],
  ["boot", "On boot"],
];

export function BuiltinsPage(): ReactNode {
  const { state, run } = useStore();
  if (!state) return null;
  const enabled = state.content === "builtins";
  return (
    <>
      <Group>
        <Row
          label="Built-in animations"
          hint={
            enabled ? "The lid is playing its own animations." : "Stored in the panel's firmware."
          }
        >
          <Button
            kind={enabled ? "plain" : "primary"}
            disabled={enabled}
            onClick={() => void run(() => call("setBuiltins", {}, true))}
          >
            {enabled ? "In use" : "Use them"}
          </Button>
        </Row>
      </Group>
      <Group title="Animation for each state">
        {STATES.map(([key, label]) => (
          <Row key={key} label={label}>
            <Select
              label={label}
              value={state.builtins[key]}
              options={BUILTIN_VARIANTS[key].map((v) => ({
                value: v,
                label: BUILTIN_LABELS[v] ?? v,
              }))}
              onChange={(v) => void run(() => call("setBuiltins", { [key]: v }, enabled))}
            />
          </Row>
        ))}
      </Group>
    </>
  );
}
