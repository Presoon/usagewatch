import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { percentUsed, usageColor } from "../core/usage";
import type { Meter } from "../core/types";
import { MeterBlock } from "./MeterBlock";
import { TrackerCard } from "./TrackerCard";

const meter = (percentLeft: number | null): Meter => ({ id: "session", label: "Session", percentLeft, state: "ok", resetsAt: null });

describe("consistent consumption display", () => {
  it("shows a rate-limit notice and automatic retry countdown, keeping cached meters", () => {
    for (const cached of [false, true]) {
      const view = { trackerId: "test", providerId: "claude" as const, displayName: "Claude Pro",
        cardState: cached ? "stale" as const : "error" as const, rateLimitedUntil: 300_000,
        errorMessage: "Too many usage checks. Updates will resume automatically.", staleSince: new Date(0).toISOString(),
        snapshot: cached ? { providerId: "claude" as const, planLabel: null, accountLabel: null, fetchedAt: new Date(0).toISOString(), meters: [meter(75)], infoRows: [] } : null };
      const html = renderToStaticMarkup(<TrackerCard view={view} now={60_000} handlers={{ onRetry() {} }} />);
      expect(html).toContain("Rate limited");
      expect(html).toContain("Automatic retry in 4m 0s");
      expect(html).not.toContain("HTTP 429");
      expect(html).not.toContain(">Retry</button>");
      if (cached) expect(html).toContain("25% used");
      expect(renderToStaticMarkup(<TrackerCard view={view} now={300_000} />)).toContain("Retrying automatically");
    }
  });
  it("renders 0–100% consumption, including limit and unknown values", () => {
    for (const left of [100, 75, 50, 30, 19, 7, 0]) {
      const html = renderToStaticMarkup(<MeterBlock meter={meter(left)} now={0} />);
      expect(html).toContain(`${100 - left}% used`);
      expect(html).toContain(`width:${100 - left}%`);
      expect(html).toContain(`aria-valuenow="${100 - left}"`);
    }
    expect(percentUsed(meter(-10))).toBe(100);
    expect(percentUsed(meter(120))).toBe(0);
    expect(percentUsed(meter(NaN))).toBeNull();
    expect(percentUsed(meter(null))).toBeNull();
    expect(percentUsed({ ...meter(null), state: "limit" })).toBe(100);
    expect(usageColor(49)).toBe("var(--good, #22c55e)");
    expect(usageColor(50)).toBe("var(--warn)");
    expect(usageColor(70)).toBe("var(--danger)");
  });
  it("shows stale data with a visible error and retry, without a fake import action", () => {
    const view = { trackerId: "test", providerId: "claude" as const, displayName: "Work", cardState: "stale" as const,
      errorMessage: "Network unavailable", staleSince: new Date(0).toISOString(),
      snapshot: { providerId: "claude" as const, planLabel: null, accountLabel: null, fetchedAt: new Date(0).toISOString(), meters: [meter(75)], infoRows: [] } };
    const html = renderToStaticMarkup(<TrackerCard view={view} now={720000} handlers={{ onRetry() {} }} />);
    expect(html).toContain("Network unavailable");
    expect(html).toContain("Retry");
    expect(html).toContain("25% used");
    expect(renderToStaticMarkup(<TrackerCard view={{ ...view, cardState: "signin-required", hasCliCredentials: true }} now={0} />)).not.toContain("Import from CLI");
  });
});
