import { describe, expect, it } from "vitest";
import { parseClaudeUsage } from "./parse";

describe("parseClaudeUsage", () => {
  it("maps known windows in display order and ignores unknown fields", () => {
    const snapshot = parseClaudeUsage(
      {
        five_hour: { utilization: 33, resets_at: "2026-04-11T07:00:00.528743+00:00" },
        seven_day: { utilization: 13, resets_at: "2026-04-17T00:59:59.951713+00:00" },
        seven_day_opus: null,
        seven_day_sonnet: { utilization: 1, resets_at: "2026-04-16T03:00:00.951719+00:00" },
        future_window: { utilization: 99, resets_at: "2026-04-20T00:00:00Z" },
        extra_usage: { is_enabled: false },
      },
      "max",
    );

    expect(snapshot.planLabel).toBe("Max");
    expect(snapshot.meters.map(({ id, percentLeft }) => [id, percentLeft])).toEqual([
      ["session", 67],
      ["weekly", 87],
      ["weekly_sonnet", 99],
    ]);
    expect(snapshot.infoRows).toEqual([{ label: "Credits", value: "Unavailable", tooltip: "Unable to fetch credit balance" }]);
  });

  it("clamps utilization and renders enabled extra usage", () => {
    const snapshot = parseClaudeUsage(
      {
        five_hour: { utilization: 150, resets_at: "2026-04-11T07:00:00Z" },
        seven_day: { utilization: -5, resets_at: "2026-04-17T00:00:00Z" },
        extra_usage: { is_enabled: true, used_credits: 1240, monthly_limit: 5000 },
      },
      null,
    );

    expect(snapshot.meters[0]).toMatchObject({ percentLeft: 0, state: "limit" });
    expect(snapshot.meters[1]).toMatchObject({ percentLeft: 100, state: "ok" });
    expect(snapshot.infoRows[1]).toMatchObject({ label: "Extra usage", value: "$12.40 of $50.00" });
  });

  it("shows prepaid money even with extra usage disabled, with correct currency units and unknown balances", () => {
    for (const [credits, value] of [
      [{ amount: 6769, currency: "EUR" }, "€67.69"],
      [{ amount: 0, currency: "USD" }, "$0.00"],
      [{ amount: 1200, currency: "JPY" }, "¥1,200"],
      [{ balance: { money: { amount_minor: 1234, currency: "EUR", exponent: 3 } } }, "€1.23"],
      [null, "Unavailable"],
      [{ amount: NaN, currency: "EUR" }, "Unavailable"],
      [{ amount: -1, currency: "EUR" }, "Unavailable"],
      [{ amount: 100, currency: "invalid" }, "Unavailable"],
    ] as const) {
      expect(parseClaudeUsage({ extra_usage: { is_enabled: false } }, null, credits).infoRows).toMatchObject([{ label: "Credits", value }]);
    }
    expect(parseClaudeUsage({ extra_usage: { is_enabled: true, used_credits: null } }, null).infoRows).toHaveLength(1);
  });
});
