const WIDTH = 560;
const HEIGHT = 200;
const PAD_X = 8;
const PAD_Y = 18;

function scale(data) {
  const values = data.map((d) => Number(d.value) || 0);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = (WIDTH - PAD_X * 2) / (data.length - 1 || 1);
  return data.map((d, i) => ({
    x: PAD_X + i * step,
    y: HEIGHT - PAD_Y - (((Number(d.value) || 0) - min) / range) * (HEIGHT - PAD_Y * 2),
    label: d.label ?? d.term ?? d.day ?? "",
    value: d.value,
  }));
}

/** A ruled line chart: hairline guides like exercise-book lines, one ink line, the last value marked. */
export default function TrendChart({ series }) {
  if (!series.length)
    return <p className="chart-empty">Figures appear here once results or attendance are recorded.</p>;
  const pts = scale(series);
  const last = pts[pts.length - 1];
  const guides = [0, 1, 2, 3].map((i) => PAD_Y + (i * (HEIGHT - PAD_Y * 2)) / 3);
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Trend over ${series.length} points`}>
        {guides.map((y) => (
          <line key={y} x1="0" x2={WIDTH} y1={y} y2={y} className="trend__guide" />
        ))}
        <polyline className="trend__line" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
        <circle className="trend__dot" cx={last.x} cy={last.y} r="4" />
      </svg>
      <figcaption>
        <span>{pts[0].label}</span>
        <span>
          {last.label} · <strong>{last.value}%</strong>
        </span>
      </figcaption>
    </figure>
  );
}
