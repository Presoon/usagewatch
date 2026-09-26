// Small inline UI icons (currentColor). Stroke icons mirror lucide geometry;
// keeping them inline avoids a runtime icon dependency.
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string; title?: string };

function Stroke({ size = 12, className, title, d, extra }: IconProps & { d: string; extra?: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
      {extra}
    </svg>
  );
}

export const FlameIcon = (p: IconProps) => (
  <Stroke
    {...p}
    d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
  />
);

export const CloseIcon = (p: IconProps) => <Stroke {...p} d="m6 6 12 12M6 18 18 6" />;
export const ArrowLeftIcon = (p: IconProps) => <Stroke {...p} d="m12 5-7 7 7 7M5 12h14" />;
export const ChevronRightIcon = (p: IconProps) => <Stroke {...p} d="m9 6 6 6-6 6" />;
export const RefreshIcon = (p: IconProps) => <Stroke {...p} d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />;
export const SettingsIcon = (p: IconProps) => <Stroke {...p}
  d="M18.93 9.13L21.78 9.92L21.78 14.08L18.93 14.87L18.93 14.87L20.39 17.45L17.45 20.39L14.87 18.93L14.87 18.93L14.08 21.78L9.92 21.78L9.13 18.93L9.13 18.93L6.55 20.39L3.61 17.45L5.07 14.87L5.07 14.87L2.22 14.08L2.22 9.92L5.07 9.13L5.07 9.13L3.61 6.55L6.55 3.61L9.13 5.07L9.13 5.07L9.92 2.22L14.08 2.22L14.87 5.07L14.87 5.07L17.45 3.61L20.39 6.55L18.93 9.13Z"
  extra={<circle cx="12" cy="12" r="3" />} />;

export const WarningIcon = (p: IconProps) => (
  <Stroke
    {...p}
    d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"
    extra={
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    }
  />
);

export const InfoIcon = (p: IconProps) => (
  <Stroke
    {...p}
    d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"
    extra={
      <>
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    }
  />
);

export const GripIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    {[
      [9, 5],
      [9, 12],
      [9, 19],
      [15, 5],
      [15, 12],
      [15, 19],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />
    ))}
  </svg>
);

export const EllipsisIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    {[5, 12, 19].map((cx) => (
      <circle key={cx} cx={cx} cy={12} r={1.6} />
    ))}
  </svg>
);
