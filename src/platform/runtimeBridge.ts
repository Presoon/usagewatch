import { emitTo, listen } from "@tauri-apps/api/event";
import { runtimeSnapshot, useRuntimeStore, type RuntimeSnapshot } from "../core/store";
import type { TrackerRuntime } from "../core/trackerRuntime";
import type { WidgetConfig } from "../core/config";

/** Only the main webview owns clients, tokens, polling and configuration writes. */
export async function startRuntimeHost(runtime: TrackerRuntime): Promise<() => void> {
  const stops: (() => void)[] = [];
  const generation = Date.now();
  let revision = 0;
  const publish = () => { void emitTo("widget", "runtime-snapshot", {
    generation, revision: ++revision, snapshot: runtimeSnapshot(),
  }).catch(() => undefined); };
  try {
    stops.push(await listen("poll-tick", () => { void runtime.tick(); }));
    stops.push(await listen("runtime-request", publish));
    stops.push(await listen<Partial<WidgetConfig>>("widget-config-change", ({ payload }) => {
      void runtime.update(config => ({ widget: { ...config.widget, ...payload } })).catch(error => {
        void emitTo("widget", "runtime-error", error instanceof Error ? error.message : "Unable to save widget settings");
      });
    }));
    stops.push(useRuntimeStore.subscribe(publish));
    publish();
    return () => stops.forEach(stop => stop());
  } catch (error) {
    stops.forEach(stop => stop());
    throw error;
  }
}

export async function mirrorRuntime(onError: (message: string) => void): Promise<() => void> {
  const stops: (() => void)[] = [];
  let revision = -1;
  let generation = -1;
  try {
    stops.push(await listen<{ generation: number; revision: number; snapshot: RuntimeSnapshot }>("runtime-snapshot", ({ payload }) => {
      if (payload.generation < generation || (payload.generation === generation && payload.revision <= revision)) return;
      generation = payload.generation;
      revision = payload.revision;
      useRuntimeStore.setState(payload.snapshot);
    }));
    stops.push(await listen<string>("runtime-error", ({ payload }) => onError(payload)));
    await emitTo("main", "runtime-request");
    return () => stops.forEach(stop => stop());
  } catch (error) {
    stops.forEach(stop => stop());
    throw error;
  }
}

export async function updateWidgetConfig(patch: Partial<WidgetConfig>): Promise<void> {
  await emitTo("main", "widget-config-change", patch);
}
