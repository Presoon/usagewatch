import type { InfoRowData, Meter, ProviderSnapshot } from "../../core/types";
import { meterState } from "../../core/usage";
import type { ZaiLimitItem, ZaiQuotaLimitResponse } from "./api";

function resetIso(timestampMs: number | undefined): string | null {
  if (!timestampMs || timestampMs <= 0) return null;
  const d = new Date(timestampMs);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Percentage quota window: CREDIT_LIMIT today, TOKENS_LIMIT in older responses. */
function isCredit(item: ZaiLimitItem): boolean {
  return item.type === "CREDIT_LIMIT" || item.type === "TOKENS_LIMIT";
}

/**
 * Z.ai sends one credit window per cycle (5h and weekly). `unit` encodes the
 * window length (3 = 5h, 6 = 7d); when it is missing we fall back to order.
 * ponytail: order fallback, revisit if Z.ai ever adds a third credit window.
 */
function creditId(item: ZaiLimitItem, index: number): "session" | "weekly" {
  if (typeof item.unit === "number") return item.unit >= 6 ? "weekly" : "session";
  return index === 0 ? "session" : "weekly";
}

export function parseZaiQuotaLimit(response: ZaiQuotaLimitResponse): ProviderSnapshot {
  const limits = response.data?.limits ?? [];
  const meters: Meter[] = [];
  const infoRows: InfoRowData[] = [];
  let creditIndex = 0;

  for (const item of limits) {
    const credit = isCredit(item);
    const time = item.type === "TIME_LIMIT";
    const id = credit ? creditId(item, creditIndex++) : time ? "monthly" : item.type.toLowerCase();
    const label = id === "session" ? "Session (5h)" : id === "weekly" ? "Weekly" : time ? "Web searches (monthly)" : item.type;

    let usedPercent: number | null = null;
    if (typeof item.percentage === "number") {
      usedPercent = item.percentage;
    } else if (typeof item.currentValue === "number" && typeof item.usage === "number" && item.usage > 0) {
      usedPercent = (item.currentValue / item.usage) * 100;
    }

    if (usedPercent !== null) {
      const percentLeft = Math.max(0, Math.min(100, Math.round(100 - usedPercent)));
      meters.push({
        id,
        label,
        percentLeft,
        state: meterState(percentLeft),
        resetsAt: resetIso(typeof item.nextResetTime === "number" ? item.nextResetTime : undefined),
      });
    }

    if (typeof item.currentValue === "number" && typeof item.usage === "number") {
      infoRows.push({
        label: credit ? (id === "weekly" ? "Tokens (weekly)" : "Tokens (5h)") : label,
        value: `${item.currentValue.toLocaleString("en-US")} / ${item.usage.toLocaleString("en-US")}`,
      });
    }
  }

  const plan = response.data?.plan;
  const planLabel = typeof plan === "string" && plan.trim() ? plan.trim() : "Coding Plan";

  return {
    providerId: "zai",
    planLabel,
    accountLabel: null,
    meters,
    infoRows,
    fetchedAt: new Date().toISOString(),
  };
}
