import type { InfoRowData } from "../core/types";
import { InfoIcon } from "../assets/icons";

// label (optional ⓘ tooltip) left, value right; sits outside the
// meter inset. Used for "Extra usage", "Bonus credits", "Requests".
export function InfoRow({ data }: { data: InfoRowData }) {
  return (
    <div className="inforow">
      <span className="inforow__label">
        {data.label}
        {data.tooltip && <InfoIcon size={12} title={data.tooltip} className="inforow__info" />}
      </span>
      <span className="inforow__value">{data.value}</span>
    </div>
  );
}
