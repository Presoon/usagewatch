import { describe, expect, it } from "vitest";
import { footerStatus } from "./Footer";

describe("footerStatus", () => {
  it("shows Updating as soon as the countdown reaches zero", () => {
    expect(footerStatus(0, false)).toBe("Updating…");
  });

  it("keeps showing Updating for the entire request", () => {
    expect(footerStatus(null, true)).toBe("Updating…");
  });

  it("starts the next countdown only after updating finishes", () => {
    expect(footerStatus(300, false)).toBe("Next update in 5m 0s");
  });
});
