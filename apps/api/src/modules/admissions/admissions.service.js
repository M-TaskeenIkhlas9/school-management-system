/**
 * Admission records, the way a Pakistani school keeps them: the General Register (every student
 * ever admitted, by GR number), the School Leaving Certificate, and year-end promotion.
 */
import pool from "../../db/pool.js";
import { inTransaction } from "../../db/transaction.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { PASS_PERCENT } from "../results/results.service.js";
import { setActiveClass } from "../students/students.service.js";
import { school } from "../settings/school.js";

const money = (n) => Math.round(Number(n) * 100) / 100;
const className = (c) => (c?.name ? (c.section ? `${c.name} (${c.section})` : c.name) : null);

// ---------- General Register ----------

/** Every student admitted, current and former, in GR number order. Search by name, GR no. or father. */
export async function register({ q, status } = {}) {
  const where = [];
  const params = [];
  if (q) {
    const like = `%${String(q).trim()}%`;
    where.push("(CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR s.gr_number LIKE ? OR s.father_name LIKE ?)");
    params.push(like, like, like);
  }
  if (status === "current") where.push("s.is_active = 1");
  else if (status === "former") where.push("s.status IN ('left', 'passed_out')");
  else where.push("(s.is_active = 1 OR s.status IN ('left', 'passed_out'))");

  const [rows] = await pool.query(
    `SELECT s.id, s.gr_number, s.first_name, s.last_name, s.father_name, s.gender, s.date_of_birth,
            s.admission_date, s.admission_class, s.status, s.left_on, s.leaving_class, s.slc_number,
            MIN(c.name) AS class_name, MIN(c.section) AS class_section
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     WHERE ${where.join(" AND ")}
     GROUP BY s.id
     ORDER BY s.gr_number IS NULL, CAST(s.gr_number AS UNSIGNED), s.gr_number, s.id
     LIMIT 500`,
    params
  );
  return rows.map(({ class_name, class_section, ...r }) => ({
    ...r,
    name: `${r.first_name} ${r.last_name}`.trim(),
    current_class: className({ name: class_name, section: class_section }),
  }));
}

// ---------- Leaving ----------

async function outstandingFees(conn, studentId) {
  const [[{ owed }]] = await conn.execute(
    "SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS owed FROM fee_ledgers WHERE student_id = ? AND amount_paid < amount_due",
    [studentId]
  );
  return money(owed);
}

async function nextSlcNumber(conn) {
  await conn.execute("SELECT id FROM school_settings WHERE id = 1 FOR UPDATE");
  const [[{ n }]] = await conn.execute("SELECT COALESCE(MAX(slc_number), 0) + 1 AS n FROM students");
  return n;
}

/**
 * Strike a student off the rolls and give the leaving certificate a number. Their class ends with
 * `outcome`. Refused while fees are unpaid unless `ignore_dues` (the principal's call).
 */
async function strikeOff(conn, studentId, { left_on, reason, conduct, ignore_dues = false, outcome = "left" }) {
  const [[student]] = await conn.execute("SELECT id, is_active FROM students WHERE id = ? FOR UPDATE", [studentId]);
  if (!student) throw createError(404, "Student not found", "NOT_FOUND");
  if (!student.is_active) throw createError(400, "This student has already left", "ALREADY_LEFT");

  const owed = await outstandingFees(conn, studentId);
  if (owed > 0 && !ignore_dues) {
    throw createError(400, `${owed} in fees is still unpaid. Clear it first, or leave anyway.`, "DUES_OUTSTANDING");
  }
  const [[room]] = await conn.execute(
    `SELECT c.name, c.section FROM enrollments e JOIN classrooms c ON c.id = e.classroom_id
     WHERE e.student_id = ? AND e.is_active = 1 LIMIT 1`,
    [studentId]
  );
  const day = left_on || schoolToday();
  await conn.execute(
    `UPDATE students SET is_active = 0, status = ?, left_on = ?, leaving_class = ?, leaving_reason = ?,
            leaving_conduct = ?, slc_number = ? WHERE id = ?`,
    [
      outcome === "passed_out" ? "passed_out" : "left",
      day,
      className(room),
      reason || null,
      conduct || "Good",
      await nextSlcNumber(conn),
      studentId,
    ]
  );
  await conn.execute(
    "UPDATE enrollments SET is_active = 0, end_date = ?, outcome = ? WHERE student_id = ? AND is_active = 1",
    [day, outcome, studentId]
  );
}

export async function leave(studentId, data) {
  await inTransaction((conn) => strikeOff(conn, studentId, data));
  return certificate(studentId);
}

