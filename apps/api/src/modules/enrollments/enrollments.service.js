import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";

export async function getAll() {
  const [rows] = await pool.execute(
    `SELECT e.*, s.first_name, s.last_name, c.name as class_name
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN classrooms c ON c.id = e.classroom_id
     ORDER BY e.id DESC`
  );
  return rows;
}

export async function create({ student_id, classroom_id, start_date, is_active }) {
  const today = schoolToday();
  try {
    const [result] = await pool.execute(
      "INSERT INTO enrollments (student_id, classroom_id, start_date, is_active) VALUES (?, ?, ?, ?)",
      [student_id, classroom_id, start_date || today, is_active !== undefined ? (is_active ? 1 : 0) : 1]
    );
    const [rows] = await pool.execute("SELECT * FROM enrollments WHERE id = ?", [result.insertId]);
    return rows[0];
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const e = new Error("Student is already enrolled in this class");
      e.status = 409;
      e.code = "DUPLICATE_ENROLLMENT";
      throw e;
    }
    throw err;
  }
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["classroom_id", "start_date", "end_date", "is_active"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === "is_active" ? (data[key] ? 1 : 0) : data[key]);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await pool.execute(`UPDATE enrollments SET ${fields.join(", ")} WHERE id = ?`, values);
  const [rows] = await pool.execute("SELECT * FROM enrollments WHERE id = ?", [id]);
  return rows[0];
}
