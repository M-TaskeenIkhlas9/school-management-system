import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";

export async function getAll() {
  const [rows] = await pool.execute(
    "SELECT * FROM students WHERE is_active = 1 ORDER BY id DESC"
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

export async function create({ first_name, last_name, roll_number, date_of_birth, guardian_name, guardian_phone, guardian_email }) {
  if (roll_number) {
    const [dup] = await pool.execute("SELECT id FROM students WHERE roll_number = ?", [roll_number]);
    if (dup.length > 0) {
      throw createError(409, "Roll number already exists", "DUPLICATE_ROLL");
    }
  }
  const [result] = await pool.execute(
    "INSERT INTO students (first_name, last_name, roll_number, date_of_birth, guardian_name, guardian_phone, guardian_email) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [first_name, last_name, roll_number || null, date_of_birth || null, guardian_name || null, guardian_phone || null, guardian_email || null]
  );
  return (await getById(result.insertId));
}

export async function update(id, data) {
  if (data.roll_number) {
    const [dup] = await pool.execute("SELECT id FROM students WHERE roll_number = ? AND id != ?", [data.roll_number, id]);
    if (dup.length > 0) {
      throw createError(409, "Roll number already exists", "DUPLICATE_ROLL");
    }
  }
  const fields = [];
  const values = [];
  for (const key of ["first_name", "last_name", "roll_number", "date_of_birth", "guardian_name", "guardian_phone", "guardian_email", "status"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE students SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE students SET is_active = 0 WHERE id = ?", [id]);
}
