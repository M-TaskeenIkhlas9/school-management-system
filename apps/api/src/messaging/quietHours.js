/**
 * Quiet hours: no messages to parents at night. QUIET_HOURS="21-7" (default) means nothing is
 * sent from 21:00 until 07:00 in SCHOOL_TIMEZONE; "off" disables. Anything queued during quiet
 * hours is held until they end.
 */
const timeZone = () => process.env.SCHOOL_TIMEZONE || "Asia/Karachi";

export function quietWindow(setting = process.env.QUIET_HOURS ?? "21-7") {
  if (!setting || setting === "off") return null;
  const [start, end] = setting.split("-").map(Number);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  return { start, end };
}

/** Hour (0-23) of `date` in the school's time zone. */
export function schoolHour(date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timeZone(), hour: "2-digit", hourCycle: "h23" }).format(date)
  );
}

export function isQuiet(date, window = quietWindow()) {
  if (!window) return false;
  const h = schoolHour(date);
  return window.start > window.end ? h >= window.start || h < window.end : h >= window.start && h < window.end;
}

/** `now` if sending is allowed, otherwise the first moment after quiet hours end. */
export function nextSendTime(now = new Date(), window = quietWindow()) {
  if (!isQuiet(now, window)) return now;
  let t = new Date(now);
  t.setSeconds(0, 0);
  for (let i = 0; i < 24 * 4 && isQuiet(t, window); i++) t = new Date(t.getTime() + 15 * 60 * 1000);
  // Step back to the exact start of the hour quiet hours end.
  t.setMinutes(0, 0, 0);
  return isQuiet(t, window) ? new Date(t.getTime() + 60 * 60 * 1000) : t;
}
