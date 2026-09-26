import type { InfoRowData, Meter, ProviderSnapshot } from "../../core/types";
import { meterState } from "../../core/usage";
import type { OpenRouterCreditsResponse } from "./api";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function parseOpenRouterCredits(response: OpenRouterCreditsResponse): ProviderSnapshot {
  const totalCredits = response.data?.total_credits ?? 0;
  const totalUsage = response.data?.total_usage ?? 0;
  const remaining = Math.max(0, totalCredits - totalUsage);
  const percentLeft = totalCredits > 0 ? Math.round((remaining / totalCredits) * 100) : 0;

  const meters: Meter[] = [
    {
      id: "credits",
      label: "Credits",
      percentLeft,
      resetsAt: null,
      state: meterState(percentLeft),
    },
  ];

  const infoRows: InfoRowData[] = [
    { label: "Balance", value: `${formatUsd(remaining)} / ${formatUsd(totalCredits)}` },
    { label: "Spent", value: formatUsd(totalUsage), tooltip: "Total billed usage" },
  ];

  return {
    providerId: "openrouter",
    planLabel: null,
    accountLabel: null,
    meters,
    infoRows,
    fetchedAt: new Date().toISOString(),
  };
}
