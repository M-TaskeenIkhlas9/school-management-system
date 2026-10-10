import pool from "../../db/pool.js";

import { schoolToday as today } from "../../config/env.js";

export async function getAll() {
  const [rows] = await pool.execute("SELECT * FROM attendance ORDER BY id DESC");
  return rows;
}

export async function create({ student_id, classroom_id, day, status, marked_by }) {
  try {
    const [result] = await pool.execute(
      "INSERT INTO attendance (student_id, classroom_id, day, status, marked_by) VALUES (?, ?, ?, ?, ?)",
      [student_id, classroom_id, day || today(), status || "present", marked_by || null]
    );
    const [rows] = await pool.execute("SELECT * FROM attendance WHERE id = ?", [result.insertId]);
    return rows[0];
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const e = new Error("Attendance already recorded for this student on this date");
      e.status = 409;
      e.code = "DUPLICATE_ATTENDANCE";
      throw e;
    }
    throw err;
  }
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["status", "day"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await pool.execute(`UPDATE attendance SET ${fields.join(", ")} WHERE id = ?`, values);
  const [rows] = await pool.execute("SELECT * FROM attendance WHERE id = ?", [id]);
  return rows[0];
}

export async function getStudentRate(studentId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as present_count
     FROM attendance WHERE student_id = ?`,
    [studentId]
  );
  const r = rows[0];
  return r.total > 0 ? Number(((r.present_count / r.total) * 100).toFixed(2)) : 100;
}

/**
 * Students whose most recent `days` attendance records are all "absent"
 * (a true consecutive streak over recorded school days, not a date window).
 */
export async function getConsecutiveAbsent(days = 3) {
  const [rows] = await pool.execute(
    "SELECT student_id, day, status FROM attendance ORDER BY student_id, day DESC"
  );
  const streaks = new Map();
  const broken = new Set();
  for (const row of rows) {
    if (broken.has(row.student_id)) continue;
    if (row.status === "absent") {
      streaks.set(row.student_id, (streaks.get(row.student_id) || 0) + 1);
    } else {
      broken.add(row.student_id);
    }
  }
  return [...streaks.entries()]
    .filter(([, streak]) => streak >= days)
    .map(([student_id, absent_streak]) => ({ student_id, absent_streak }));
}
