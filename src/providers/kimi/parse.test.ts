import { describe, expect, it } from "vitest";
import { parseKimiUsage } from "./parse";

describe("parseKimiUsage", () => {
  it("parses the current string-valued weekly and five-hour schema", () => {
    const snapshot = parseKimiUsage({
      usage: {
        limit: "2048",
        used: "214",
        remaining: "1834",
        resetTime: "2030-01-09T15:23:13.716839300Z",
      },
      limits: [
        {
          window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
          detail: {
            limit: "200",
            used: "139",
            remaining: "61",
            resetTime: "2030-01-06T13:33:02.717479433Z",
          },
        },
      ],
    });

    expect(snapshot.planLabel).toBe("Kimi Code");
    expect(snapshot.meters.map(({ id, percentLeft }) => ({ id, percentLeft }))).toEqual([
      { id: "session", percentLeft: 31 },
      { id: "weekly", percentLeft: 90 },
    ]);
    expect(snapshot.meters[0]?.resetsAt).toBe("2030-01-06T13:33:02.717Z");
    expect(snapshot.infoRows).toEqual([{ label: "Requests", value: "214 / 2048" }]);
  });

  it("accepts numeric fields, derives missing values, and finds the five-hour window", () => {
    const snapshot = parseKimiUsage({
      usage: { limit: 1000, remaining: 600, reset_at: "2030-02-01T00:00:00Z" },
      limits: [
        { window: { duration: 60, timeUnit: "TIME_UNIT_MINUTE" }, detail: { limit: 10, used: 9 } },
        { window: { duration: 5, timeUnit: "TIME_UNIT_HOUR" }, detail: { limit: 200, used: 50 } },
      ],
      planName: "Explorer",
    });

    expect(snapshot.planLabel).toBe("Explorer");
    expect(snapshot.meters.map(({ id, percentLeft }) => ({ id, percentLeft }))).toEqual([
      { id: "session", percentLeft: 75 },
      { id: "weekly", percentLeft: 60 },
    ]);
    expect(snapshot.infoRows).toEqual([{ label: "Requests", value: "400 / 1000" }]);
  });

  it("drops invalid quota details and clamps exhausted usage", () => {
    const snapshot = parseKimiUsage({
      usage: { limit: "100", used: "120", remaining: "-20" },
      limits: [{ window: { duration: 300 }, detail: { limit: "0", used: "0" } }],
    });

    expect(snapshot.meters).toHaveLength(1);
    expect(snapshot.meters[0]).toMatchObject({ id: "weekly", percentLeft: 0, state: "limit" });
  });
});
