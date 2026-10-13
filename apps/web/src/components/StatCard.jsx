import Icon from "../app/Icon.jsx";
import Skeleton from "./Skeleton.jsx";

/**
 * A figure with its colour tile: label, value and an optional note or real trend.
 * `delta` = { dir: "up" | "down" | "flat" | "none", text }.
 */
export default function StatCard({ tone = "blue", icon, label, loading, children, delta, note }) {
  return (
    <div className="kpi">
      <div className="kpi__top">
        <span className={`tile tile--${tone}`}>
          <Icon name={icon} size={22} />
        </span>
        {delta && (
          <span className={`delta delta--${delta.dir}`}>
            {delta.dir !== "none" && (
              <Icon
                name={delta.dir === "up" ? "trendUp" : delta.dir === "down" ? "trendDown" : "flat"}
                size={16}
                strokeWidth={2}
              />
            )}
            {delta.text}
          </span>
        )}
      </div>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{loading ? <Skeleton width="55%" height={30} /> : children}</strong>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  );
}

/** A responsive row of StatCards. */
export function StatRow({ children }) {
  return <div className="kpis">{children}</div>;
}
