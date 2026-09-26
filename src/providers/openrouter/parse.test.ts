import { describe, expect, it } from "vitest";
import { parseOpenRouterCredits } from "./parse";

describe("parseOpenRouterCredits", () => {
  it("derives remaining balance and meter state", () => {
    const snapshot = parseOpenRouterCredits({ data: { total_credits: 100, total_usage: 25 } });

    expect(snapshot.providerId).toBe("openrouter");
    expect(snapshot.meters).toEqual([
      { id: "credits", label: "Credits", percentLeft: 75, resetsAt: null, state: "ok" },
    ]);
    expect(snapshot.infoRows[0]).toEqual({ label: "Balance", value: "$75.00 / $100.00" });
  });

  it("treats exhausted credits as limit and empty data as zero", () => {
    expect(parseOpenRouterCredits({ data: { total_credits: 10, total_usage: 10 } }).meters[0]).toMatchObject({
      state: "limit",
      percentLeft: 0,
    });
    expect(parseOpenRouterCredits({}).meters[0]).toMatchObject({ state: "limit", percentLeft: 0 });
  });
});
