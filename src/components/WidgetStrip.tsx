import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Meter } from "../core/types";
import { visibleMeters, type TrackerView } from "../core/trackers";
import type { WidgetEdge } from "../core/store";
import type { WidgetTheme } from "../core/config";
import { ProviderLogo } from "../assets/logos";
import { formatResetIn, formatAgo } from "../core/format";
import { percentUsed as used, usageColor } from "../core/usage";
import { t } from "../i18n";
import { CloseIcon, SettingsIcon } from "../assets/icons";
import { InfoRow } from "./InfoRow";

// Geometry is shared with WidgetWindow (window sizing) — keep in sync.
export const WIDGET_ITEM = 64; // extent of one item along the pill
export const WIDGET_GAP = 10;
export const WIDGET_PAD = 10;
/** Depth of the pill (its short axis) — taller when docked horizontally. */
export const WIDGET_DEPTH_V = 62;
export const WIDGET_DEPTH_H = 74;
/** Concave corner blending the pill into the screen edge. */
export const WIDGET_CONCAVE = 22;
/** Button row overlaps the empty concave tail on vertical edges. */
export const WIDGET_FOOTER = 34;
export const WIDGET_CARD_W = 280;

export function isHorizontal(edge: WidgetEdge): boolean {
  return edge === "top" || edge === "bottom";
}

export function widgetDepth(edge: WidgetEdge): number {
  return isHorizontal(edge) ? WIDGET_DEPTH_H : WIDGET_DEPTH_V;
}

/** Length of the pill along the edge, for n providers. */
export function widgetLength(n: number): number {
  return WIDGET_CONCAVE * 2 + WIDGET_PAD * 2 + n * WIDGET_ITEM + Math.max(0, n - 1) * WIDGET_GAP;
}

type WidgetStripProps = {
  views: TrackerView[];
  edge: WidgetEdge;
  theme?: WidgetTheme;
  onToggle: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
  /** Called on every drag step; the caller snaps the window natively. */
  onDrag: () => void;
  onDragEnd: () => void;
  /** Native mode renders the preview in its own window, leaving this surface fixed. */
  onTipChange?: (view: TrackerView | null, center: number) => void;
};

const CR = 18; // pill corner radius

/** Silhouette docked to the right: rounded left side, concave shoulders into
    the edge. Other edges reuse it through a transform. */
function shapePath(depth: number, length: number): string {
  const sh = WIDGET_CONCAVE;
  return [
    `M ${depth} 0`,
    `A ${sh} ${sh} 0 0 1 ${depth - sh} ${sh}`,
    `L ${CR} ${sh}`,
    `A ${CR} ${CR} 0 0 0 0 ${sh + CR}`,
    `L 0 ${length - sh - CR}`,
    `A ${CR} ${CR} 0 0 0 ${CR} ${length - sh}`,
    `L ${depth - sh} ${length - sh}`,
    `A ${sh} ${sh} 0 0 1 ${depth} ${length}`,
    "Z",
  ].join(" ");
}

/** Maps the right-docked silhouette onto the other three edges. */
function shapeTransform(edge: WidgetEdge, depth: number): string | undefined {
  switch (edge) {
    case "left":
      return `translate(${depth} 0) scale(-1 1)`;
    case "bottom":
      return "matrix(0 1 1 0 0 0)";
    case "top":
      return `matrix(0 -1 1 0 0 ${depth})`;
    default:
      return undefined;
  }
}

const RING = 46;
const OUTER = 20; // short limit (session / 5h / credits)
const INNER = 14.5; // long limit (weekly)

