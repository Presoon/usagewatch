// Pure parser: Claude usage JSON -> ProviderSnapshot.
// Testable against fixtures/real/claude.json.
import type { Meter, ProviderSnapshot, InfoRowData } from "../../core/types";
import { meterState } from "../../core/usage";
import type { ClaudeCreditsResponse, ClaudeUsageResponse, ClaudeUsageWindow } from "./api";

function toMeter(id: string, label: string, w: ClaudeUsageWindow | null | undefined): Meter | null {
  if (!w || typeof w.utilization !== "number") return null; // null window => not on this plan
  const percentLeft = Math.max(0, Math.min(100, Math.round(100 - w.utilization)));
  return { id, label, percentLeft, resetsAt: w.resets_at ?? null, state: meterState(percentLeft) };
}

// Known windows in display order; unknown keys are ignored.
const WINDOWS: Array<{ key: keyof ClaudeUsageResponse; id: string; label: string }> = [
  { key: "five_hour", id: "session", label: "Session" },
  { key: "seven_day", id: "weekly", label: "Weekly" },
  { key: "seven_day_opus", id: "weekly_opus", label: "Weekly (Opus)" },
  { key: "seven_day_sonnet", id: "weekly_sonnet", label: "Weekly (Sonnet)" },
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMinorAmount(amount: unknown, currency: unknown, exponent?: number | null): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || typeof currency !== "string" || !/^[a-z]{3}$/i.test(currency)) return null;
  const format = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const decimals = exponent ?? format.resolvedOptions().maximumFractionDigits;
  if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) return null;
  return format.format(amount / 10 ** decimals);
}

export function parseClaudeUsage(
  res: ClaudeUsageResponse,
  subscriptionType: string | null,
  credits: ClaudeCreditsResponse | null = null,
): ProviderSnapshot {
  const meters: Meter[] = [];
  for (const w of WINDOWS) {
    const m = toMeter(w.id, w.label, res[w.key] as ClaudeUsageWindow | null | undefined);
    if (m) meters.push(m);
  }

  const infoRows: InfoRowData[] = [];
  const money = credits?.balance?.money;
  const balance = formatMinorAmount(money?.amount_minor ?? credits?.amount, money?.currency ?? credits?.currency, money?.exponent);
  infoRows.push({ label: "Credits", value: balance ?? "Unavailable", tooltip: balance === null ? "Unable to fetch credit balance" : "Prepaid credit balance, including promotional funds" });
  const extra = res.extra_usage;
  if (extra?.is_enabled) {
    const used = formatMinorAmount(extra.used_credits, extra.currency ?? "USD", extra.decimal_places);
    const limit = formatMinorAmount(extra.monthly_limit, extra.currency ?? "USD", extra.decimal_places);
    if (used !== null) {
      const value = limit !== null ? `${used} of ${limit}` : `${used} spent`;
      infoRows.push({ label: "Extra usage", value, tooltip: "Monthly spending beyond your plan, separate from your credit balance" });
    }
  }

  return {
    providerId: "claude",
    planLabel: subscriptionType ? capitalize(subscriptionType) : null,
    accountLabel: null,
    meters,
    infoRows,
    fetchedAt: new Date().toISOString(),
  };
}
