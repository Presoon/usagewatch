import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useRuntimeStore, type WidgetConfig, type WidgetEdge } from "./core/store";
import { mirrorRuntime, updateWidgetConfig } from "./platform/runtimeBridge";
import {
  WidgetStrip,
  WIDGET_FOOTER,
  WIDGET_CONCAVE,
  isHorizontal,
  widgetDepth,
  widgetLength,
} from "./components/WidgetStrip";
import { selectTrackerViews, type TrackerView } from "./core/trackers";

/** Placement the Rust side reports back after a drag. */
type WidgetPlacement = { edge: WidgetEdge; posPercent: number; monitor: string | null };

/** Hover must never resize the widget's WebView2 surface. */
export function widgetWindowSize(edge: WidgetEdge, count: number): [number, number] {
  const length = widgetLength(count);
  const depth = widgetDepth(edge);
  if (isHorizontal(edge)) {
    return [length, depth + WIDGET_FOOTER];
  }
  return [depth, length + WIDGET_FOOTER - WIDGET_CONCAVE];
}

export function WidgetWindow() {
  const config = useRuntimeStore((state) => state.config);
  const runtimeViews = useRuntimeStore((state) => state.views);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [error, setError] = useState<string | null>(null);
  // Live placement during a drag; config catches up when the drag ends.
  const [edge, setEdge] = useState<WidgetEdge>(config.widget.edge);

  useEffect(() => {
    const stop = mirrorRuntime(setError);
    void stop.catch(cause => setError(String(cause)));
    return () => { void stop.then(off => off()).catch(() => undefined); };
  }, []);

  useEffect(() => setEdge(config.widget.edge), [config.widget.edge]);

  const views = useMemo(() => selectTrackerViews(config.trackers, runtimeViews), [config.trackers, runtimeViews]);

  // The main window already mirrors widget config to Rust. Resize only for
  // account count / edge changes, never for hover or preview measurements.
  const [width, height] = widgetWindowSize(edge, views.length);
  useEffect(() => {
    void invoke("resize_widget", { width, height }).catch(() => undefined);
  }, [width, height]);

  const changeTip = useCallback((view: TrackerView | null, center: number) => {
    clearTimeout(leaveTimer.current);
    if (view) void invoke("widget_tip_set", { view, center, theme: config.widget.theme }).catch(cause => setError(String(cause)));
    else leaveTimer.current = setTimeout(() => {
      void invoke("widget_tip_hide", { force: false }).catch(() => undefined);
    }, 150); // Allow crossing the gap into the scrollable preview.
  }, [config.widget.theme]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const persist = (patch: Partial<WidgetConfig>) => {
    void updateWidgetConfig(patch).catch(cause => setError(String(cause)));
  };

  return (
    <>
    {error && <div role="alert" className="popup__notice">{error}</div>}
    <WidgetStrip
      views={views}
      edge={edge}
      theme={config.widget.theme}
      onTipChange={changeTip}
      onDrag={() => {
        void invoke<WidgetPlacement>("move_widget")
          .then((placement) => setEdge(placement.edge))
          .catch(() => undefined);
      }}
      onDragEnd={() => {
        void invoke<WidgetPlacement>("move_widget")
          .then((placement) => persist(placement))
          .catch(() => undefined);
      }}
      onToggle={() => void emit("show-main")}
      onExit={() => persist({ enabled: false })}
      onOpenSettings={() => void emit("show-main", "settings")}
    />
    </>
  );
}
