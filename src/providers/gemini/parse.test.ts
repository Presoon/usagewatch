import { describe, expect, it } from "vitest";
import { parseGeminiUsage } from "./parse";

const future = "2030-01-01T00:00:00Z";

describe("parseGeminiUsage", () => {
  it("groups model buckets by family and keeps the lowest remaining fraction", () => {
    const snapshot = parseGeminiUsage(
      {
        buckets: [
          { modelId: "gemini-2.5-pro", remainingFraction: 0.7, resetTime: future },
          { modelId: "gemini-3.1-pro-preview", remainingFraction: 0.42, resetTime: future },
          { modelId: "gemini-3-flash-preview", remainingFraction: 0.81, resetTime: future },
          { modelId: "gemini-3.1-flash-lite-preview", remainingFraction: 1, resetTime: future },
        ],
      },
      { currentTier: { id: "standard-tier" }, paidTier: { name: "Google AI Pro" } },
      { email: "person@example.com", hostedDomain: null },
    );

    expect(snapshot.planLabel).toBe("Google AI Pro");
    expect(snapshot.accountLabel).toBe("person@example.com");
    expect(snapshot.meters.map(({ id, percentLeft }) => ({ id, percentLeft }))).toEqual([
      { id: "pro", percentLeft: 42 },
      { id: "flash", percentLeft: 81 },
      { id: "lite", percentLeft: 100 },
    ]);
  });

  it("hides unusable free-tier Pro buckets and epoch resets", () => {
    const snapshot = parseGeminiUsage(
      {
        buckets: [
          { modelId: "gemini-2.5-pro", remainingFraction: 0, resetTime: "1970-01-01T00:00:00Z" },
          { modelId: "gemini-2.5-flash", remainingFraction: 0.2, resetTime: future },
          { modelId: "gemini-2.5-flash-lite", remainingFraction: 0.9, resetTime: future },
        ],
      },
      { currentTier: { id: "free-tier", name: "Gemini Code Assist for individuals" } },
      { email: "free@example.com", hostedDomain: null },
    );

    expect(snapshot.planLabel).toBe("Free");
    expect(snapshot.meters.map((meter) => meter.id)).toEqual(["flash", "lite"]);
  });

  it("labels standard hosted-domain accounts as Workspace", () => {
    const snapshot = parseGeminiUsage(
      { buckets: [{ modelId: "gemini-2.5-flash", remainingFraction: 0.5, resetTime: future }] },
      { currentTier: { id: "standard-tier" } },
      { email: "user@company.test", hostedDomain: "company.test" },
    );
    expect(snapshot.planLabel).toBe("Workspace");
  });
});
