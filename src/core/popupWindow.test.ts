import { describe, expect, it } from "vitest";
import {
  fitPopupHeight,
  POPUP_MAX_WORK_AREA_RATIO,
  POPUP_MIN_HEIGHT,
} from "./popupWindow";

describe("fitPopupHeight", () => {
  it("uses the full content height when it fits in the work area", () => {
    expect(fitPopupHeight(734.2, 1080)).toBe(735);
  });

  it("caps tall content to the configured share of the work area", () => {
    expect(fitPopupHeight(1200, 1080)).toBe(Math.floor(1080 * POPUP_MAX_WORK_AREA_RATIO));
  });

  it("keeps short popup states usable", () => {
    expect(fitPopupHeight(80, 1080)).toBe(POPUP_MIN_HEIGHT);
  });
});
