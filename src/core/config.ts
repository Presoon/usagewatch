import { PROVIDERS, type ProviderId } from "./types";
import type { TrackerConfig } from "./trackers";
import { credentialKey } from "./credentials";

export type TrayMode = "per-tracker" | "single" | "single-worst";
export type ConfigUpdate = Partial<AppConfig> | ((config: AppConfig) => Partial<AppConfig>);
export type ThemeMode = "auto" | "light" | "dark";
export type TrayTextTheme = ThemeMode;
export type IntervalMinutes = 3 | 5 | 10 | 15 | 30 | 60;
export type WidgetEdge = "left" | "right" | "top" | "bottom";
export type WidgetTheme = "light" | "gray" | "dark";

export interface WidgetConfig {
  enabled: boolean;
  theme: WidgetTheme;
  edge: WidgetEdge;
  posPercent: number;
  monitor: string | null;
}

export interface NotificationsConfig {
  enabled: boolean;
  warnBelow25: boolean;
  alertLimit: boolean;
  notifyReset: boolean;
}

export interface AppConfig {
  version: 2;
  intervalMinutes: IntervalMinutes;
  /** Array order is display order; there is no second order field to drift. */
  trackers: TrackerConfig[];
  trayMode: TrayMode;
  trayTextTheme: TrayTextTheme;
  theme: ThemeMode;
  notifications: NotificationsConfig;
  widget: WidgetConfig;
  launchAtStartup: boolean;
}

export const PROVIDER_ORDER: ProviderId[] = PROVIDERS.map((p) => p.id);
export const DEFAULT_CONFIG: AppConfig = {
  version: 2,
  intervalMinutes: 5,
  trackers: PROVIDERS.map(({ id, name }) => ({
    id: `legacy-${id}`, providerId: id, name, enabled: true,
  })),
  trayMode: "per-tracker",
  trayTextTheme: "auto",
  theme: "auto",
  notifications: { enabled: true, warnBelow25: true, alertLimit: true, notifyReset: true },
  widget: { enabled: false, theme: "dark", edge: "right", posPercent: 0.5, monitor: null },
  launchAtStartup: false,
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid configuration");
  return value as Record<string, unknown>;
}

function trackersFrom(value: unknown): TrackerConfig[] {
  if (!Array.isArray(value)) throw new Error("Invalid trackers");
  const ids = new Set<string>();
  return value.map((item) => {
    const tracker = record(item);
    if (typeof tracker.id !== "string" || ids.has(tracker.id) ||
      !PROVIDER_ORDER.includes(tracker.providerId as ProviderId) ||
      typeof tracker.name !== "string" || !tracker.name.trim() || tracker.name.length > 80 ||
      typeof tracker.enabled !== "boolean") throw new Error("Invalid tracker configuration");
    if (tracker.hiddenMeterIds !== undefined && (!Array.isArray(tracker.hiddenMeterIds) ||
      tracker.hiddenMeterIds.some(id => typeof id !== "string" || !id || id.length > 256))) {
      throw new Error("Invalid hidden limits");
    }
    const result = { id: tracker.id, providerId: tracker.providerId as ProviderId,
      ...(tracker.hiddenMeterIds === undefined ? {} : { hiddenMeterIds: [...new Set(tracker.hiddenMeterIds as string[])] }),
      name: tracker.name.trim(), enabled: tracker.enabled };
    credentialKey(result);
    ids.add(result.id);
    return result;
  });
}

/** Reject malformed/future data instead of overwriting it with fresh defaults. */
export function parseConfig(value: unknown): AppConfig {
  if (value == null) return { ...structuredClone(DEFAULT_CONFIG), trackers: [] };
  const stored = record(value);
  if (stored.version !== undefined && stored.version !== 1 && stored.version !== 2) {
    throw new Error("This configuration requires a newer UsageWatch");
  }
  const defaults = structuredClone(DEFAULT_CONFIG);
  let trackers = defaults.trackers;
  if (stored.version === 2 || stored.trackers !== undefined) trackers = trackersFrom(stored.trackers);
  else if (stored.providers !== undefined) {
    const legacy = record(stored.providers);
    trackers = trackers.map((tracker) => {
      const entry = legacy[tracker.providerId] === undefined ? {} : record(legacy[tracker.providerId]);
      if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") throw new Error("Invalid provider settings");
      return { ...tracker, enabled: (entry.enabled as boolean | undefined) ?? true };
    }).sort((a, b) => {
      const order = (id: ProviderId) => {
        const entry = legacy[id] as Record<string, unknown> | undefined;
        return typeof entry?.order === "number" ? entry.order : PROVIDER_ORDER.indexOf(id);
      };
      return order(a.providerId) - order(b.providerId);
    });
  }
  const widget = stored.widget === undefined ? {} : record(stored.widget);
  const notifications = stored.notifications === undefined ? {} : record(stored.notifications);
  const config = {
    ...defaults, ...stored, version: 2, trackers,
    trayMode: stored.trayMode === "per-provider" ? "per-tracker" : stored.trayMode ?? defaults.trayMode,
    notifications: { ...defaults.notifications, ...notifications },
    widget: { ...defaults.widget, ...widget,
      posPercent: widget.posPercent ?? widget.posPercentY ?? defaults.widget.posPercent },
  } as AppConfig;
  if (![3, 5, 10, 15, 30, 60].includes(config.intervalMinutes) ||
    !["auto", "light", "dark"].includes(config.theme) ||
    !["auto", "light", "dark"].includes(config.trayTextTheme) ||
    !["per-tracker", "single", "single-worst"].includes(config.trayMode) ||
    typeof config.launchAtStartup !== "boolean" ||
    typeof config.widget.enabled !== "boolean" ||
    !["light", "gray", "dark"].includes(config.widget.theme) ||
    !["left", "right", "top", "bottom"].includes(config.widget.edge) ||
    typeof config.widget.posPercent !== "number" || !Number.isFinite(config.widget.posPercent) ||
    config.widget.posPercent < 0 || config.widget.posPercent > 1 ||
    (config.widget.monitor !== null && typeof config.widget.monitor !== "string") ||
    Object.keys(defaults.notifications).some(key => typeof config.notifications[key as keyof NotificationsConfig] !== "boolean")) {
    throw new Error("Invalid application settings");
  }
  // Whitelist fields: old providers and unknown fields must not be persisted.
  return {
    version: 2, trackers, intervalMinutes: config.intervalMinutes,
    trayMode: config.trayMode, trayTextTheme: config.trayTextTheme, theme: config.theme,
    launchAtStartup: config.launchAtStartup,
    notifications: { enabled: config.notifications.enabled, warnBelow25: config.notifications.warnBelow25,
      alertLimit: config.notifications.alertLimit, notifyReset: config.notifications.notifyReset },
    widget: { enabled: config.widget.enabled, theme: config.widget.theme, edge: config.widget.edge,
      posPercent: config.widget.posPercent, monitor: config.widget.monitor },
  };
}
