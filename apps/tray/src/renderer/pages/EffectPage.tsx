import type { ReactNode } from "react";
import { ParamsForm } from "../components/ParamsForm";
import { Button, Group, Row } from "../components/controls";
import { call } from "../lib/api";
import { useStore } from "../lib/store";

/** A page for one effect: start it, then tweak it live. Used for Clock and Visualiser. */
export function EffectPage({
  id,
  startLabel,
  hint,
}: {
  id: string;
  startLabel: string;
  hint: string;
}): ReactNode {
  const { state, effect, run } = useStore();
  const info = effect(id);
  if (!info) return null;
  const active = state?.effect === id;
  return (
    <>
      {!active && (
        <Group>
          <Row label={info.name} hint={hint}>
            <Button kind="primary" onClick={() => void run(() => call("play", id, {}))}>
              {startLabel}
            </Button>
          </Row>
        </Group>
      )}
      <ParamsForm effect={info} />
    </>
  );
}
