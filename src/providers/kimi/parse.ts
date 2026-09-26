import type { InfoRowData, Meter, ProviderSnapshot } from "../../core/types";
import { meterState } from "../../core/usage";
import type { KimiNumber, KimiRateLimit, KimiUsageDetail, KimiUsageResponse } from "./api";

function numeric(value: KimiNumber | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resetIso(detail: KimiUsageDetail): string | null {
  const raw = detail.resetTime ?? detail.resetAt ?? detail.reset_time ?? detail.reset_at;
  if (!raw) return null;
  // Kimi commonly returns nanoseconds; Date only needs millisecond precision.
  const normalized = raw.replace(/\.(\d{3})\d+(?=Z$)/, ".$1");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function usageValues(detail: KimiUsageDetail): { limit: number; used: number; remaining: number } | null {
  const limit = numeric(detail.limit);
  if (limit === null || limit <= 0) return null;
  const explicitUsed = numeric(detail.used);
  const explicitRemaining = numeric(detail.remaining);
  const used = Math.max(0, explicitUsed ?? Math.max(0, limit - (explicitRemaining ?? limit)));
  const remaining = Math.max(0, explicitRemaining ?? limit - used);
  return { limit, used, remaining };
}

function toMeter(id: string, label: string, detail: KimiUsageDetail | undefined): Meter | null {
  if (!detail) return null;
  const values = usageValues(detail);
  if (!values) return null;
  const percentLeft = Math.max(0, Math.min(100, Math.round((values.remaining / values.limit) * 100)));
  return { id, label, percentLeft, resetsAt: resetIso(detail), state: meterState(percentLeft) };
}

function windowMinutes(limit: KimiRateLimit): number | null {
  const duration = numeric(limit.window?.duration);
  if (duration === null) return null;
  const unit = (limit.window?.timeUnit ?? limit.window?.time_unit ?? "").toUpperCase();
  if (unit.includes("MINUTE")) return duration;
  if (unit.includes("HOUR")) return duration * 60;
  if (unit.includes("SECOND")) return duration / 60;
  return duration;
}

function sessionDetail(limits: KimiRateLimit[] | undefined): KimiUsageDetail | undefined {
  const usable = (limits ?? []).filter((limit) => usageValues(limit.detail ?? {}) !== null);
  return usable.find((limit) => Math.abs((windowMinutes(limit) ?? 0) - 300) < 0.01)?.detail ?? usable[0]?.detail;
}

function planLabel(response: KimiUsageResponse): string {
  const label = response.planName ?? response.plan ?? response.tier;
  return typeof label === "string" && label.trim() ? label.trim() : "Kimi Code";
}

export function parseKimiUsage(response: KimiUsageResponse): ProviderSnapshot {
  const meters: Meter[] = [];
  const session = toMeter("session", "Session (5h)", sessionDetail(response.limits));
  const weekly = toMeter("weekly", "Weekly", response.usage);
  if (session) meters.push(session);
  if (weekly) meters.push(weekly);

  const infoRows: InfoRowData[] = [];
  const weeklyValues = response.usage ? usageValues(response.usage) : null;
  if (weeklyValues) {
    infoRows.push({
      label: "Requests",
      value: `${Math.round(weeklyValues.used)} / ${Math.round(weeklyValues.limit)}`,
    });
  }

  return {
    providerId: "kimi",
    planLabel: planLabel(response),
    accountLabel: null,
    meters,
    infoRows,
    fetchedAt: new Date().toISOString(),
  };
}
