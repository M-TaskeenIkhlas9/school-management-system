import { useCountUp } from "../lib/motion.js";

/** A figure that counts up into place. `format` turns the number into text (default: whole number). */
export default function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), fallback = "—" }) {
  const n = useCountUp(Number(value));
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return <span className="count-up">{format(n)}</span>;
}
