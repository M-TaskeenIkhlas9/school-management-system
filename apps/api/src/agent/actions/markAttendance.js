/**
 * Action type: a class's attendance register for one day. The assistant names who is absent or late
 * ("all present except Ali and Sara"); names are matched to the class here, not by the model, and
 * everyone else is marked present. Approving needs attendance:write for that class, so a teacher
 * confirms their own class's register.
 */
import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertClassAccess } from "../../middleware/access.js";
import { register } from "../../modules/attendance/attendance.service.js";

const words = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The students a name or roll number could mean: exact name first, then every word starting a name word. */
export function findStudent(students, query) {
  const q = String(query ?? "").trim();
  if (/^\d+$/.test(q)) {
    const byRoll = students.filter((s) => String(s.roll_number ?? "") === q);
    if (byRoll.length) return byRoll;
  }
  const needle = words(q);
  if (!needle.length) return [];
  const exact = students.filter((s) => words(s.student_name).join(" ") === needle.join(" "));
  if (exact.length) return exact;
  return students.filter((s) => {
    const name = words(s.student_name);
    return needle.every((w) => name.some((n) => n.startsWith(w)));
  });
}

function resolve(students, names, className) {
  const ids = new Set();
  const problems = [];
  for (const name of names) {
    const found = findStudent(students, name);
    if (found.length === 1) ids.add(found[0].student_id);
    else if (!found.length) problems.push(`no student "${name}" in ${className}`);
    else problems.push(`"${name}" could be ${found.map((s) => s.student_name).join(" or ")}`);
  }
  return { ids, problems };
}

export const markAttendance = {
  type: "mark_attendance",
  approvePermission: "attendance:write",

  /** @param spec { classroom_id, day?, absent?: string[], late?: string[] } (names or roll numbers) */
  async propose({ classroom_id, day, absent = [], late = [] }, req) {
    assertClassAccess(req, classroom_id);
    const today = schoolToday();
    const date = day || today;
    if (date > today) throw createError(400, "Attendance can't be marked for a future day", "VALIDATION_ERROR");
    const [[room]] = await pool.execute("SELECT name FROM classrooms WHERE id = ?", [classroom_id]);
    if (!room) throw createError(404, "Class not found", "NOT_FOUND");
    const { students } = await register(classroom_id, date);
    if (!students.length) throw createError(400, `${room.name} has no students enrolled`, "VALIDATION_ERROR");

    const away = resolve(students, absent, room.name);
    const tardy = resolve(students, late, room.name);
    const problems = [...away.problems, ...tardy.problems];
    if ([...away.ids].some((id) => tardy.ids.has(id))) problems.push("a student can't be both absent and late");
    if (problems.length) {
      const roster = students.map((s) => s.student_name).join(", ");
      throw createError(
        400,
        `Check the names: ${problems.join("; ")}. Students in ${room.name}: ${roster}.`,
        "VALIDATION_ERROR"
      );
    }

    const entries = students.map((s) => ({
      student_id: s.student_id,
      student_name: s.student_name,
      before: s.status ?? null,
      status: away.ids.has(s.student_id) ? "absent" : tardy.ids.has(s.student_id) ? "late" : "present",
    }));
    const names = (status) => entries.filter((e) => e.status === status).map((e) => e.student_name);
    const counts = { present: names("present").length, absent: names("absent").length, late: names("late").length };
    const summary =
      `Attendance for ${room.name} on ${date}: ${counts.present} present, ${counts.absent} absent` +
      (counts.late ? `, ${counts.late} late` : "");
    return {
      summary,
      payload: {
        classroom_id,
        class_name: room.name,
        day: date,
        entries: entries.map(({ student_id, status }) => ({ student_id, status })),
        approver_class_id: classroom_id,
      },
      preview: {
        class: room.name,
        day: date,
        ...counts,
        absent_names: names("absent"),
        late_names: names("late"),
        already_marked: entries.filter((e) => e.before).length,
        changes: entries
          .filter((e) => e.before && e.before !== e.status)
          .map((e) => ({ student: e.student_name, from: e.before, to: e.status })),
      },
      approverNeeds: [],
    };
  },

  /** Runs in the approval transaction; refuses if the class's students changed since the preview. */
  async execute(payload, conn, user) {
    const [enrolled] = await conn.execute(
      "SELECT student_id FROM enrollments WHERE classroom_id = ? AND is_active = 1 FOR UPDATE",
      [payload.classroom_id]
    );
    const now = enrolled.map((r) => r.student_id).sort((a, b) => a - b);
    const then = payload.entries.map((e) => e.student_id).sort((a, b) => a - b);
    if (now.join() !== then.join()) {
      throw createError(409, "The class's students changed after this was prepared. Prepare it again.", "STALE_ACTION");
    }
    for (const e of payload.entries) {
      await conn.execute(
        `INSERT INTO attendance (student_id, classroom_id, day, status, marked_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), classroom_id = VALUES(classroom_id), marked_by = VALUES(marked_by)`,
        [e.student_id, payload.classroom_id, payload.day, e.status, user?.id ?? null]
      );
    }
    const counts = { present: 0, late: 0, absent: 0 };
    for (const e of payload.entries) counts[e.status] += 1;
    return { saved: payload.entries.length, ...counts };
  },
};
