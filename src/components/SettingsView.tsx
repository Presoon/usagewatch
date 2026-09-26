import { SettingRow, Toggle } from "./SettingsControls";
import { useState } from "react";
import type { ConfigUpdate, WidgetTheme } from "../core/config";
import { TrackerSettings } from "./TrackerSettings";
import type { ProviderId } from "../core/types";
import type { TrackerId, TrackerView } from "../core/trackers";
import type {
  AppConfig,
  IntervalMinutes,
  ThemeMode,
} from "../core/store";
import { t } from "../i18n";
import { ArrowLeftIcon } from "../assets/icons";

import type { PlatformCapabilities } from "../platform/capabilities";

type SettingsViewProps = {
  capabilities: PlatformCapabilities;
  config: AppConfig;
  views: Record<TrackerId, TrackerView>;
  error: string | null;
  onBack: () => void;
  onConfigChange: (patch: ConfigUpdate) => Promise<void>;
  onSignIn: (id: TrackerId) => Promise<void>;
  onSignOut: (id: TrackerId) => Promise<void>;
  onAddTracker: (providerId: ProviderId, name: string) => Promise<void>;
  onRemoveTracker: (id: TrackerId) => Promise<void>;
  onLaunchAtStartup: (enabled: boolean) => Promise<void>;
  onOpenLogs: () => Promise<void>;
};

const INTERVALS: IntervalMinutes[] = [3, 5, 10, 15, 30, 60];

export function SettingsView({
  capabilities,
  config,
  views,
  error,
  onBack,
  onConfigChange,
  onSignIn,
  onSignOut,
  onAddTracker,
  onRemoveTracker,
  onLaunchAtStartup,
  onOpenLogs,
}: SettingsViewProps) {
  const widgetEnabled = config.widget.enabled;
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = async (patch: ConfigUpdate) => {
    setSaveError(null);
    try { await onConfigChange(patch); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Unable to save settings"); }
  };

  return (
    <div className="view settings-view">
      <header className="view__header">
        <button className="view__back" type="button" onClick={onBack} aria-label={t.settings.back}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className="view__title">{t.settings.title}</h1>
      </header>

      {(error || saveError) && <div className="popup__notice" role="alert">{error || saveError}</div>}

      <section className="settings-section">
        <h2 className="settings-section__title">{t.settings.widget}</h2>
        <div className="settings-panel">
          <SettingRow label={t.settings.widgetEnabled}>
            <Toggle
              disabled={!capabilities.edgeWidget}
              checked={widgetEnabled && capabilities.edgeWidget}
              onChange={(checked) =>
                void save(current => ({ widget: { ...current.widget, enabled: checked } }))
              }
              label={t.settings.widgetEnabled}
            />
          </SettingRow>
          <SettingRow label={t.settings.widgetTheme}>
            <select className="select" aria-label={t.settings.widgetTheme}
              disabled={!capabilities.edgeWidget} value={config.widget.theme}
              onChange={event => {
                const theme = event.currentTarget.value as WidgetTheme;
                void save(current => ({ widget: { ...current.widget, theme } }));
              }}>
              <option value="light">{t.settings.widgetThemes.light}</option>
              <option value="gray">{t.settings.widgetThemes.gray}</option>
              <option value="dark">{t.settings.widgetThemes.dark}</option>
            </select>
          </SettingRow>
        </div>
      </section>

      {!capabilities.edgeWidget && <p className="settings-section__hint">{t.settings.widgetUnsupported}</p>}
      <TrackerSettings secureStorage={capabilities.secureStorage} config={config} views={views} onConfigChange={onConfigChange}
        onSignIn={onSignIn} onSignOut={onSignOut} onAdd={onAddTracker} onRemove={onRemoveTracker} />

      <section className="settings-section">
        <h2 className="settings-section__title">{t.settings.refresh}</h2>
        <div className="settings-panel">
          <SettingRow label={t.settings.refreshEvery}>
            <select
              className="select"
              aria-label={t.settings.refreshEvery}
              value={config.intervalMinutes}
              onChange={(event) =>
                void save({ intervalMinutes: Number(event.currentTarget.value) as IntervalMinutes })
              }
            >
              {INTERVALS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t.settings.interval(minutes)}
                </option>
              ))}
            </select>
          </SettingRow>
        </div>
        <p className="settings-section__hint">{t.settings.claudeMinimum}</p>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">{t.settings.general}</h2>
        <div className="settings-panel">
          <SettingRow label={t.settings.launchAtStartup}>
            <Toggle
              checked={config.launchAtStartup}
              label={t.settings.launchAtStartup}
              onChange={(enabled) => void onLaunchAtStartup(enabled)}
            />
          </SettingRow>
          <SettingRow label={t.settings.theme}>
            <select
              className="select"
              aria-label={t.settings.theme}
              value={config.theme}
              onChange={(event) => void save({ theme: event.currentTarget.value as ThemeMode })}
            >
              <option value="auto">{t.settings.themes.auto}</option>
              <option value="light">{t.settings.themes.light}</option>
              <option value="dark">{t.settings.themes.dark}</option>
            </select>
          </SettingRow>
          <button type="button" className="settings-action" onClick={() => void onOpenLogs()}>
            {t.settings.openLogs}
          </button>
        </div>
      </section>
    </div>
  );
}
