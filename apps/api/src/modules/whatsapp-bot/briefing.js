/**
 * The principal's morning briefing: attendance, fees, online payments waiting to be matched and
 * approvals waiting, each part only when the person may see it (a teacher gets their classes'
 * attendance and nothing about fees). Sent on WhatsApp by a "daily_briefing" automation or the
 * TODAY command.
 */
import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { formatMoney } from "../../messaging/audiences.js";
import { getConsecutiveAbsent } from "../attendance/attendance.service.js";
import * as actions from "../../agent/actions/actions.service.js";
import { school } from "../settings/school.js";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const shiftDay = (day, days) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const longDate = (day) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

const shortDate = (day) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function attendancePart(classIds, today) {
  if (classIds && !classIds.length) return null;
  const scope = classIds ? "AND c.id IN (?)" : "";
  const params = (...p) => (classIds ? [...p, classIds] : p);

  const [classes] = await pool.query(
    `SELECT c.name, COUNT(DISTINCT e.student_id) AS enrolled, COUNT(DISTINCT a.student_id) AS marked
     FROM classrooms c
     JOIN enrollments e ON e.classroom_id = c.id AND e.is_active = 1
     JOIN students s ON s.id = e.student_id AND s.is_active = 1
     LEFT JOIN attendance a ON a.student_id = e.student_id AND a.day = ?
     WHERE c.is_active = 1 ${scope}
     GROUP BY c.id, c.name ORDER BY c.name`,
    params(today)
  );
  const unmarked = classes.filter((c) => Number(c.marked) === 0).map((c) => c.name);

  const [[last]] = await pool.query(
    `SELECT MAX(a.day) AS day FROM attendance a JOIN classrooms c ON c.id = a.classroom_id WHERE a.day < ? ${scope}`,
    params(today)
  );
  let previous = null;
  if (last.day) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(a.status IN ('present','late')) AS attended, SUM(a.status = 'absent') AS absent
       FROM attendance a JOIN classrooms c ON c.id = a.classroom_id WHERE a.day = ? ${scope}`,
      params(dateOnly(last.day))
    );
    previous = {
      day: dateOnly(last.day),
      rate: Math.round((Number(row.attended) / Number(row.total)) * 100),
      absent: Number(row.absent),
    };
  }

  let streaks = (await getConsecutiveAbsent(3)).map((s) => s.student_id);
  if (streaks.length && classIds) {
    const [rows] = await pool.query(
      "SELECT DISTINCT student_id FROM enrollments WHERE is_active = 1 AND student_id IN (?) AND classroom_id IN (?)",
      [streaks, classIds]
    );
    streaks = rows.map((r) => r.student_id);
  }
  return {
    classes: classes.length,
    marked: classes.length - unmarked.length,
    unmarked,
    previous,
    streaks: streaks.length,
  };
}

async function feesPart(today) {
  const yesterday = shiftDay(today, -1);
  const [[paid]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN paid_on = ? THEN amount + late_fine END), 0) AS yesterday,
            COALESCE(SUM(amount + late_fine), 0) AS month
     FROM fee_payments WHERE paid_on >= ? AND paid_on <= ?`,
    [yesterday, `${today.slice(0, 7)}-01`, today]
  );
  const [[overdue]] = await pool.query(
    `SELECT COALESCE(SUM(f.amount_due - f.amount_paid), 0) AS amount, COUNT(DISTINCT f.student_id) AS students
     FROM fee_ledgers f JOIN students s ON s.id = f.student_id AND s.is_active = 1
     WHERE f.status != 'paid' AND f.due_date < ?`,
    [today]
  );
  const [[online]] = await pool.query(
    "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM incoming_payments WHERE status = 'unmatched'"
  );
  return {
    yesterday: Number(paid.yesterday),
    month: Number(paid.month),
    overdue: Number(overdue.amount),
    overdueStudents: Number(overdue.students),
    toMatch: Number(online.count),
    toMatchAmount: Number(online.amount),
  };
}

/**
 * @returns {{ day, text, summary: string[] }} text for WhatsApp; summary is four one-line parts
 *   (school and date, attendance, fees, approvals) for the `daily_briefing` template.
 */
export async function buildBriefing(user, today = schoolToday()) {
  const can = (p) => user.permissions.has(p);
  const lines = [`*Good morning – ${school().name || "your school"}*`, longDate(today)];
  const summary = [`${school().name || "School"}, ${shortDate(today)}`];

  const att = can("attendance:read") ? await attendancePart(user.classIds, today) : null;
  if (att) {
    lines.push("", "*Attendance*");
    if (att.previous) {
      lines.push(
        `- ${shortDate(att.previous.day)}: ${att.previous.rate}% present, ${plural(att.previous.absent, "absent", "absent")}`
      );
    }
    lines.push(
      att.unmarked.length
        ? `- Today: ${att.marked} of ${plural(att.classes, "class", "classes")} marked (not yet: ${att.unmarked.join(", ")})`
        : `- Today: all ${plural(att.classes, "class", "classes")} marked`
    );
    if (att.streaks) lines.push(`- ${plural(att.streaks, "student")} absent 3+ school days in a row`);
    summary.push(
      `Attendance: ${att.previous ? `${att.previous.rate}% present on ${shortDate(att.previous.day)}` : "nothing marked yet"}` +
        `, ${att.marked}/${att.classes} classes marked today` +
        (att.streaks ? `, ${att.streaks} absent 3+ days running` : "")
    );
  } else {
    summary.push("Attendance: -");
  }

  const fees = can("fees:read") ? await feesPart(today) : null;
  if (fees) {
    lines.push(
      "",
      "*Fees*",
      `- Collected yesterday: ${formatMoney(fees.yesterday)} (this month ${formatMoney(fees.month)})`,
      fees.overdue
        ? `- Overdue: ${formatMoney(fees.overdue)} from ${plural(fees.overdueStudents, "student")}`
        : "- Nothing overdue"
    );
    if (fees.toMatch) {
      lines.push(
        `- ${plural(fees.toMatch, "online payment")} (${formatMoney(fees.toMatchAmount)}) waiting to be matched`
      );
    }
    summary.push(
      `Fees: ${formatMoney(fees.yesterday)} collected yesterday, ${formatMoney(fees.overdue)} overdue` +
        (fees.toMatch ? `, ${fees.toMatch} online payments to match` : "")
    );
  } else {
    summary.push("Fees: -");
  }

  const waiting = (await actions.listForUser(user, { status: "pending" })).filter((a) => a.can_approve);
  if (waiting.length) {
    lines.push("", `*Waiting for you (${waiting.length})*`);
    for (const a of waiting.slice(0, 3)) lines.push(`- #${a.id} ${a.summary}`);
    if (waiting.length > 3) lines.push(`- …and ${waiting.length - 3} more`);
    lines.push("", "Reply PENDING to approve, or ask me anything.");
  } else {
    lines.push("", "Nothing is waiting for your approval. Ask me anything.");
  }
  summary.push(waiting.length ? `${plural(waiting.length, "item")} waiting for your approval` : "Nothing to approve");

  return { day: today, text: lines.join("\n"), summary };
}
