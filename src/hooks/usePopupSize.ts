import { useLayoutEffect } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { fitPopupHeight, POPUP_HEIGHT, POPUP_WIDTH } from "../core/popupWindow";

// Fit once at startup; content changes must not undo the user's window size.
export function usePopupSize(mock: boolean) {
  useLayoutEffect(() => {
    if (mock) return;
    let disposed = false;
    void currentMonitor().then(async monitor => {
      if (disposed) return;
      const width = monitor ? Math.min(POPUP_WIDTH, monitor.workArea.size.width / monitor.scaleFactor) : POPUP_WIDTH;
      const height = fitPopupHeight(POPUP_HEIGHT, monitor ? monitor.workArea.size.height / monitor.scaleFactor : undefined);
      await getCurrentWindow().setSize(new LogicalSize(width, height));
      if (!disposed) await invoke("position_popup");
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [mock]);
}
