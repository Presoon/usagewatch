// Mock data for UI development (`npm run dev:mock`). The first entries are
// happy-path cards; the rest demonstrate the remaining card states.

import { PROVIDER_NAMES, type Meter, type ProviderId, type ProviderSnapshot } from "../core/types";

import type { TrackerView } from "../core/trackers";

const H = 3_600_000;
const D = 86_400_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const now = () => new Date().toISOString();

function meter(
  id: string,
  label: string,
  percentLeft: number | null,
  resetsInMs: number | null,
  state: Meter["state"] = "ok",
): Meter {
  return { id, label, percentLeft, resetsAt: resetsInMs == null ? null : iso(resetsInMs), state };
}

const limitMeter = (id: string, label: string, resetsInMs: number | null): Meter => ({
  id,
  label,
  percentLeft: 0,
  resetsAt: resetsInMs == null ? null : iso(resetsInMs),
  state: "limit",
});

function snapshot(
  providerId: ProviderId,
  planLabel: string | null,
  accountLabel: string | null,
  meters: Meter[],
  infoRows: ProviderSnapshot["infoRows"] = [],
): ProviderSnapshot {
  return { providerId, planLabel, accountLabel, meters, infoRows, fetchedAt: now() };
}

const ok = (snap: ProviderSnapshot): Omit<TrackerView, "trackerId"> => ({
  providerId: snap.providerId,
  displayName: PROVIDER_NAMES[snap.providerId],
  cardState: "ok",
  snapshot: snap,
});

// ---- Happy-path snapshots ---------------------------------------------------

const claudeOk = snapshot(
  "claude",
  "Team",
  "you@example.com",
  [
    meter("session", "Session", 100, 5 * H),
    meter("weekly", "Weekly", 81, 40 * H), // "Resets in 1d 16h"
    meter("weekly_opus", "Weekly (Opus)", 64, 40 * H),
  ],
  [
    { label: "Credits", value: "€67.69", tooltip: "Prepaid credit balance, including promotional funds" },
    { label: "Extra usage", value: "$12.40 spent", tooltip: "Usage billed beyond your plan" },
  ],
);

const codexOk = snapshot(
  "codex",
  "Plus",
  "you@example.com",
  [
    meter("session", "Session", 72, 3 * H),
    meter("weekly", "Weekly", 45, 4 * D + 2 * H),
  ],
  [
    { label: "Credits", value: "120", tooltip: "Credit balance reported by Codex" },
    { label: "Resets", value: "2 available", tooltip: "Unused limit resets on this account" },
  ],
);

const geminiOk = snapshot("gemini", "AI Pro", "you@example.com", [
  meter("pro", "Pro", 88, 12 * H + 30 * 60_000),
  meter("flash", "Flash", 95, 12 * H + 30 * 60_000),
]);

const kimiOk = snapshot(
  "kimi",
  "Kimi Code",
  null,
  [
    meter("session", "Session", 100, 4 * H + 45 * 60_000),
    meter("weekly", "Weekly", 60, 3 * D),
  ],
  [{ label: "Requests", value: "340 / 1000" }],
);

const openrouterOk = snapshot(
  "openrouter",
  null,
  null,
  [meter("credits", "Credits", 66, null)],
  [
    { label: "Balance", value: "$33.00 / $50.00" },
    { label: "Spent", value: "$17.00", tooltip: "Total billed usage" },
  ],
);

// ---- State demos -----------------------------------------------------------

const zaiOk = snapshot(
  "zai",
  "Pro",
  null,
  [
    meter("session", "Session (5h)", 85, 3 * H),
    meter("weekly", "Weekly", 60, 4 * D),
    meter("monthly", "Web searches (monthly)", 95, 14 * D),
  ],
  [
    { label: "Tokens (5h)", value: "150,000 / 1,000,000" },
    { label: "Tokens (weekly)", value: "4,000,000 / 10,000,000" },
    { label: "Web searches (monthly)", value: "5 / 100" },
  ],
);

const claudeWarn = snapshot("claude", "Max", "you@example.com", [
  meter("session", "Session", 14, 2 * H, "warn"), // <20 → warn (amber)
  meter("weekly", "Weekly", 6, 30 * H, "danger"), // <8 → danger (red)
]);

const codexLimit = snapshot("codex", "Pro", "you@example.com", [
  limitMeter("session", "Session", 55 * 60_000),
  meter("weekly", "Weekly", 22, 5 * D),
]);

const geminiStaleSnap = snapshot("gemini", "AI Pro", "you@example.com", [
  meter("pro", "Pro", 40, 8 * H),
  meter("flash", "Flash", 77, 8 * H),
]);

const gallery: Omit<TrackerView, "trackerId">[] = [
  // Happy path — compare with the reference screenshot.
  ok(claudeOk),
  ok(codexOk),
  ok(geminiOk),
  ok(kimiOk),
  ok(openrouterOk),
  ok(zaiOk),
  // State gallery. (A "warn" card is just `ok` with amber/red meters.)
  ok(claudeWarn),
  { providerId: "codex", displayName: "Codex", cardState: "limit", snapshot: codexLimit },
  {
    providerId: "gemini",
    displayName: "Gemini",
    cardState: "stale",
    snapshot: geminiStaleSnap,
    staleSince: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    providerId: "kimi",
    displayName: "Kimi",
    cardState: "signin-required",
    snapshot: null,
    hasCliCredentials: true,
  },
  {
    providerId: "gemini",
    displayName: "Gemini",
    cardState: "error",
    snapshot: null,
    errorMessage: "Unsupported account",
  },
  { providerId: "claude", displayName: "Claude", cardState: "loading", snapshot: null },
];

export const mockViews = gallery.map((view, index) => ({ ...view, trackerId: `mock-${index}` }));
