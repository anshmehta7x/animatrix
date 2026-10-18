import { useEffect, useState, type ReactNode } from "react";
import {
  AudioWaveform,
  Clock,
  Clapperboard,
  Image,
  Layers,
  Settings2,
  Sparkles,
  BatteryCharging,
} from "lucide-react";
import { Preview } from "./components/Preview";
import {
  NavGrid,
  NoticeBar,
  Page,
  StatusFooter,
  TopControls,
  type NavItem,
} from "./components/Shell";
import { call } from "./lib/api";
import { BuiltinsPage } from "./pages/Builtins";
import { EffectPage } from "./pages/EffectPage";
import { EffectsPage } from "./pages/Effects";
import { MediaPage } from "./pages/Media";
import { PowerPage } from "./pages/Power";
import { ScenesPage } from "./pages/Scenes";
import { SettingsPage } from "./pages/Settings";
import styles from "./App.module.css";

const NAV: NavItem[] = [
  { id: "media", label: "Media", icon: <Image size={16} /> },
  { id: "clock", label: "Clock", icon: <Clock size={16} /> },
  { id: "visualiser", label: "Visualiser", icon: <AudioWaveform size={16} /> },
  { id: "effects", label: "Effects", icon: <Sparkles size={16} /> },
  { id: "builtins", label: "Built-ins", icon: <Clapperboard size={16} /> },
  { id: "scenes", label: "Scenes", icon: <Layers size={16} /> },
  { id: "power", label: "Power", icon: <BatteryCharging size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={16} /> },
];

function pageFor(id: string): ReactNode {
  switch (id) {
    case "media":
      return <MediaPage />;
    case "clock":
      return <EffectPage id="clock" startLabel="Show clock" hint="Digital, analogue or binary" />;
    case "visualiser":
      return (
        <EffectPage id="visualiser" startLabel="Start" hint="Follows whatever your speakers play" />
      );
    case "effects":
      return <EffectsPage />;
    case "builtins":
      return <BuiltinsPage />;
    case "scenes":
      return <ScenesPage />;
    case "power":
      return <PowerPage />;
    default:
      return <SettingsPage />;
  }
}

export function App(): ReactNode {
  const [page, setPage] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (page) setPage(null);
      else void call("hidePanel");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);
  return (
    <main className={styles.panel}>
      <Preview compact={page !== null} onDropped={() => setPage("media")} />
      <TopControls />
      <NoticeBar />
      {page ? (
        <Page title={NAV.find((n) => n.id === page)?.label ?? ""} onBack={() => setPage(null)}>
          {pageFor(page)}
        </Page>
      ) : (
        <>
          <NavGrid items={NAV} onOpen={setPage} />
          <StatusFooter />
        </>
      )}
    </main>
  );
}
