import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import * as guardianService from "../guardians/guardians.service.js";
import { inTransaction } from "../../db/transaction.js";

// The student's primary guardian, exposed as flat guardian_* fields for list views and forms.
const PRIMARY_GUARDIAN_JOIN = `
  LEFT JOIN (SELECT student_id, MIN(guardian_id) AS guardian_id
             FROM student_guardians WHERE is_primary = 1 GROUP BY student_id) pg ON pg.student_id = s.id
  LEFT JOIN guardians g ON g.id = pg.guardian_id`;
const PRIMARY_GUARDIAN_COLUMNS =
  "g.id AS guardian_id, g.full_name AS guardian_name, g.email AS guardian_email, g.phone AS guardian_phone";

/** Active students with their current class and latest fee status (one row each). */
export async function getAll({ classIds = null } = {}) {
  if (classIds && !classIds.length) return [];
  const [rows] = await pool.query(
    `SELECT s.*, e.classroom_id, c.name AS class_name, c.section AS class_section, ${PRIMARY_GUARDIAN_COLUMNS},
            (SELECT fl.status FROM fee_ledgers fl WHERE fl.student_id = s.id
             ORDER BY fl.due_date DESC, fl.id DESC LIMIT 1) AS latest_fee_status
     FROM students s
     LEFT JOIN (SELECT student_id, MIN(classroom_id) AS classroom_id
                FROM enrollments WHERE is_active = 1 GROUP BY student_id) e ON e.student_id = s.id
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     ${PRIMARY_GUARDIAN_JOIN}
     WHERE s.is_active = 1 ${classIds ? "AND e.classroom_id IN (?)" : ""}
     ORDER BY s.id DESC`,
    classIds ? [classIds] : []
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute(
    `SELECT s.*, ${PRIMARY_GUARDIAN_COLUMNS} FROM students s ${PRIMARY_GUARDIAN_JOIN} WHERE s.id = ? AND s.is_active = 1`,
    [id]
  );
  return rows[0] || null;
}

export async function getGuardians(studentId) {
  const [rows] = await pool.execute(
    `SELECT g.id, g.full_name, g.email, g.phone, g.preferred_channel,
            g.consent_whatsapp, g.consent_sms, g.consent_email, sg.relationship, sg.is_primary
     FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
     WHERE sg.student_id = ? ORDER BY sg.is_primary DESC, g.full_name`,
    [studentId]
  );
  return rows;
}

export async function getProfile(id) {
  const student = await getById(id);
  if (!student) return null;

  // Enrollment
  const [enrollRows] = await pool.execute(
    `SELECT e.*, c.name as class_name FROM enrollments e
     JOIN classrooms c ON c.id = e.classroom_id
     WHERE e.student_id = ? AND e.is_active = 1 LIMIT 1`,
    [id]
  );
  const enrollment = enrollRows[0] || null;

  // Attendance %
  const [attRows] = await pool.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as present_count
     FROM attendance WHERE student_id = ?`,
    [id]
  );
  const att = attRows[0];
  const attendanceRate = att.total > 0 ? Number(((att.present_count / att.total) * 100).toFixed(2)) : 100;

  // Results
  const [resultRows] = await pool.execute("SELECT * FROM result_cards WHERE student_id = ? ORDER BY created_at DESC", [
    id,
  ]);

  // Fees
  const [feeRows] = await pool.execute("SELECT * FROM fee_ledgers WHERE student_id = ? ORDER BY due_date DESC", [id]);
  const fees = feeRows.map((f) => ({
    ...f,
    remaining_amount: Number((f.amount_due - f.amount_paid).toFixed(2)),
  }));

  return {
    ...student,
    guardians: await getGuardians(id),
    enrollment,
    attendance_rate: attendanceRate,
    results: resultRows,
    fees,
  };
}

// Columns set from the admission form (the rest of a student's row is managed elsewhere).
const STUDENT_FIELDS = [
  "first_name",
  "last_name",
  "roll_number",
  "gr_number",
  "admission_date",
  "date_of_birth",
  "gender",
  "b_form",
  "father_name",
  "father_cnic",
  "religion",
  "address",
  "previous_school",
  "status",
];

async function assertGrAvailable(conn, grNumber, exceptId = 0) {
  if (!grNumber) return;
  const [dup] = await conn.execute("SELECT id FROM students WHERE gr_number = ? AND id != ?", [grNumber, exceptId]);
  if (dup.length > 0) throw createError(409, `GR number ${grNumber} is already used`, "DUPLICATE_GR");
}

/**
 * The next General Register number: one more than the highest numeric GR number so far.
 * The school settings row is locked first so two admissions at once can't get the same number.
 */
export async function nextGrNumber(conn) {
  await conn.execute("SELECT id FROM school_settings WHERE id = 1 FOR UPDATE");
  const [[{ n }]] = await conn.execute(
    "SELECT COALESCE(MAX(CAST(gr_number AS UNSIGNED)), 0) + 1 AS n FROM students WHERE gr_number REGEXP '^[0-9]+$'"
  );
  return String(n);
}

async function assertRollAvailable(conn, rollNumber, exceptId = 0) {
  if (!rollNumber) return;
  const [dup] = await conn.execute("SELECT id FROM students WHERE roll_number = ? AND id != ?", [rollNumber, exceptId]);
  if (dup.length > 0) throw createError(409, "Roll number already exists", "DUPLICATE_ROLL");
}

/**
 * Make `classroomId` the student's only active class (reusing an old enrollment row if one exists).
 * `outcome` records why the old class ended (e.g. "promoted" at year end).
 */
export async function setActiveClass(conn, studentId, classroomId, outcome = null) {
  const [rooms] = await conn.execute("SELECT id FROM classrooms WHERE id = ? AND is_active = 1", [classroomId]);
  if (!rooms.length) throw createError(400, "Class not found", "CLASS_NOT_FOUND");

  await conn.execute(
    `UPDATE enrollments SET is_active = 0, end_date = COALESCE(end_date, ?), outcome = COALESCE(?, outcome)
     WHERE student_id = ? AND classroom_id != ? AND is_active = 1`,
    [schoolToday(), outcome, studentId, classroomId]
  );
  const [existing] = await conn.execute("SELECT id FROM enrollments WHERE student_id = ? AND classroom_id = ?", [
    studentId,
    classroomId,
  ]);
  if (existing.length) {
    await conn.execute("UPDATE enrollments SET is_active = 1, end_date = NULL, outcome = NULL WHERE id = ?", [
      existing[0].id,
    ]);
  } else {
    await conn.execute("INSERT INTO enrollments (student_id, classroom_id, start_date) VALUES (?, ?, ?)", [
      studentId,
      classroomId,
      schoolToday(),
    ]);
  }
}

/**
 * Attach the guardian described by guardian_name/email/phone as the primary guardian.
 * Matching by email, then phone, reuses an existing parent (siblings share one record);
 * otherwise the current primary guardian's details are updated, or a new one created.
 */
async function syncPrimaryGuardian(conn, studentId, data) {
  const provided = ["guardian_name", "guardian_email", "guardian_phone"].some((k) => data[k] !== undefined);
  if (!provided) return;
  const details = { full_name: data.guardian_name, email: data.guardian_email, phone: data.guardian_phone };
  if (!details.full_name && !details.email && !details.phone) return;

  const [[current]] = await conn.execute(
    "SELECT guardian_id FROM student_guardians WHERE student_id = ? AND is_primary = 1 LIMIT 1",
    [studentId]
  );
  const email = details.email ? String(details.email).trim().toLowerCase() : null;
  const phone = guardianService.phoneOrThrow(details.phone);
  let match = null;
  if (email) [[match]] = await conn.execute("SELECT id FROM guardians WHERE email = ? LIMIT 1", [email]);
  if (!match && phone) [[match]] = await conn.execute("SELECT id FROM guardians WHERE phone = ? LIMIT 1", [phone]);

  if (match) {
    await guardianService.link(conn, studentId, match.id, { isPrimary: true });
  } else if (current) {
    await conn.execute("UPDATE guardians SET full_name = COALESCE(?, full_name), email = ?, phone = ? WHERE id = ?", [
      details.full_name || null,
      email,
      phone,
      current.guardian_id,
    ]);
  } else {
    const guardianId = await guardianService.create(
      {
        full_name: details.full_name || "Parent/Guardian",
        email,
        phone,
        preferred_channel: email ? "email" : "sms",
        consent_email: Boolean(email), // email contact as before; WhatsApp/SMS need explicit opt-in
      },
      conn
    );
    await guardianService.link(conn, studentId, guardianId, { isPrimary: true });
  }
}

/** Admit a student: GR number (next in the register unless given), class and primary guardian, atomically. */
export async function create(data) {
  const id = await inTransaction(async (conn) => {
    await assertRollAvailable(conn, data.roll_number);
    await assertGrAvailable(conn, data.gr_number);
    const row = {
      ...Object.fromEntries(STUDENT_FIELDS.map((k) => [k, data[k] || null])),
      status: data.status || "active",
      gr_number: data.gr_number || (await nextGrNumber(conn)),
      admission_date: data.admission_date || schoolToday(),
    };
    if (data.classroom_id) {
      const [[room]] = await conn.execute("SELECT name, section FROM classrooms WHERE id = ?", [data.classroom_id]);
      if (room) row.admission_class = room.section ? `${room.name} (${room.section})` : room.name;
    }
    const keys = Object.keys(row);
    const [result] = await conn.execute(
      `INSERT INTO students (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      keys.map((k) => row[k])
    );
    if (data.classroom_id) await setActiveClass(conn, result.insertId, data.classroom_id);
    await syncPrimaryGuardian(conn, result.insertId, data);
    return result.insertId;
  });
  return getById(id);
}

/** Update student fields and (optionally) move them to `classroom_id`, atomically. */
export async function update(id, data) {
  if (!(await getById(id))) return null;
  await inTransaction(async (conn) => {
    await assertRollAvailable(conn, data.roll_number, id);
    await assertGrAvailable(conn, data.gr_number, id);
    // A GR number and admission date, once given, stay: an empty field on edit leaves them as they are.
    const keys = STUDENT_FIELDS.filter(
      (key) => data[key] !== undefined && !(["gr_number", "admission_date"].includes(key) && !data[key])
    );
    if (keys.length) {
      await conn.execute(`UPDATE students SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [
        ...keys.map((k) => data[k]),
        id,
      ]);
    }
    if (data.classroom_id) await setActiveClass(conn, id, data.classroom_id);
    await syncPrimaryGuardian(conn, id, data);
  });
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE students SET is_active = 0 WHERE id = ?", [id]);
}
