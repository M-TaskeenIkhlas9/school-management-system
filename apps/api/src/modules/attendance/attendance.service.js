import pool from "../../db/pool.js";

import { schoolToday as today } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { pageResult, pageWindow, whereClause } from "../../lib/pagination.js";

const attendedSql = "CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END";

/** One page of attendance records (newest day first) with student and class names. */
export async function list({ student_id, classroom_id, status, from, to, classIds = null, ...page }) {
  const where = whereClause([
    ["a.student_id = ?", student_id],
    ["a.classroom_id = ?", classroom_id],
    ["a.status = ?", status],
    ["a.day >= ?", from],
    ["a.day <= ?", to],
    ["a.classroom_id IN (?)", classIds],
  ]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM attendance a ${where.sql}`, where.params);
  const { limit, offset } = pageWindow(page);
  const [rows] = await pool.query(
    `SELECT a.*, CONCAT(s.first_name, ' ', s.last_name) AS student_name, c.name AS class_name
     FROM attendance a
     JOIN students s ON s.id = a.student_id
     JOIN classrooms c ON c.id = a.classroom_id
     ${where.sql}
     ORDER BY a.day DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  return pageResult(rows, total, page);
}

/** Aggregates for the attendance page: today's rate and the overall rate per class. */
export async function summary({ classIds = null } = {}) {
  const scope = whereClause([["a.classroom_id IN (?)", classIds]]);
  const andScope = scope.sql.replace(/^WHERE/, "AND");
  const [[todayRow]] = await pool.query(
    `SELECT COUNT(*) AS marked, AVG(${attendedSql}) AS rate FROM attendance a WHERE a.day = ? ${andScope}`,
    [today(), ...scope.params]
  );
  const [byClass] = await pool.query(
    `SELECT a.classroom_id, c.name AS class_name, COUNT(*) AS records, ROUND(AVG(${attendedSql}) * 100) AS rate
     FROM attendance a JOIN classrooms c ON c.id = a.classroom_id
     ${scope.sql}
     GROUP BY a.classroom_id, c.name
     ORDER BY rate DESC`,
    scope.params
  );
  return {
    today: { marked: Number(todayRow.marked), rate: todayRow.rate === null ? null : Math.round(todayRow.rate * 100) },
    by_class: byClass.map((r) => ({ ...r, rate: Number(r.rate), records: Number(r.records) })),
  };
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM attendance WHERE id = ?", [id]);
  return rows[0] || null;
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
      throw createError(409, "Attendance already recorded for this student on this date", "DUPLICATE_ATTENDANCE");
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
  const [rows] = await pool.execute("SELECT student_id, day, status FROM attendance ORDER BY student_id, day DESC");
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

/** A class register for one day: every enrolled student with their mark (null = not marked yet). */
export async function register(classroomId, day = today()) {
  const [rows] = await pool.query(
    `SELECT s.id AS student_id, CONCAT(s.first_name, ' ', s.last_name) AS student_name, s.roll_number,
            a.status, a.id AS attendance_id
     FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.is_active = 1
     LEFT JOIN attendance a ON a.student_id = s.id AND a.day = ?
     WHERE e.classroom_id = ? AND e.is_active = 1
     ORDER BY s.roll_number IS NULL, s.roll_number, s.first_name, s.last_name`,
    [day, classroomId]
  );
  return { classroom_id: classroomId, day, students: rows };
}

/**
 * Save a whole class register at once. Marking the same day again updates the marks (a teacher
 * correcting the register), so it never fails as a duplicate. Students not in the class are refused.
 */
export async function saveRegister({ classroom_id, day = today(), entries, marked_by }) {
  const [enrolled] = await pool.query("SELECT student_id FROM enrollments WHERE classroom_id = ? AND is_active = 1", [
    classroom_id,
  ]);
  const inClass = new Set(enrolled.map((r) => r.student_id));
  const outsiders = entries.filter((e) => !inClass.has(e.student_id));
  if (outsiders.length) {
    throw createError(400, "Some students are not in this class", "STUDENT_NOT_IN_CLASS");
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      await conn.execute(
        `INSERT INTO attendance (student_id, classroom_id, day, status, marked_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), classroom_id = VALUES(classroom_id), marked_by = VALUES(marked_by)`,
        [e.student_id, classroom_id, day, e.status, marked_by]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const counts = { present: 0, late: 0, absent: 0 };
  for (const e of entries) counts[e.status] += 1;
  return { classroom_id, day, saved: entries.length, ...counts };
}
