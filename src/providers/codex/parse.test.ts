import { describe, expect, it } from "vitest";
import { parseCodexUsage } from "./parse";

describe("parseCodexUsage", () => {
  it("keeps usage when reset timestamps are invalid or outside the Date range", () => {
    for (const reset_at of ["", " ", "Infinity", "1e100", 1e100, NaN, Infinity, "invalid"]) {
      const snapshot = parseCodexUsage({ rate_limit: { primary_window: { used_percent: 25, reset_at } } },
        { planType: null, email: null });
      expect(snapshot.meters[0]).toMatchObject({ percentLeft: 75, resetsAt: null });
    }
    for (const reset_at of [2_000_000_000, "2000000000", 2_000_000_000_000, "2000000000000"]) {
      const snapshot = parseCodexUsage({ rate_limit: { primary_window: { used_percent: 25, reset_at } } },
        { planType: null, email: null });
      expect(snapshot.meters[0].resetsAt).toBe("2033-05-18T03:33:20.000Z");
    }
  });
  it("classifies five-hour and weekly windows by duration", () => {
    const snapshot = parseCodexUsage(
      {
        plan_type: "plus",
        rate_limit: {
          primary_window: {
            used_percent: 25.4,
            limit_window_seconds: 18_000,
            reset_at: 2_000_000_000,
          },
          secondary_window: {
            used_percent: 92.2,
            limit_window_seconds: 604_800,
            reset_at: 2_000_100_000,
          },
        },
      },
      { planType: null, email: "person@example.com" },
    );

    expect(snapshot.planLabel).toBe("Plus");
    expect(snapshot.accountLabel).toBe("person@example.com");
    expect(snapshot.meters.map(({ id, label, percentLeft, state }) => ({ id, label, percentLeft, state }))).toEqual([
      { id: "session", label: "Session", percentLeft: 75, state: "ok" },
      { id: "weekly", label: "Weekly", percentLeft: 8, state: "warn" },
    ]);
    expect(snapshot.meters[0].resetsAt).toBe("2033-05-18T03:33:20.000Z");
  });

  it("supports transformed camelCase data and reset credits", () => {
    const snapshot = parseCodexUsage(
      {
        rateLimits: {
          primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: "2030-01-01T00:00:00Z" },
        },
        rateLimitResetCredits: { availableCount: 3 },
      },
      { planType: "chatgpt_team", email: null },
    );

    expect(snapshot.planLabel).toBe("ChatGPT Team");
    expect(snapshot.meters[0]).toMatchObject({ id: "session", percentLeft: 0, state: "limit" });
    expect(snapshot.infoRows).toEqual([
      {
        label: "Resets",
        value: "3 available",
        tooltip: "Unused limit resets on this account; redemption eligibility can depend on current usage",
      },
    ]);
  });

  it("keeps the credit balance separate from owned resets and current redemption eligibility", () => {
    const account = { planType: null, email: null };
    const snapshot = parseCodexUsage({
      credits: { balance: "0" },
      rate_limit_reset_credits: { available_count: 2, applicable_available_count: 0 },
    }, account);
    expect(snapshot.infoRows.map(({ label, value }) => [label, value])).toEqual([["Credits", "0"], ["Resets", "2 available"]]);
    for (const balance of [null, "", "invalid", NaN, -1]) {
      expect(parseCodexUsage({ credits: { balance }, rate_limit_reset_credits: { available_count: -1 } }, account).infoRows).toEqual([]);
    }
    expect(parseCodexUsage({ credits: { unlimited: true } }, account).infoRows[0].value).toBe("Unlimited");
    expect(parseCodexUsage({ rate_limit_reset_credits: { applicable_available_count: 0 } }, account).infoRows).toEqual([]);
  });
});
