const WIDTH = 520;
const HEIGHT = 220;
const PADDING = 24;

function linePoints(data) {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = (WIDTH - PADDING * 2) / (data.length - 1 || 1);
  return data
    .map((point, i) => `${PADDING + i * step},${HEIGHT - PADDING - ((point.value - min) / range) * (HEIGHT - PADDING * 2)}`)
    .join(" ");
}

export default function TrendChart({ series }) {
  if (!series.length) return <div className="chart-empty">Add results or attendance to see trends.</div>;
  const points = linePoints(series);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <defs>
        <linearGradient id="trend" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6d7df6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6d7df6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="#5166f0" strokeWidth="3" strokeLinecap="round" points={points} />
      <polygon fill="url(#trend)" points={`${points} ${WIDTH - PADDING},${HEIGHT - PADDING} ${PADDING},${HEIGHT - PADDING}`} />
    </svg>
  );
}
