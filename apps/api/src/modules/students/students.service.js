import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";

/** Active students with their current class and latest fee status (one row each). */
export async function getAll() {
  const [rows] = await pool.execute(
    `SELECT s.*, e.classroom_id, c.name AS class_name, c.section AS class_section,
            (SELECT fl.status FROM fee_ledgers fl WHERE fl.student_id = s.id
             ORDER BY fl.due_date DESC, fl.id DESC LIMIT 1) AS latest_fee_status
     FROM students s
     LEFT JOIN (SELECT student_id, MIN(classroom_id) AS classroom_id
                FROM enrollments WHERE is_active = 1 GROUP BY student_id) e ON e.student_id = s.id
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     WHERE s.is_active = 1
     ORDER BY s.id DESC`
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute(
    "SELECT * FROM students WHERE id = ? AND is_active = 1",
    [id]
  );
  return rows[0] || null;
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
  const attendanceRate = att.total > 0
    ? Number(((att.present_count / att.total) * 100).toFixed(2))
    : 100;

  // Results
  const [resultRows] = await pool.execute(
    "SELECT * FROM result_cards WHERE student_id = ? ORDER BY created_at DESC",
    [id]
  );

  // Fees
  const [feeRows] = await pool.execute(
    "SELECT * FROM fee_ledgers WHERE student_id = ? ORDER BY due_date DESC",
    [id]
  );
  const fees = feeRows.map((f) => ({
    ...f,
    remaining_amount: Number((f.amount_due - f.amount_paid).toFixed(2)),
  }));

  return {
    ...student,
    enrollment,
    attendance_rate: attendanceRate,
    results: resultRows,
    fees,
  };
}

const STUDENT_FIELDS = ["first_name", "last_name", "roll_number", "date_of_birth", "guardian_name", "guardian_phone", "guardian_email", "status"];

async function assertRollAvailable(conn, rollNumber, exceptId = 0) {
  if (!rollNumber) return;
  const [dup] = await conn.execute("SELECT id FROM students WHERE roll_number = ? AND id != ?", [rollNumber, exceptId]);
  if (dup.length > 0) throw createError(409, "Roll number already exists", "DUPLICATE_ROLL");
}

/** Make `classroomId` the student's only active class (reusing an old enrollment row if one exists). */
async function setActiveClass(conn, studentId, classroomId) {
  const [rooms] = await conn.execute("SELECT id FROM classrooms WHERE id = ? AND is_active = 1", [classroomId]);
  if (!rooms.length) throw createError(400, "Class not found", "CLASS_NOT_FOUND");

  await conn.execute(
    "UPDATE enrollments SET is_active = 0, end_date = COALESCE(end_date, ?) WHERE student_id = ? AND classroom_id != ? AND is_active = 1",
    [schoolToday(), studentId, classroomId]
  );
  const [existing] = await conn.execute("SELECT id FROM enrollments WHERE student_id = ? AND classroom_id = ?", [studentId, classroomId]);
  if (existing.length) {
    await conn.execute("UPDATE enrollments SET is_active = 1, end_date = NULL WHERE id = ?", [existing[0].id]);
  } else {
    await conn.execute("INSERT INTO enrollments (student_id, classroom_id, start_date) VALUES (?, ?, ?)", [studentId, classroomId, schoolToday()]);
  }
}

async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Create a student and (optionally) enroll them in `classroom_id`, atomically. */
export async function create(data) {
  const id = await inTransaction(async (conn) => {
    await assertRollAvailable(conn, data.roll_number);
    const [result] = await conn.execute(
      "INSERT INTO students (first_name, last_name, roll_number, date_of_birth, guardian_name, guardian_phone, guardian_email) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [data.first_name, data.last_name, data.roll_number || null, data.date_of_birth || null, data.guardian_name || null, data.guardian_phone || null, data.guardian_email || null]
    );
    if (data.classroom_id) await setActiveClass(conn, result.insertId, data.classroom_id);
    return result.insertId;
  });
  return getById(id);
}

/** Update student fields and (optionally) move them to `classroom_id`, atomically. */
export async function update(id, data) {
  if (!(await getById(id))) return null;
  await inTransaction(async (conn) => {
    await assertRollAvailable(conn, data.roll_number, id);
    const keys = STUDENT_FIELDS.filter((key) => data[key] !== undefined);
    if (keys.length) {
      await conn.execute(
        `UPDATE students SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
        [...keys.map((k) => data[k]), id]
      );
    }
    if (data.classroom_id) await setActiveClass(conn, id, data.classroom_id);
  });
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE students SET is_active = 0 WHERE id = ?", [id]);
}
