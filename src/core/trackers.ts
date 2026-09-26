import type { ProviderId, ProviderSnapshot } from "./types";

export type TrackerId = string;

/** Identity belongs to the tracker; providerId selects its implementation. */
export interface TrackerConfig {
  id: TrackerId;
  providerId: ProviderId;
  name: string;
  enabled: boolean;
  hiddenMeterIds?: string[];
}

export type TrackerCardState =
  | "ok"
  | "loading"
  | "stale"
  | "signin-required"
  | "unsupported"
  | "error"
  | "limit";

export interface TrackerView {
  trackerId: TrackerId;
  providerId: ProviderId;
  displayName: string;
  cardState: TrackerCardState;
  snapshot: ProviderSnapshot | null; // present for ok / stale / limit
  hasCliCredentials?: boolean; // signin-required: also offer "Import from CLI"
  errorMessage?: string; // error state
  rateLimitedUntil?: number; // epoch ms; last data stays visible during the cooldown
  staleSince?: string | null; // stale: ISO of the last successful fetch
  hiddenMeterIds?: string[];
}

export function visibleMeters(view: TrackerView) {
  const meters = view.snapshot?.meters ?? [];
  const hidden = view.hiddenMeterIds;
  return hidden?.length ? meters.filter(m => !hidden.includes(m.id)) : meters;
}

export function loadingView(tracker: TrackerConfig): TrackerView {
  return {
    trackerId: tracker.id,
    providerId: tracker.providerId,
    displayName: tracker.name,
    hiddenMeterIds: tracker.hiddenMeterIds,
    cardState: "loading",
    snapshot: null,
  };
}

export function selectTrackerViews(
  trackers: TrackerConfig[],
  views: Record<TrackerId, TrackerView>,
): TrackerView[] {
  return trackers.filter((tracker) => tracker.enabled).map((tracker) => ({
    ...(views[tracker.id] ?? loadingView(tracker)),
    displayName: tracker.name,
    hiddenMeterIds: tracker.hiddenMeterIds,
  }));
}
