import type { ReactNode } from "react";
import { ParamsForm } from "../components/ParamsForm";
import { Button, Group, Row } from "../components/controls";
import { call, effectForFile } from "../lib/api";
import { useStore } from "../lib/store";

const ACCEPT = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "svg",
  "gif",
  "avif",
  "apng",
  "mp4",
  "mkv",
  "webm",
  "mov",
];

export function MediaPage(): ReactNode {
  const { state, effect, run } = useStore();
  const active =
    state && ["image", "gif", "video"].includes(state.effect ?? "") ? effect(state.effect!) : null;
  const choose = async (): Promise<void> => {
    const path = (await call("pickFile", ACCEPT)) as string | null;
    if (path) await call("play", effectForFile(path), { file: path });
  };
  const file = active ? String(state?.params.file ?? "") : "";
  return (
    <>
      <Group>
        <Row
          label={file ? file.split("/").pop()! : "No media playing"}
          hint="Images, GIFs and videos. You can also drop a file on the preview."
        >
          <Button kind="primary" onClick={() => void run(choose)}>
            Choose…
          </Button>
        </Row>
      </Group>
      {active && <ParamsForm effect={active} hide={["file"]} />}
    </>
  );
}
