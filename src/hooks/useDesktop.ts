import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { startController, refreshNow, updateAppConfig } from "../core/controller";
import { useRuntimeStore, type AppConfig } from "../core/store";
import { getCapabilities, type PlatformCapabilities } from "../platform/capabilities";
export type AppScreen = "usage" | "settings" | "about";

async function syncLaunchAtStartup(): Promise<void> {
  const enabled = await isAutostartEnabled();
  if (useRuntimeStore.getState().config.launchAtStartup !== enabled) {
    await updateAppConfig({ launchAtStartup: enabled });
  }
}

export function useDesktop(config: AppConfig, mock: boolean, setScreen: (screen: AppScreen) => void, onError: (message: string) => void) {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities>({ secureStorage: mock, edgeWidget: mock });
  useEffect(() => {
    if (mock) return;
    void (async () => {
      try {
        setCapabilities(await getCapabilities());
        await startController();
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : "Unable to start UsageWatch");
        return;
      }

      try {
        await syncLaunchAtStartup();
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : "Unable to read startup settings");
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = config.theme;
    if (!mock) void getCurrentWindow().setTheme(config.theme === "auto" ? null : config.theme).catch(() => undefined);
  }, [config.theme, mock]);

  // Mirror widget state to Rust so tray show / focus-hide behave correctly.
  useEffect(() => {
    if (mock) return;
    void invoke("set_widget_state", {
      enabled: config.widget.enabled,
      edge: config.widget.edge,
      posPercent: config.widget.posPercent,
      monitor: config.widget.monitor,
    }).catch(() => undefined);
  }, [config.widget.enabled, config.widget.edge, config.widget.posPercent, config.widget.monitor, mock]);

  useEffect(() => {
    if (mock) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("menu-action", ({ payload }) => {
      if (payload === "refresh") void refreshNow().catch(error => onError(String(error)));
      else if (payload === "settings") setScreen("settings");
      else if (payload === "about") setScreen("about");
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Widget rings open this popup (optionally jumping to settings).
  useEffect(() => {
    if (mock) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string | null>("show-main", ({ payload }) => {
      if (payload === "settings") setScreen("settings");
      void invoke("show_main").catch(error => onError(String(error)));
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return capabilities;
}