function Arc({ r, meter, width }: { r: number; meter: Meter | undefined; width: number }) {
  const u = used(meter);
  const c = 2 * Math.PI * r;
  const mid = RING / 2;
  return (
    <>
      <circle cx={mid} cy={mid} r={r} stroke="var(--widget-ring)" strokeWidth={width} fill="none" />
      {u !== null && (
        <circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={usageColor(u)}
          strokeWidth={width}
          fill="none"
          strokeDasharray={`${(u / 100) * c} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      )}
    </>
  );
}

export function WidgetTip({ view, style, edge, onHeight }: { view: TrackerView; style?: React.CSSProperties; edge: WidgetEdge | "detached"; onHeight?: (height: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!onHeight) return;
    const element = ref.current!;
    const measure = () => onHeight(Math.min(600, element.scrollHeight));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [view, onHeight]);
  const meters = visibleMeters(view);
  const now = Date.now();
  return (
    <div ref={ref} className={`widget-tip widget-tip--${edge}`} style={style} onPointerDown={event => event.stopPropagation()}>
      <div className="widget-tip__head">
        <ProviderLogo id={view.providerId} size={16} />
        <span>{view.displayName}</span>
        {view.snapshot?.accountLabel && <small>{view.snapshot.accountLabel}</small>}
      </div>
      {view.rateLimitedUntil !== undefined && <p className="widget-tip__stale">{t.card.rateLimited}. {view.errorMessage}</p>}
      {view.cardState === "stale" && <p className="widget-tip__stale">{t.card.lastUpdated(formatAgo(view.staleSince, now))}{view.rateLimitedUntil === undefined ? " — update failed" : ""}</p>}
      {meters.length === 0 && <div className="widget-tip__empty">{view.errorMessage ?? (view.snapshot?.meters.length ? "All limits hidden" : view.cardState === "signin-required" ? t.card.signInRequired : view.cardState === "loading" ? t.settings.updating : t.settings.unavailable)}</div>}
      {meters.map((m) => {
        const u = used(m);
        return (
          <div key={m.id} className="widget-tip__meter">
            <div className="widget-tip__row">
              <span>{m.label}</span>
              <span className="widget-tip__reset">
                {m.resetsAt ? t.meter.resetsIn(formatResetIn(m.resetsAt, now)) : t.meter.resetsUnknown}
              </span>
            </div>
            <div className="widget-tip__track">
              <div className="widget-tip__fill" style={{ width: `${u ?? 0}%`, background: usageColor(u) }} />
            </div>
            <div className="widget-tip__used">{u === null ? t.settings.unavailable : t.meter.percentUsed(u)}</div>
          </div>
        );
      })}
      {!!view.snapshot?.infoRows.length && <div className="widget-tip__info">
        {view.snapshot.infoRows.map(row => <InfoRow key={row.label} data={row} />)}
      </div>}
    </div>
  );
}

export function WidgetStrip({
  views,
  edge,
  theme = "dark",
  onToggle,
  onExit,
  onOpenSettings,
  onDrag,
  onDragEnd,
  onTipChange,
}: WidgetStripProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  // Drag state; `moved` also swallows the click that would otherwise follow.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const horizontal = isHorizontal(edge);
  const depth = widgetDepth(edge);
  const length = widgetLength(views.length);
  const hovered = hover === null ? null : views[hover];

  // Card is centred on the hovered item and clamped inside the pill's length.
  const center =
    hover === null ? 0 : WIDGET_CONCAVE + WIDGET_PAD + hover * (WIDGET_ITEM + WIDGET_GAP) + WIDGET_ITEM / 2;
  const cardSpan = horizontal
    ? WIDGET_CARD_W
    : 48 + Math.max(1, hovered ? visibleMeters(hovered).length : 1) * 66;
  const offset = horizontal && length < cardSpan + 12
    ? (length - cardSpan) / 2
    : Math.max(6, Math.min(center - cardSpan / 2, length - cardSpan - 6));
  const cardStyle: React.CSSProperties = horizontal ? { left: offset } : { top: offset };

  useEffect(() => { onTipChange?.(hovered ?? null, center); }, [hovered, center, onTipChange]);

  return (
    <div
      className={`widget-shell widget-shell--${edge}`}
      data-widget-theme={theme}
      onMouseEnter={() => {
        setOver(true);
      }}
      onMouseLeave={() => {
        setHover(null);
        setOver(false);
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHover(null); setOver(false);
        }
      }}
    >
      <div
        className="widget"
        style={horizontal ? { height: depth } : { width: depth }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragged.current = false;
          drag.current = { x: event.screenX, y: event.screenY, moved: false };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state) return;
          const far = Math.abs(event.screenX - state.x) + Math.abs(event.screenY - state.y) >= 4;
          if (!state.moved && !far) return;
          // Capture only a drag: capturing pointerdown retargets ordinary button clicks to this container.
          event.currentTarget.setPointerCapture(event.pointerId);
          state.moved = true;
          setHover(null);
          onDrag();
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          dragged.current = state?.moved ?? false;
          if (state?.moved) onDragEnd();
        }}
        onPointerCancel={() => { if (drag.current?.moved) onDragEnd(); drag.current = null; }}
      >
        {hovered && !onTipChange && <WidgetTip view={hovered} style={cardStyle} edge={edge} />}
        <svg
          className="widget-shape"
          width={horizontal ? length : depth}
          height={horizontal ? depth : length}
          aria-hidden="true"
        >
          <path d={shapePath(depth, length)} fill="var(--widget-bg)" transform={shapeTransform(edge, depth)} />
        </svg>
        <div className="widget__items">
          {views.map((view, i) => {
            const meters = visibleMeters(view);
            const short = meters.find(m => m.id === "session" || m.id === "credits") ?? meters[0];
            const long = meters.find(m => (m.id.startsWith("weekly") || m.id === "monthly") && m.id !== short?.id);
            const u = used(short);
            const signedIn = !!view.snapshot;
            return (
              <button
                key={view.trackerId}
                type="button"
                className="widget__item"
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  onToggle();
                }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => { setHover(i); setOver(true); }}
                aria-label={`${view.displayName}: ${u === null ? t.settings.unavailable : t.meter.percentUsed(u)}${view.cardState === "stale" ? ", outdated data" : ""}`}
              >
                <span className="widget__disc">
                  <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="widget__ring">
                    <Arc r={OUTER} meter={short} width={3} />
                    {long && <Arc r={INNER} meter={long} width={2.5} />}
                  </svg>
                  <span className="widget__logo">
                    {signedIn ? <ProviderLogo id={view.providerId} size={16} /> : <span className="widget__alert">!</span>}
                  </span>
                </span>
                <span className="widget__pct">{u === null ? "—" : `${u}%`}{view.cardState === "stale" && <span className="widget__alert"> !</span>}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={over ? "widget__footer widget__footer--on" : "widget__footer"}
        style={horizontal ? undefined : { width: depth, marginTop: -WIDGET_CONCAVE }}>
        <button type="button" className="widget__btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <SettingsIcon size={13} />
        </button>
        <button type="button" className="widget__btn" onClick={onExit} title="Close widget" aria-label="Close widget">
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
