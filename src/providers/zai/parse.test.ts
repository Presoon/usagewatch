import { describe, expect, it } from "vitest";
import { parseZaiQuotaLimit } from "./parse";

describe("parseZaiQuotaLimit", () => {
  it("splits credit windows into session/weekly and keeps TIME_LIMIT monthly", () => {
    const snapshot = parseZaiQuotaLimit({
      code: 200,
      success: true,
      data: {
        plan: "Pro",
        limits: [
          { type: "CREDIT_LIMIT", unit: 3, percentage: 15, currentValue: 150000, usage: 1000000, nextResetTime: 1740000000000 },
          { type: "CREDIT_LIMIT", unit: 6, percentage: 40, currentValue: 4000000, usage: 10000000, nextResetTime: 1741000000000 },
          { type: "TIME_LIMIT", percentage: 5, currentValue: 5, usage: 100, nextResetTime: 1742000000000 },
        ],
      },
    });

    expect(snapshot.planLabel).toBe("Pro");
    expect(snapshot.meters.map((m) => [m.id, m.percentLeft])).toEqual([
      ["session", 85],
      ["weekly", 60],
      ["monthly", 95],
    ]);
    expect(snapshot.meters[0].resetsAt).toBe(new Date(1740000000000).toISOString());
    expect(snapshot.infoRows).toEqual([
      { label: "Tokens (5h)", value: "150,000 / 1,000,000" },
      { label: "Tokens (weekly)", value: "4,000,000 / 10,000,000" },
      { label: "Web searches (monthly)", value: "5 / 100" },
    ]);
  });

  it("accepts the legacy TOKENS_LIMIT type and falls back to order without unit", () => {
    const snapshot = parseZaiQuotaLimit({
      data: {
        limits: [
          { type: "TOKENS_LIMIT", percentage: 0.5 },
          { type: "TOKENS_LIMIT", percentage: 100 },
        ],
      },
    });

    // 0.5 means half a percent used, not 50%.
    expect(snapshot.meters[0]).toMatchObject({ id: "session", percentLeft: 100, state: "ok" });
    expect(snapshot.meters[1]).toMatchObject({ id: "weekly", percentLeft: 0, state: "limit" });
  });
});
