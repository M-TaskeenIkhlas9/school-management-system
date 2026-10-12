/** A shimmering placeholder line while data loads. */
export default function Skeleton({ width = "100%", height = 14, style }) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}
