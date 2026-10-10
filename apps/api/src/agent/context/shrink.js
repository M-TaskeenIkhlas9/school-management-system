/**
 * Keep tool results small before they reach the model: long arrays become the first
 * `maxItems` plus a count of the rest, and long strings are cut. The full data stays
 * in the database; the model only needs enough to answer.
 */
export function shrink(value, { maxItems = 25, maxString = 500, depth = 0 } = {}) {
  if (depth > 6) return "[nested data omitted]";
  if (Array.isArray(value)) {
    const items = value.slice(0, maxItems).map((v) => shrink(v, { maxItems, maxString, depth: depth + 1 }));
    if (value.length > maxItems) items.push(`… and ${value.length - maxItems} more (not shown)`);
    return items;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shrink(v, { maxItems, maxString, depth: depth + 1 })])
    );
  }
  if (typeof value === "string" && value.length > maxString) return `${value.slice(0, maxString)}… (cut)`;
  return value;
}
