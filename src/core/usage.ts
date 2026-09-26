import type { Meter } from "./types";

export function meterState(percentLeft: number): Meter["state"] {
  if (percentLeft <= 0) return "limit";
  if (percentLeft < 8) return "danger";
  if (percentLeft < 20) return "warn";
  return "ok";
}

/** Keep the provider contract (% left); all displays show consumption. */
export function percentUsed(meter?: Meter): number | null {
  if (!meter) return null;
  if (meter.state === "limit") return 100;
  if (meter.percentLeft == null || !Number.isFinite(meter.percentLeft)) return null;
  return Math.round(Math.max(0, Math.min(100, 100 - meter.percentLeft)));
}

export function usageColor(used: number | null): string {
  if (used === null) return "var(--text-3)";
  if (used >= 70) return "var(--danger)";
  if (used >= 50) return "var(--warn)";
  return "var(--good, #22c55e)";
}
