import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";

export async function getAll() {
  const [rows] = await pool.execute("SELECT * FROM teachers WHERE is_active = 1 ORDER BY id DESC");
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM teachers WHERE id = ? AND is_active = 1", [id]);
  return rows[0] || null;
}

export async function create({ first_name, last_name, subject, phone, email, joining_date }) {
  const [result] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name, subject, phone, email, joining_date) VALUES (?, ?, ?, ?, ?, ?)",
    [first_name, last_name, subject || null, phone || null, email || null, joining_date || null]
  );
  return await getById(result.insertId);
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["first_name", "last_name", "subject", "phone", "email", "joining_date"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE teachers SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE teachers SET is_active = 0 WHERE id = ?", [id]);
}

export async function getClassIds(teacherId) {
  const [rows] = await pool.execute(
    "SELECT classroom_id FROM teacher_classes WHERE teacher_id = ? ORDER BY classroom_id",
    [teacherId]
  );
  return rows.map((r) => r.classroom_id);
}

/** Replace the set of classes a teacher is assigned to (atomically). */
export async function setClasses(teacherId, classroomIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM teacher_classes WHERE teacher_id = ?", [teacherId]);
    for (const classroomId of new Set(classroomIds)) {
      await conn.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [
        teacherId,
        classroomId,
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_NO_REFERENCED_ROW_2")
      throw createError(400, "One of those classes does not exist", "CLASS_NOT_FOUND");
    throw err;
  } finally {
    conn.release();
  }
  return getClassIds(teacherId);
}
