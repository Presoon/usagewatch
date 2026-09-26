// Duration / relative-time formatting for meters, the stale badge, and the
// footer countdown. Pure functions (injectable `now`) so they're testable.

/** "Resets in" value: `Xd Yh` ≥24h, `Xh Ym` <24h, `Xm` <1h, `—` when unknown. */
export function formatResetIn(resetsAt: string | null, now = Date.now()): string {
  if (!resetsAt) return "—";
  const ms = new Date(resetsAt).getTime() - now;
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

/** Compact "time since" for the stale badge: `<1m`, `Xm`, `Xh Ym`, `Xd Yh`. */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "<1m";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "<1m";
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Footer countdown: `Xm Ys` when ≥60s, else `Ys`. Ticks every second. */
export function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}
