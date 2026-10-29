/**
 * Schedules in the school's own time zone ("every school day at 11:00" means 11:00 in Karachi,
 * whatever the server's clock says).
 */
const tz = () => process.env.SCHOOL_TIMEZONE || "Asia/Karachi";

/** Days the school is open, 0 = Sunday … 6 = Saturday (SCHOOL_DAYS, default Monday–Friday). */
export const schoolDays = () =>
  (process.env.SCHOOL_DAYS || "1,2,3,4,5")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 0 && d <= 6);

/** Minutes the zone is ahead of UTC at a given moment. */
function offsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The UTC moment of a wall-clock time in the zone (handles DST by re-checking the offset). */
export function zonedTime(y, m, d, hh, mm, timeZone = tz()) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let at = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  const again = guess - offsetMinutes(new Date(at), timeZone) * 60000;
  if (again !== at) at = again;
  return new Date(at);
}

function localDate(date, timeZone = tz()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone }).format(date).split("-").map(Number);
  return { y, m, d };
}

/** Does this schedule fire on that local calendar day? */
function firesOn(schedule, { y, m, d }) {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "weekly") return weekday === Number(schedule.weekday);
  return schoolDays().includes(weekday); // school_days
}

/** The next moment after `after` when the schedule fires. */
export function nextRun(schedule, after = new Date(), timeZone = tz()) {
  const [hh, mm] = String(schedule.time || "09:00")
    .split(":")
    .map(Number);
  const start = localDate(after, timeZone);
  for (let i = 0; i < 15; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const local = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
    if (!firesOn(schedule, local)) continue;
    const at = zonedTime(local.y, local.m, local.d, hh, mm, timeZone);
    if (at > after) return at;
  }
  return null; // e.g. no school days configured
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Every Monday at 09:00", "Every school day at 11:00", "Every day at 18:30". */
export function describeSchedule(schedule) {
  const at = `at ${schedule.time}`;
  if (schedule.frequency === "weekly") return `Every ${WEEKDAYS[Number(schedule.weekday)]} ${at}`;
  if (schedule.frequency === "daily") return `Every day ${at}`;
  return `Every school day ${at}`;
}
