// The school's currency comes from the server after sign-in (see AuthContext).
let currency = "USD";
export const setCurrency = (code) => {
  currency = code || "USD";
};

export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value) || 0);

export const formatDate = (value) => (value ? String(value).slice(0, 10) : "—");

/** A moment in local time: "12 Oct 2026, 15:43". */
export const displayDateTime = (value, empty = "—") =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : empty;

/** A date the way the school writes it: "20 Oct 2026" (the calendar day, no time-zone shift). */
export const displayDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
};

/** Map a status/priority word to a badge colour class. */
export const badgeClass = (value) => {
  const v = String(value || "").toLowerCase();
  if (v.includes("high") || v.includes("danger") || v.includes("absent") || v.includes("overdue")) return "danger";
  if (
    v.includes("medium") ||
    v.includes("warning") ||
    v.includes("pending") ||
    v.includes("partial") ||
    v.includes("late")
  )
    return "warning";
  if (v.includes("ready") || v.includes("success") || v.includes("paid") || v.includes("present")) return "success";
  if (v.includes("low") || v.includes("info")) return "info";
  return "primary";
};

export const fullName = (person) => `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim();

export const average = (numbers) => (numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null);

/** "just now", "12m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(value, now = Date.now()) {
  if (!value) return "";
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return displayDate(new Date(value).toISOString());
}