/** Take a former student back (left by mistake, or returning): active again in `classroom_id`. */
export async function readmit(studentId, { classroom_id }) {
  await inTransaction(async (conn) => {
    const [[student]] = await conn.execute("SELECT is_active FROM students WHERE id = ? FOR UPDATE", [studentId]);
    if (!student) throw createError(404, "Student not found", "NOT_FOUND");
    if (student.is_active) throw createError(400, "This student is already on the rolls", "NOT_LEFT");
    await conn.execute(
      `UPDATE students SET is_active = 1, status = 'active', left_on = NULL, leaving_class = NULL,
              leaving_reason = NULL, leaving_conduct = NULL WHERE id = ?`,
      [studentId]
    );
    await setActiveClass(conn, studentId, classroom_id);
  });
}

/** What the School Leaving Certificate prints. Only for a student who has left. */
export async function certificate(studentId) {
  const [[s]] = await pool.execute("SELECT * FROM students WHERE id = ?", [studentId]);
  if (!s) throw createError(404, "Student not found", "NOT_FOUND");
  if (!["left", "passed_out"].includes(s.status)) {
    throw createError(400, "A leaving certificate is given only once the student has left", "NOT_LEFT");
  }
  const [[guardian]] = await pool.execute(
    `SELECT g.full_name FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
     WHERE sg.student_id = ? AND sg.is_primary = 1 LIMIT 1`,
    [studentId]
  );
  const { name, address, phone } = school();
  return {
    school: { name: name || "School", address, phone },
    slc_number: s.slc_number,
    gr_number: s.gr_number,
    name: `${s.first_name} ${s.last_name}`.trim(),
    father_name: s.father_name || guardian?.full_name || null,
    gender: s.gender,
    religion: s.religion,
    date_of_birth: s.date_of_birth,
    b_form: s.b_form,
    admission_date: s.admission_date,
    admission_class: s.admission_class,
    left_on: s.left_on,
    leaving_class: s.leaving_class,
    reason: s.leaving_reason,
    conduct: s.leaving_conduct,
    status: s.status,
    dues: await outstandingFees(pool, studentId),
  };
}

// ---------- Year-end promotion ----------

/**
 * A class's students with their latest result, and a suggestion: keep back anyone whose latest
 * result failed (below 33% overall, or below 33% in any subject); promote everyone else.
 */
export async function promotionList(classroomId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.roll_number, s.gr_number,
            r.id AS result_id, r.term, r.percentage,
            (SELECT COUNT(*) FROM result_subjects rs
             WHERE rs.result_id = r.id AND rs.obtained IS NOT NULL AND rs.obtained * 100 < rs.total * ?) AS failed_subjects
     FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.is_active = 1
     LEFT JOIN result_cards r ON r.id = (
       SELECT id FROM result_cards WHERE student_id = s.id AND classroom_id = e.classroom_id
       ORDER BY created_at DESC, id DESC LIMIT 1)
     WHERE e.classroom_id = ? AND e.is_active = 1
     ORDER BY s.roll_number IS NULL, s.roll_number, s.first_name`,
    [PASS_PERCENT, classroomId]
  );
  return rows.map((r) => {
    const passed = r.result_id ? Number(r.percentage) >= PASS_PERCENT && !Number(r.failed_subjects) : null;
    return {
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      roll_number: r.roll_number,
      gr_number: r.gr_number,
      result: r.result_id ? { term: r.term, percentage: Number(r.percentage), passed } : null,
      suggestion: passed === false ? "retain" : "promote",
    };
  });
}

/**
 * Promote a class at year end. Each student is promoted (to `to_classroom_id`, or passed out of
 * school when there is no next class), kept back in the same class, or struck off as left.
 * Students not listed in `decisions` are promoted.
 */
export async function promote({ from_classroom_id, to_classroom_id = null, decisions = {}, date }) {
  if (to_classroom_id && to_classroom_id === from_classroom_id) {
    throw createError(400, "Choose a different class to promote to", "VALIDATION_ERROR");
  }
  const day = date || schoolToday();
  const students = await promotionList(from_classroom_id);
  if (!students.length) throw createError(400, "No students in that class", "EMPTY_CLASS");
  const [[from]] = await pool.execute("SELECT name, section FROM classrooms WHERE id = ?", [from_classroom_id]);

  const counts = { promoted: 0, passed_out: 0, retained: 0, left: 0 };
  await inTransaction(async (conn) => {
    for (const s of students) {
      const choice = decisions[s.id] ?? "promote";
      if (choice === "retain") {
        await conn.execute(
          "UPDATE enrollments SET outcome = 'retained' WHERE student_id = ? AND classroom_id = ? AND is_active = 1",
          [s.id, from_classroom_id]
        );
        counts.retained += 1;
      } else if (choice === "leave") {
        await strikeOff(conn, s.id, { left_on: day, reason: "Left at the end of the year", ignore_dues: true });
        counts.left += 1;
      } else if (to_classroom_id) {
        await setActiveClass(conn, s.id, to_classroom_id, "promoted");
        counts.promoted += 1;
      } else {
        await strikeOff(conn, s.id, {
          left_on: day,
          reason: `Passed out after completing ${className(from)}`,
          outcome: "passed_out",
          ignore_dues: true,
        });
        counts.passed_out += 1;
      }
    }
  });
  return counts;
}
