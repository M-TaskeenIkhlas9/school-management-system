/**
 * Who a message is about. The assistant (or a user) picks an audience; the server turns it
 * into students — the model can never supply addresses. Every audience checks the requesting
 * user's permissions and class scope.
 */
import pool from "../db/pool.js";
import { schoolToday } from "../config/env.js";
import { assertStudentAccess, classScope, hasPermission } from "../middleware/access.js";
import { createError } from "../middleware/errorHandler.js";
import * as feeService from "../modules/fees/fees.service.js";
import { getConsecutiveAbsent } from "../modules/attendance/attendance.service.js";

export const AUDIENCES = ["fee_defaulters", "absent_on_date", "absence_streak", "class", "students", "all_parents"];

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: process.env.CURRENCY || "USD" }).format(
    Number(value) || 0
  );

function requirePermission(req, permission, what) {
  if (!hasPermission(req, permission)) throw createError(403, `You don't have access to ${what}`, "FORBIDDEN");
}

/** Active students (in scope) by id, with class name. */
async function studentsByIds(req, ids) {
  if (!ids.length) return [];
  const scope = classScope(req);
  if (scope && !scope.length) return [];
  const [rows] = await pool.query(
    `SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS name, c.name AS class_name, e.classroom_id
     FROM students s
     JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     JOIN classrooms c ON c.id = e.classroom_id
     WHERE s.is_active = 1 AND s.id IN (?) ${scope ? "AND e.classroom_id IN (?)" : ""}
     GROUP BY s.id, s.first_name, s.last_name, c.name, e.classroom_id`,
    scope ? [ids, scope] : [ids]
  );
  return rows;
}

/**
 * @returns {{ label: string, students: Array<{ id, name, class_name, vars }>, approverNeeds: string[] }}
 * `vars` are template variables specific to that student (amount owed, absence detail, …).
 * `approverNeeds`: permissions an approver must also hold to see this audience's data.
 */
export async function resolveAudience(req, spec) {
  switch (spec.audience) {
    case "fee_defaulters": {
      requirePermission(req, "fees:read", "fee information");
      const owed = new Map();
      for (const f of await feeService.getDefaulters()) {
        const row = owed.get(f.student_id) ?? { amount: 0, oldest: f.due_date };
        row.amount += f.remaining_amount;
        if (f.due_date < row.oldest) row.oldest = f.due_date;
        owed.set(f.student_id, row);
      }
      const students = await studentsByIds(req, [...owed.keys()]);
      return {
        label: "parents of students with overdue fees",
        approverNeeds: ["fees:read"],
        students: students.map((s) => {
          const o = owed.get(s.id);
          const oldest = o.oldest instanceof Date ? o.oldest.toISOString().slice(0, 10) : String(o.oldest).slice(0, 10);
          return { ...s, vars: { amount_owed: o.amount, oldest_due_date: oldest } };
        }),
      };
    }
    case "absent_on_date": {
      requirePermission(req, "attendance:read", "attendance");
      const date = spec.date || schoolToday();
      const [rows] = await pool.query(
        "SELECT DISTINCT student_id FROM attendance WHERE day = ? AND status = 'absent'",
        [date]
      );
      const students = await studentsByIds(
        req,
        rows.map((r) => r.student_id)
      );
      return {
        label: `parents of students absent on ${date}`,
        approverNeeds: ["attendance:read"],
        students: students.map((s) => ({ ...s, vars: { absence_detail: `on ${date}` } })),
      };
    }
    case "absence_streak": {
      requirePermission(req, "attendance:read", "attendance");
      const days = spec.days || 3;
      const streaks = await getConsecutiveAbsent(days);
      const streakOf = new Map(streaks.map((s) => [s.student_id, s.absent_streak]));
      const students = await studentsByIds(req, [...streakOf.keys()]);
      return {
        label: `parents of students absent ${days}+ school days in a row`,
        approverNeeds: ["attendance:read"],
        students: students.map((s) => ({
          ...s,
          vars: { absence_detail: `${streakOf.get(s.id)} school days in a row` },
        })),
      };
    }
    case "class": {
      const scope = classScope(req);
      const [rooms] = await pool.query(
        `SELECT id, name FROM classrooms WHERE is_active = 1 ${scope ? "AND id IN (?)" : ""}`,
        scope ? [scope.length ? scope : [0]] : []
      );
      const needle = String(spec.class_name || "")
        .trim()
        .toLowerCase();
      const matches = rooms.filter((r) => r.name.toLowerCase() === needle);
      const room =
        matches[0] ??
        (rooms.filter((r) => r.name.toLowerCase().includes(needle)).length === 1
          ? rooms.find((r) => r.name.toLowerCase().includes(needle))
          : null);
      if (!needle || !room) {
        throw createError(
          400,
          `Class "${spec.class_name}" not found. Classes you can use: ${rooms.map((r) => r.name).join(", ") || "none"}`,
          "CLASS_NOT_FOUND"
        );
      }
      const [rows] = await pool.query("SELECT student_id FROM enrollments WHERE classroom_id = ? AND is_active = 1", [
        room.id,
      ]);
      const students = await studentsByIds(
        req,
        rows.map((r) => r.student_id)
      );
      return {
        label: `parents of ${room.name}`,
        approverNeeds: [],
        students: students.map((s) => ({ ...s, vars: {} })),
      };
    }
    case "students": {
      const ids = [...new Set((spec.student_ids || []).map(Number))];
      if (!ids.length) throw createError(400, "student_ids is required for this audience", "VALIDATION_ERROR");
      for (const id of ids) await assertStudentAccess(req, id);
      const students = await studentsByIds(req, ids);
      return {
        label: "parents of the selected students",
        approverNeeds: [],
        students: students.map((s) => ({ ...s, vars: {} })),
      };
    }
    case "all_parents": {
      if (classScope(req)) throw createError(403, "Only school-wide roles can message all parents", "FORBIDDEN");
      const [rows] = await pool.query("SELECT id FROM students WHERE is_active = 1");
      const students = await studentsByIds(
        req,
        rows.map((r) => r.id)
      );
      return { label: "all parents", approverNeeds: [], students: students.map((s) => ({ ...s, vars: {} })) };
    }
    default:
      throw createError(400, `Unknown audience "${spec.audience}"`, "VALIDATION_ERROR");
  }
}

export { formatMoney };
