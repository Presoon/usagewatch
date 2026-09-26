import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WidgetTip } from "./components/WidgetStrip";
import type { TrackerView } from "./core/trackers";
import type { WidgetTheme } from "./core/config";

type TipState = { revision: number; content: { view: TrackerView; center: number; theme: WidgetTheme } | null };

export function WidgetTipWindow() {
  const [tip, setTip] = useState<TipState>({ revision: 0, content: null });
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const accept = (next: TipState) => {
      if (!disposed) setTip(current => next.revision >= current.revision ? next : current);
    };
    void listen<TipState>("widget-tip-content", event => accept(event.payload)).then(async stop => {
      if (disposed) { stop(); return; }
      off = stop;
      accept(await invoke<TipState>("widget_tip_get"));
    }).catch(() => undefined);
    return () => { disposed = true; off?.(); };
  }, []);
  const show = useCallback((height: number) => {
    void invoke("widget_tip_show", { revision: tip.revision, height }).catch(() => undefined);
  }, [tip.revision]);
  return tip.content && <div data-widget-theme={tip.content.theme} onMouseLeave={() => void invoke("widget_tip_hide", { force: false })}
    onKeyDown={event => { if (event.key === "Escape") void invoke("widget_tip_hide", { force: true }); }}>
    <WidgetTip view={tip.content.view} edge="detached" onHeight={show} />
  </div>;
}
