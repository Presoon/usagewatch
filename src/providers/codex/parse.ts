import type { InfoRowData, Meter, ProviderSnapshot } from "../../core/types";
import { meterState } from "../../core/usage";
import type {
  CodexAdditionalLimit,
  CodexRateLimit,
  CodexRateLimitWindow,
  CodexUsageResponse,
} from "./api";

function numberValue(...values: unknown[]): number | null {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function durationMinutes(window: CodexRateLimitWindow): number | null {
  const direct = numberValue(window.windowDurationMins, window.window_minutes);
  if (direct !== null) return direct;
  const seconds = numberValue(window.limit_window_seconds);
  return seconds === null ? null : seconds / 60;
}

function resetIso(window: CodexRateLimitWindow): string | null {
  const value = window.reset_at ?? window.resets_at ?? window.resetsAt;
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const numeric = Number(value);
  const timestamp = Number.isNaN(numeric) && typeof value === "string"
    ? Date.parse(value) : numeric > 1e12 ? numeric : numeric * 1000;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function windowIdentity(
  window: CodexRateLimitWindow,
  fallback: "primary" | "secondary",
  prefix = "",
): { id: string; label: string } {
  const minutes = durationMinutes(window);
  const suffix = prefix ? ` (${prefix})` : "";
  if (minutes !== null && Math.abs(minutes - 300) <= 30) {
    return { id: prefix ? `session_${prefix.toLowerCase()}` : "session", label: `Session${suffix}` };
  }
  if (minutes !== null && Math.abs(minutes - 10_080) <= 180) {
    return { id: prefix ? `weekly_${prefix.toLowerCase()}` : "weekly", label: `Weekly${suffix}` };
  }
  return {
    id: prefix ? `${fallback}_${prefix.toLowerCase()}` : fallback,
    label: `${fallback === "primary" ? "Primary limit" : "Secondary limit"}${suffix}`,
  };
}

function toMeter(
  window: CodexRateLimitWindow | null | undefined,
  fallback: "primary" | "secondary",
  prefix = "",
): Meter | null {
  if (!window) return null;
  const used = numberValue(window.used_percent, window.usedPercent);
  if (used === null) return null;
  const percentLeft = Math.max(0, Math.min(100, Math.round(100 - used)));
  return {
    ...windowIdentity(window, fallback, prefix),
    percentLeft,
    resetsAt: resetIso(window),
    state: meterState(percentLeft),
  };
}

function addWindows(meters: Meter[], rateLimit: CodexRateLimit | null | undefined, prefix = ""): void {
  if (!rateLimit) return;
  const primary = toMeter(rateLimit.primary_window ?? rateLimit.primary, "primary", prefix);
  const secondary = toMeter(rateLimit.secondary_window ?? rateLimit.secondary, "secondary", prefix);
  if (primary) meters.push(primary);
  if (secondary) meters.push(secondary);
}

function additionalLabel(limit: CodexAdditionalLimit): string {
  const raw = limit.limit_name ?? limit.model_name ?? limit.model_id ?? "Additional";
  return raw
    .replace(/^codex[-_ ]?/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleCase(value: string): string {
  const titled = value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return titled.replace(/Chatgpt/g, "ChatGPT");
}

export function parseCodexUsage(
  response: CodexUsageResponse,
  account: { planType: string | null; email: string | null },
): ProviderSnapshot {
  const meters: Meter[] = [];
  addWindows(meters, response.rate_limit ?? response.rateLimits);
  for (const additional of response.additional_rate_limits ?? []) {
    addWindows(meters, additional.rate_limit, additionalLabel(additional));
  }

  const credits = response.rate_limit_reset_credits ?? response.rateLimitResetCredits;
  const available = numberValue(
    credits?.available_count,
    credits?.availableCount,
    credits?.credits,
  );
  const infoRows: InfoRowData[] = [];
  const rawBalance = response.credits?.balance;
  const balance = typeof rawBalance === "string" && rawBalance.trim() ? Number(rawBalance) : rawBalance;
  const validBalance = typeof balance === "number" && Number.isFinite(balance) && balance >= 0;
  if (response.credits?.unlimited === true || validBalance) {
    infoRows.push({
      label: "Credits",
      value: response.credits?.unlimited === true ? "Unlimited" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(balance as number),
      tooltip: "Credit balance reported by Codex",
    });
  }
  if (available !== null && Number.isSafeInteger(available) && available >= 0) {
    infoRows.push({
      label: "Resets",
      value: `${available} available`,
      tooltip: "Unused limit resets on this account; redemption eligibility can depend on current usage",
    });
  }

  const planType = response.plan_type ?? account.planType;
  return {
    providerId: "codex",
    planLabel: planType ? titleCase(planType) : null,
    accountLabel: response.email ?? account.email,
    meters,
    infoRows,
    fetchedAt: new Date().toISOString(),
  };
}
