import { useId, useState } from "react";

const WIDTH = 560;
const HEIGHT = 210;
const PAD_L = 34;
const PAD_R = 14;
const PAD_Y = 18;

function scale(data) {
  const values = data.map((d) => Number(d.value) || 0);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  const range = hi - lo || 1;
  const step = (WIDTH - PAD_L - PAD_R) / (data.length - 1 || 1);
  const y = (v) => HEIGHT - PAD_Y - ((v - lo) / range) * (HEIGHT - PAD_Y * 2);
  return {
    lo,
    hi,
    y,
    pts: data.map((d, i) => ({
      x: data.length === 1 ? (WIDTH + PAD_L - PAD_R) / 2 : PAD_L + i * step,
      y: y(Number(d.value) || 0),
      label: d.label ?? "",
      value: Number(d.value) || 0,
    })),
  };
}

/**
 * A ruled line chart: exercise-book guide lines, an ink line that draws itself in, a soft wash
 * beneath, and the exact figure for any point you hover or focus.
 */
export default function TrendChart({ series, unit = "%" }) {
  const gradient = useId();
  const [active, setActive] = useState(null);
  if (!series.length) {
    return <p className="chart-empty">Figures appear here once results or attendance are recorded.</p>;
  }
  const { lo, hi, y, pts } = scale(series);
  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${PAD_L},${HEIGHT - PAD_Y} ${line} ${pts.at(-1).x},${HEIGHT - PAD_Y}`;
  const guides = [lo, lo + (hi - lo) / 2, hi];
  const shown = active ?? pts.length - 1;
  const point = pts[shown];

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Trend over ${series.length} points`}>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="trend__wash-top" />
            <stop offset="100%" className="trend__wash-bottom" />
          </linearGradient>
        </defs>
        {guides.map((g) => (
          <g key={g}>
            <line x1={PAD_L} x2={WIDTH - PAD_R} y1={y(g)} y2={y(g)} className="trend__guide" />
            <text x={PAD_L - 8} y={y(g) + 4} className="trend__axis">
              {Math.round(g)}
            </text>
          </g>
        ))}
        <polygon points={area} fill={`url(#${gradient})`} className="trend__area" />
        <polyline className="trend__line" points={line} pathLength="1" />
        {active !== null && <line x1={point.x} x2={point.x} y1={PAD_Y} y2={HEIGHT - PAD_Y} className="trend__cursor" />}
        {pts.map((p, i) => (
          <circle
            key={p.label + i}
            cx={p.x}
            cy={p.y}
            r={i === shown ? 5 : 3}
            className={`trend__dot ${i === shown ? "is-active" : ""}`}
            style={{ animationDelay: `${500 + i * 60}ms` }}
          />
        ))}
        {pts.map((p, i) => (
          <rect
            key={`hit-${p.label}-${i}`}
            x={p.x - 18}
            y="0"
            width="36"
            height={HEIGHT}
            className="trend__hit"
            tabIndex={0}
            aria-label={`${p.label}: ${p.value}${unit}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      <figcaption>
        <span>{pts[0].label}</span>
        <span className="trend__readout" aria-live="polite">
          {point.label} ·{" "}
          <strong>
            {point.value}
            {unit}
          </strong>
        </span>
      </figcaption>
    </figure>
  );
}
