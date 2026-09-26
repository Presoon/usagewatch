import { useRef, useState } from "react";
import { providers } from "../providers";
import { PROVIDER_NAMES, type ProviderId } from "../core/types";
import type { AppConfig, ConfigUpdate } from "../core/config";
import type { TrackerId, TrackerView } from "../core/trackers";
import { ProviderLogo } from "../assets/logos";
import { Toggle } from "./SettingsControls";
import { t } from "../i18n";
import { Modal } from "./Modal";

interface Props {
  secureStorage: boolean;
  config: AppConfig;
  views: Record<TrackerId, TrackerView>;
  onConfigChange(patch: ConfigUpdate): Promise<void>;
  onSignIn(id: TrackerId): Promise<void>;
  onSignOut(id: TrackerId): Promise<void>;
  onAdd(providerId: ProviderId, name: string): Promise<void>;
  onRemove(id: TrackerId): Promise<void>;
}

export function TrackerSettings({ secureStorage, config, views, onConfigChange, onSignIn, onSignOut, onAdd, onRemove }: Props) {
  const [providerId, setProviderId] = useState<ProviderId>("claude");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<TrackerId | null>(null);
  const removeTarget = config.trackers.find(tracker => tracker.id === removing);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update tracker"); }
    finally { pending.current = false; setBusy(false); }
  };
  const move = (id: TrackerId, delta: number) => {
    return onConfigChange(current => {
      const trackers = [...current.trackers];
      const index = trackers.findIndex(tracker => tracker.id === id);
      if (index >= 0 && trackers[index + delta]) {
        [trackers[index], trackers[index + delta]] = [trackers[index + delta], trackers[index]];
      }
      return { trackers };
    });
  };
  const clearDraft = (id: TrackerId) => setDrafts(current => {
    const next = { ...current }; delete next[id]; return next;
  });
  return (
    <section className="settings-section">
      <h2 className="settings-section__title">{t.settings.trackers}</h2>
      {!secureStorage && <p className="settings-section__hint">{t.settings.storageUnsupported}</p>}
      {error && <div role="alert" className="popup__notice">{error}</div>}
      <div className="settings-panel settings-panel--providers">
        {config.trackers.map((tracker, index) => {
          const view = views[tracker.id];
          const status = view?.snapshot
            ? [view.snapshot.accountLabel, view.snapshot.planLabel].filter(Boolean).join(" · ")
            : view?.cardState === "loading" ? t.settings.updating : view?.errorMessage ?? t.settings.signedOut;
          return (
            <div className="tracker-setting" key={tracker.id}>
              <div className="provider-setting">
                <ProviderLogo id={tracker.providerId} size={18} />
                <div className="provider-setting__identity">
                  <input className="tracker-name" aria-label={`${t.settings.trackerName}: ${tracker.name}`}
                    value={drafts[tracker.id] ?? tracker.name} maxLength={80} disabled={busy}
                    onChange={event => setDrafts(current => ({ ...current, [tracker.id]: event.target.value }))}
                    onKeyDown={event => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") { event.preventDefault(); clearDraft(tracker.id); }
                    }}
                    onBlur={event => {
                      const value = event.currentTarget.value.trim();
                      if (!value || value === tracker.name) { clearDraft(tracker.id); return; }
                      void perform(async () => {
                        try { await onConfigChange(current => ({
                          trackers: current.trackers.map(item => item.id === tracker.id ? { ...item, name: value } : item),
                        })); } finally { clearDraft(tracker.id); }
                      });
                    }} />
                  <span className="provider-setting__status" title={status}>{tracker.enabled ? status : "Disabled"}</span>
                </div>
                <div className="provider-setting__order">
                  <button type="button" className="icon-btn" aria-label={t.settings.moveUp(tracker.name)}
                    disabled={busy || index === 0} onClick={() => void perform(async () => { await move(tracker.id, -1); })}>↑</button>
                  <button type="button" className="icon-btn" aria-label={t.settings.moveDown(tracker.name)}
                    disabled={busy || index === config.trackers.length - 1}
                    onClick={() => void perform(async () => { await move(tracker.id, 1); })}>↓</button>
                </div>
                <Toggle checked={tracker.enabled} label={tracker.name} disabled={busy}
                  onChange={enabled => void perform(() => onConfigChange(current => ({
                    trackers: current.trackers.map(item => item.id === tracker.id ? { ...item, enabled } : item),
                  })))} />
              </div>
              <div className="tracker-actions">
                <button type="button" className="btn btn--compact" disabled={busy || !tracker.enabled || !secureStorage}
                  onClick={() => void perform(() => onSignIn(tracker.id))}>{t.card.signIn}</button>
                <button type="button" className="btn btn--compact" disabled={busy || view?.cardState === "signin-required"}
                  onClick={() => void perform(() => onSignOut(tracker.id))}>{t.settings.signOut}</button>
                <button type="button" className="btn btn--compact" disabled={busy}
                  aria-label={t.settings.removeTracker(tracker.name)}
                  onClick={() => { setError(null); setRemoving(tracker.id); }}>{t.settings.remove}</button>
              </div>
            </div>
          );
        })}
        <form className="tracker-add" onSubmit={event => {
          event.preventDefault();
          void perform(async () => {
            await onAdd(providerId, name.trim() || PROVIDER_NAMES[providerId]);
            setName("");
          });
        }}>
          <select className="select" aria-label={t.settings.providerType} value={providerId}
            disabled={busy}
            onChange={event => setProviderId(event.currentTarget.value as ProviderId)}>
            {providers.map(provider => <option key={provider.id} value={provider.id}>{PROVIDER_NAMES[provider.id]}</option>)}
          </select>
          <input className="tracker-name" aria-label={t.settings.trackerName} placeholder={t.settings.trackerName}
            disabled={busy}
            value={name} maxLength={80} onChange={event => setName(event.currentTarget.value)} />
          <button className="btn btn--compact" type="submit" disabled={busy}>{t.settings.addTracker}</button>
        </form>
      </div>
      {removeTarget && <Modal titleId="remove-tracker-title" busy={busy} onCancel={() => setRemoving(null)}>
        <div className="signin-dialog">
          <h2 id="remove-tracker-title" className="signin-dialog__title">Remove {removeTarget.name}?</h2>
          <p className="signin-dialog__copy">This removes the tracker and its saved sign-in from this device. Your provider account is not deleted. You can disable the tracker instead to keep its sign-in.</p>
          {error && <p className="signin-dialog__error" role="alert">{error}</p>}
          <div className="signin-dialog__actions">
            <button className="btn" autoFocus disabled={busy} onClick={() => setRemoving(null)}>Cancel</button>
            <button className="btn btn--danger" disabled={busy} onClick={() => void perform(async () => {
              await onRemove(removeTarget.id); setRemoving(null);
            })}>{busy ? "Removing…" : "Remove tracker"}</button>
          </div>
        </div>
      </Modal>}
    </section>
  );
}
