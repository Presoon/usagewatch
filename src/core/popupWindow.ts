export const POPUP_WIDTH = 760;
export const POPUP_HEIGHT = 560;
export const POPUP_MIN_HEIGHT = 160;
export const POPUP_MAX_WORK_AREA_RATIO = 0.85;

export function fitPopupHeight(desiredHeight: number, workAreaHeight?: number): number {
  const desired = Math.max(POPUP_MIN_HEIGHT, Math.ceil(desiredHeight));
  if (workAreaHeight === undefined) return desired;

  const maximum = Math.max(1, Math.floor(workAreaHeight * POPUP_MAX_WORK_AREA_RATIO));
  return Math.min(desired, maximum);
}
