import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import usageWatchLogo from "./assets/usageWatch.png";
import { CloseIcon, RefreshIcon, SettingsIcon } from "./assets/icons";
import { appLogDir, join } from "@tauri-apps/api/path";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { selectTrackerViews, type TrackerId, type TrackerView } from "./core/trackers";
import { useSignIn } from "./hooks/useSignIn";
import {
  refreshDue,
  refreshNow,
  signOutTracker,
  addTracker,
  removeTracker,
  updateAppConfig,
} from "./core/controller";
import { usePopupSize } from "./hooks/usePopupSize";
import { useDesktop, type AppScreen } from "./hooks/useDesktop";
import { useRuntimeStore } from "./core/store";
import type { ConfigUpdate } from "./core/config";
import { TrackerCard } from "./components/TrackerCard";
import { Footer } from "./components/Footer";
import { SettingsView } from "./components/SettingsView";
import { AboutView } from "./components/AboutView";
import { mockViews } from "./fixtures";

const MOCK = import.meta.env.VITE_MOCK === "1";
const MOCK_REFRESH_SECONDS = 300;
const REPOSITORY_URL = "https://github.com/Presoon/usagewatch";
const RESEARCH_URL = `${REPOSITORY_URL}/blob/main/docs/PROVIDERS.md`;
function App() {
  const config = useRuntimeStore((state) => state.config);
  const runtimeViews = useRuntimeStore((state) => state.views);
  const nextUpdateAt = useRuntimeStore((state) => state.nextUpdateAt);
  const isUpdating = useRuntimeStore((state) => state.isUpdating);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mockSecondsLeft, setMockSecondsLeft] = useState(MOCK_REFRESH_SECONDS);
  const [signInError, setSignInError] = useState<string | null>(null);
  const { signIn, dialogs } = useSignIn(config.trackers, setSignInError, MOCK);
  const [screen, setScreen] = useState<AppScreen>("usage");

  const capabilities = useDesktop(config, MOCK, setScreen, setSignInError);

  usePopupSize(MOCK);

  // A single visible-only tick drives reset labels and the footer countdown.
  useEffect(() => {
    let id: number | undefined;
    const tick = () => {
      setNowMs(Date.now());
      if (MOCK) setMockSecondsLeft((seconds) => (seconds <= 1 ? MOCK_REFRESH_SECONDS : seconds - 1));
    };
    const start = () => {
      if (id === undefined) id = window.setInterval(tick, 1000);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const sync = () => (document.visibilityState === "visible" ? start() : stop());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const views = useMemo<TrackerView[]>(() => {
    if (MOCK) return selectTrackerViews(config.trackers, Object.fromEntries(config.trackers.map(tracker => [tracker.id,
      { ...(mockViews.find(view => view.trackerId === tracker.id) ?? { snapshot: null, cardState: "signin-required" as const }),
        trackerId: tracker.id, providerId: tracker.providerId, displayName: tracker.name }] )));
    return selectTrackerViews(config.trackers, runtimeViews);
  }, [config.trackers, runtimeViews]);

  const secondsLeft = views.length === 0 ? null : MOCK
    ? mockSecondsLeft
    : nextUpdateAt === null
      ? null
      : Math.max(0, Math.ceil((nextUpdateAt - nowMs) / 1000));

  useEffect(() => {
    if (MOCK || isUpdating || nextUpdateAt === null || nextUpdateAt > nowMs) return;
    void refreshDue().catch((cause) => {
      setSignInError(cause instanceof Error ? cause.message : "Refresh failed");
    });
  }, [isUpdating, nextUpdateAt, nowMs]);

  const refresh = async (id?: TrackerId) => {
    if (MOCK) {
      setMockSecondsLeft(MOCK_REFRESH_SECONDS);
      return;
    }
    setSignInError(null);
    try {
      await refreshNow(id);
    } catch (cause) {
      setSignInError(cause instanceof Error ? cause.message : "Refresh failed");
    }
  };

  const changeConfig = async (patch: ConfigUpdate) => {
    setSignInError(null);
    if (MOCK) {
      const state = useRuntimeStore.getState();
      state.patchConfig(typeof patch === "function" ? patch(state.config) : patch);
      return;
    }
    await updateAppConfig(patch);
  };

  const signOut = async (id: TrackerId) => {
    setSignInError(null);
    if (!MOCK) await signOutTracker(id);
  };

  const changeLaunchAtStartup = async (enabled: boolean) => {
    setSignInError(null);
    try {
      if (!MOCK) {
        await (enabled ? enableAutostart() : disableAutostart());
        const actualEnabled = await isAutostartEnabled();
        if (actualEnabled !== enabled) {
          throw new Error(`The system did not ${enabled ? "enable" : "disable"} launch at startup`);
        }
      }
      await changeConfig({ launchAtStartup: enabled });
    } catch (cause) {
      setSignInError(cause instanceof Error ? cause.message : "Unable to update startup settings");
    }
  };

  const openLogs = async () => {
    setSignInError(null);
    try {
      if (!MOCK) await revealItemInDir(await join(await appLogDir(), "UsageWatch.log"));
    } catch (cause) {
      setSignInError(cause instanceof Error ? cause.message : "Unable to open logs folder");
    }
  };

  const openExternal = (url: string) => {
    void openUrl(url).catch((cause) => {
      setSignInError(cause instanceof Error ? cause.message : "Unable to open link");
    });
  };

  return (
    <div className="popup">
      <div className="popup__inner">
        <header className="app-header" data-tauri-drag-region>
          <div className="app-header__brand">
            <img className="app-header__logo" src={usageWatchLogo} alt="" width={28} height={28} draggable={false} />
            <div><h1>UsageWatch</h1><span>{views.length} {views.length === 1 ? "account" : "accounts"} · Usage %</span></div>
          </div>
          <div className="app-header__actions">
            <button className="icon-btn" title="Refresh now" disabled={!MOCK && isUpdating} onClick={() => void refresh()} aria-label="Refresh now"><RefreshIcon size={16} /></button>
            <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => setScreen("settings")}><SettingsIcon size={16} /></button>
            <button className="icon-btn app-header__close" title="Hide to tray" aria-label="Hide to tray" onClick={() => {
              if (!MOCK) void getCurrentWindow().hide().catch(cause => setSignInError(String(cause)));
            }}><CloseIcon size={17} /></button>
          </div>
        </header>
        {screen === "usage" ? (
          <>
            <div className="popup__content cards">
              {signInError && <div className="popup__notice" role="alert">{signInError}</div>}
              {views.length === 0 ? (
                <div className="popup__placeholder">No active trackers.
                  <p>Add an account or enable an existing tracker to see its usage.</p>
                  <button className="btn btn--primary" onClick={() => setScreen("settings")}>Manage trackers</button>
                </div>
              ) : (
                views.map((view) => (
                  <TrackerCard
                    key={view.trackerId}
                    view={view}
                    now={nowMs}
                    handlers={{
                      onSignIn: (id) => void signIn(id),
                      onRetry: (id) => void refresh(id),
                      onMeterVisibility: (id, meterId, visible) => changeConfig(current => ({
                        trackers: current.trackers.map(tracker => tracker.id !== id ? tracker : {
                          ...tracker, hiddenMeterIds: visible
                            ? (tracker.hiddenMeterIds ?? []).filter(key => key !== meterId)
                            : [...new Set([...(tracker.hiddenMeterIds ?? []), meterId])],
                        }),
                      })),
                    }}
                  />
                ))
              )}
            </div>
            <Footer
              secondsLeft={secondsLeft}
              isUpdating={!MOCK && isUpdating}
              onAbout={() => setScreen("about")}
              onQuit={() => void invoke("quit_app")}
            />
          </>
        ) : (
          <div className="popup__content">
            {screen === "settings" ? (
              <SettingsView
                capabilities={capabilities}
                config={config}
                views={MOCK ? Object.fromEntries(views.map(view => [view.trackerId, view])) : runtimeViews}
                error={signInError}
                onBack={() => setScreen("usage")}
                onConfigChange={changeConfig}
                onSignIn={signIn}
                onSignOut={signOut}
                onAddTracker={async (providerId, name) => {
                  if (MOCK) {
                    const state = useRuntimeStore.getState();
                    state.patchConfig({ trackers: [...state.config.trackers, { id: crypto.randomUUID(), providerId, name, enabled: true }] });
                  } else await addTracker(providerId, name);
                }}
                onRemoveTracker={async id => {
                  if (MOCK) { const state = useRuntimeStore.getState(); state.patchConfig({ trackers: state.config.trackers.filter(t => t.id !== id) }); }
                  else await removeTracker(id);
                }}
                onLaunchAtStartup={changeLaunchAtStartup}
                onOpenLogs={openLogs}
              />
            ) : (
              <AboutView
                onBack={() => setScreen("usage")}
                onOpenRepository={() => openExternal(REPOSITORY_URL)}
                onOpenResearch={() => openExternal(RESEARCH_URL)}
              />
            )}
          </div>
        )}
      </div>

      {dialogs}
    </div>
  );
}

export default App;
