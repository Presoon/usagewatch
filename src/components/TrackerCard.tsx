import { useId, useRef, useState } from "react";
import { visibleMeters, type TrackerView } from "../core/trackers";
import { t } from "../i18n";
import { formatAgo, formatCountdown } from "../core/format";
import { ProviderLogo } from "../assets/logos";
import { MeterBlock } from "./MeterBlock";
import { InfoRow } from "./InfoRow";
import { Modal } from "./Modal";
import { ChevronRightIcon } from "../assets/icons";

type Handlers = {
  onSignIn?: (id: string) => void;
  onImport?: (id: string) => void;
  onRetry?: (id: string) => void;
  onMeterVisibility?: (id: string, meterId: string, visible: boolean) => Promise<void>;
};

export function TrackerCard({ view, now, handlers = {} }: { view: TrackerView; now: number; handlers?: Handlers }) {
  const { trackerId, providerId, displayName, cardState, snapshot } = view;
  const [details, setDetails] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const id = useId();
  const meters = visibleMeters(view);
  const balanceRows = snapshot?.infoRows.filter(row => /credit|balance|^resets$/i.test(row.label)) ?? [];
  const detailRows = snapshot?.infoRows.filter(row => !balanceRows.includes(row)) ?? [];
  const hasDetails = !!snapshot?.accountLabel || detailRows.length > 0;
  const hasData = snapshot && ["ok", "limit", "stale"].includes(cardState);
  const rateLimited = view.rateLimitedUntil !== undefined;
  const retrySeconds = Math.max(0, Math.ceil(((view.rateLimitedUntil ?? now) - now) / 1000));

  async function setVisible(meterId: string, visible: boolean) {
    if (pending.current || !handlers.onMeterVisibility) return;
    pending.current = true; setSaving(true); setError(null);
    try { await handlers.onMeterVisibility(trackerId, meterId, visible); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save visible limits"); }
    finally { pending.current = false; setSaving(false); }
  }

  return (
    <article className={`card card--${cardState}`} aria-label={displayName}>
      <div className="card__header">
        <span className="card__logo"><ProviderLogo id={providerId} size={28} /></span>
        <div className="card__identity">
          <div className="card__name" title={displayName}>{displayName}</div>
          {snapshot?.planLabel && <div className="card__chip">{snapshot.planLabel}</div>}
          {balanceRows.map(row => <div className="card__balance" key={row.label} title={row.tooltip}>
            <span>{row.label}:</span> <strong>{row.value}</strong>
          </div>)}
        </div>
      </div>
      <div className="card__body">
        {rateLimited && <div className="card__rate-limit" role="status">
          <strong>{t.card.rateLimited}</strong>
          <span>{view.errorMessage}</span>
          <span className="card__rate-limit-time">{retrySeconds > 0
            ? t.card.autoRetryIn(formatCountdown(retrySeconds)) : t.card.retrying}</span>
          {snapshot && <small>{t.card.lastUpdated(formatAgo(view.staleSince, now))}</small>}
        </div>}
        {hasData && <>
          {cardState === "stale" && !rateLimited && <div className="card__outdated" role="status">
            <span>{t.card.lastUpdated(formatAgo(view.staleSince, now))}. {view.errorMessage ?? "Unable to refresh usage."}</span>
            <button className="btn btn--compact" onClick={() => handlers.onRetry?.(trackerId)}>{t.card.retry}</button>
          </div>}
          <div className="card__meters">
            {meters.map(m => <MeterBlock key={m.id} meter={m} now={now} />)}
          </div>
          {meters.length === 0 && <span className="card__empty">{snapshot.meters.length ? "All limits hidden" : "No usage data"}</span>}
        </>}
        {cardState === "loading" && <div className="skeleton skeleton--block" aria-label="Loading usage" />}
        {cardState === "signin-required" && <div className="card__signin">
          <span className="card__signin-text">{t.card.signInRequired}</span>
          <div className="card__signin-actions">
            <button className="btn btn--primary" onClick={() => handlers.onSignIn?.(trackerId)}>{t.card.signIn}</button>
            {view.hasCliCredentials && handlers.onImport && <button className="btn" onClick={() => handlers.onImport?.(trackerId)}>{t.card.importFromCli}</button>}
          </div>
        </div>}
        {!rateLimited && (cardState === "error" || cardState === "unsupported") && <div className="card__error">
          <span className="card__error-text">{view.errorMessage ?? t.card.unsupported}</span>
          {cardState === "error" && <button className="btn" onClick={() => handlers.onRetry?.(trackerId)}>{t.card.retry}</button>}
        </div>}
      </div>
      <div className="card__actions">
        {!!snapshot?.meters.length && handlers.onMeterVisibility && <button className="btn btn--compact card__limits"
          aria-label={`Visible limits for ${displayName}`} title="Choose visible limits" onClick={() => { setError(null); setLimitsOpen(true); }}>
          Limits <span>{meters.length}/{snapshot.meters.length}</span>
        </button>}
        {hasDetails && <button className="icon-btn card__expand" aria-label={`Details for ${displayName}`}
          aria-expanded={details} aria-controls={`${id}-details`} onClick={() => setDetails(!details)}><ChevronRightIcon size={16} /></button>}
      </div>
      {hasDetails && details && <div className="card__details" id={`${id}-details`}>
        {snapshot?.accountLabel && <InfoRow data={{ label: "Account", value: snapshot.accountLabel }} />}
        {detailRows.map(row => <InfoRow key={row.label} data={row} />)}
      </div>}
      {limitsOpen && <Modal titleId={`${id}-limits`} busy={saving} onCancel={() => setLimitsOpen(false)}>
        <div className="signin-dialog">
          <h2 className="signin-dialog__title" id={`${id}-limits`}>Visible limits</h2>
          <p className="signin-dialog__copy">{displayName} · Choose the limits shown in the overview and widget.</p>
          <div className="limit-options">
            {snapshot?.meters.map(m => <label key={m.id}>
              <input type="checkbox" checked={!view.hiddenMeterIds?.includes(m.id)} disabled={saving}
                onChange={event => void setVisible(m.id, event.target.checked)} />
              <span>{m.label}</span>
            </label>)}
          </div>
          {error && <div className="signin-dialog__error" role="alert">{error}</div>}
          <div className="signin-dialog__actions"><button className="btn btn--primary" autoFocus disabled={saving} onClick={() => setLimitsOpen(false)}>Done</button></div>
        </div>
      </Modal>}
    </article>
  );
}
