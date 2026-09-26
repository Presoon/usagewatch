import { create } from "zustand";
import { DEFAULT_CONFIG, type AppConfig } from "./config";
import type { TrackerId, TrackerView } from "./trackers";
export type { AppConfig, IntervalMinutes, ThemeMode, WidgetConfig, WidgetEdge } from "./config";

export interface RuntimeSnapshot {
  config: AppConfig;
  views: Record<TrackerId, TrackerView>;
  nextUpdateAt: number | null;
  isUpdating: boolean;
}

interface RuntimeState extends RuntimeSnapshot {
  setConfig(config: AppConfig): void;
  patchConfig(patch: Partial<AppConfig>): AppConfig;
  setView(id: TrackerId, view: TrackerView): void;
  removeView(id: TrackerId): void;
  setClock(nextUpdateAt: number | null, isUpdating: boolean): void;
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  config: structuredClone(DEFAULT_CONFIG),
  views: {},
  nextUpdateAt: null,
  isUpdating: false,
  setConfig: (config) => set({ config }),
  patchConfig: (patch) => {
    const config = { ...get().config, ...patch };
    set({ config });
    return config;
  },
  setView: (id, view) => set((state) => ({ views: { ...state.views, [id]: view } })),
  removeView: (id) => set((state) => {
    if (!Object.prototype.hasOwnProperty.call(state.views, id)) return state;
    const views = { ...state.views };
    delete views[id];
    return { views };
  }),
  setClock: (nextUpdateAt, isUpdating) => set(state =>
    state.nextUpdateAt === nextUpdateAt && state.isUpdating === isUpdating
      ? state : { nextUpdateAt, isUpdating }),
}));

export function runtimeSnapshot(): RuntimeSnapshot {
  const { config, views, nextUpdateAt, isUpdating } = useRuntimeStore.getState();
  return { config, views, nextUpdateAt, isUpdating };
}
