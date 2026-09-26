import { describe, expect, it } from "vitest";
import { providers } from ".";
import { PROVIDERS } from "../core/types";

describe("provider registry", () => {
  it("registers exactly one implementation per PROVIDERS entry, in order", () => {
    expect(providers.map((p) => p.id)).toEqual(PROVIDERS.map((p) => p.id));
  });

  it("gives every provider a sane polling floor", () => {
    for (const p of providers) expect(p.minIntervalSec).toBeGreaterThanOrEqual(60);
  });
});
