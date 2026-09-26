import type { Meter } from "../core/types";
import { formatResetIn } from "../core/format";
import { t } from "../i18n";
import { FlameIcon } from "../assets/icons";
import { percentUsed, usageColor } from "../core/usage";

export function MeterBlock({ meter, now }: { meter: Meter; now: number }) {
  const isLimit = meter.state === "limit";
  const used = percentUsed(meter);
  const resetText = meter.resetsAt
    ? t.meter.resetsIn(formatResetIn(meter.resetsAt, now))
    : t.meter.resetsUnknown;

  return (
    <div className="meter">
      <div className="meter__heading">
        <div className="meter__label" title={meter.label}>{meter.label}</div>
        <span className="meter__value" title={used !== null ? t.meter.percentUsed(used) : t.settings.unavailable}>
          {used !== null ? `${used}%` : "—"}
        </span>
      </div>

      {used !== null && (
        <div className="meter__track" role="meter" aria-label={`${meter.label} usage`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} aria-valuetext={t.meter.percentUsed(used)}>
          <div className="meter__fill" style={{ width: `${used}%`, background: usageColor(used) }} />
        </div>
      )}

      <div className="meter__row">
        {isLimit ? (
          <span className="meter__limit">
            <FlameIcon size={12} />
            {t.meter.percentUsed(100)} · {t.meter.limitReached}
          </span>
        ) : used === null ? <span className="meter__left">{t.settings.unavailable}</span> : null}
        <span className="meter__reset">{resetText}</span>
      </div>
    </div>
  );
}
