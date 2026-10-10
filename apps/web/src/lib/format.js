export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

export const formatDate = (value) => (value ? String(value).slice(0, 10) : "—");

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
