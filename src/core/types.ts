// Provider API data. Tracker identity and presentation live in trackers.ts.

/**
 * Every supported provider in default display order. Adding an entry here is
 * the first step of a new integration; TypeScript then points at every
 * remaining `Record<ProviderId, …>` that needs a value (see CONTRIBUTING.md).
 */
export const PROVIDERS = [
  { id: "claude", name: "Claude" },
  { id: "codex", name: "Codex" },
  { id: "gemini", name: "Gemini" },
  { id: "kimi", name: "Kimi" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "zai", name: "Z.Ai" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const PROVIDER_NAMES = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name])) as Record<ProviderId, string>;

export type MeterState = "ok" | "warn" | "danger" | "limit";

export interface Meter {
  id: string; // "session" | "weekly" | "weekly_opus" | "pro" | …
  label: string; // "Session", "Weekly", "Pro"…
  percentLeft: number | null; // 0–100; null => don't render a bar
  resetsAt: string | null; // ISO 8601
  state: MeterState;
}

export interface InfoRowData {
  label: string;
  value: string;
  tooltip?: string;
}

export interface ProviderSnapshot {
  providerId: ProviderId;
  planLabel: string | null; // "Team", "Plus", "AI Pro", "Kimi Code"…
  accountLabel: string | null; // e-mail, if known
  meters: Meter[];
  infoRows: InfoRowData[];
  fetchedAt: string; // ISO
}

export type AccountStatus = "signed_in" | "signed_out" | "expired" | "unsupported";
