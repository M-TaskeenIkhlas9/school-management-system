import pool from "../../db/pool.js";
import { pageResult, pageWindow, whereClause } from "../../lib/pagination.js";

export function calcGrade(percentage) {
  const p = Number(percentage);
  if (p >= 90) return "A+";
  if (p >= 80) return "A";
  if (p >= 70) return "B";
  if (p >= 60) return "C";
  if (p >= 50) return "D";
  return "F";
}

/** One page of result cards (newest first) with student and class names. */
export async function list({ student_id, classroom_id, term, ...page }) {
  const where = whereClause([
    ["r.student_id = ?", student_id],
    ["r.classroom_id = ?", classroom_id],
    ["r.term = ?", term],
  ]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM result_cards r ${where.sql}`, where.params);
  const { limit, offset } = pageWindow(page);
  const [rows] = await pool.query(
    `SELECT r.*, CONCAT(s.first_name, ' ', s.last_name) AS student_name, c.name AS class_name
     FROM result_cards r
     JOIN students s ON s.id = r.student_id
     JOIN classrooms c ON c.id = r.classroom_id
     ${where.sql}
     ORDER BY r.id DESC
     LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  return pageResult(rows, total, page);
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM result_cards WHERE id = ?", [id]);
  return rows[0] || null;
}

export async function create({ student_id, classroom_id, term, total_score, percentage, remarks, ai_remarks }) {
  const grade = calcGrade(percentage);
  const [result] = await pool.execute(
    "INSERT INTO result_cards (student_id, classroom_id, term, total_score, percentage, grade, remarks, ai_remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [student_id, classroom_id, term, total_score, percentage, grade, remarks || null, ai_remarks || null]
  );
  return await getById(result.insertId);
}

export async function generateBatch({ classroom_id, term, results }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const created = [];
    for (const item of results) {
      const grade = calcGrade(item.percentage);
      const [result] = await conn.execute(
        "INSERT INTO result_cards (student_id, classroom_id, term, total_score, percentage, grade, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [item.student_id, classroom_id, term, item.total_score, item.percentage, grade, item.remarks || null]
      );
      const [rows] = await conn.execute("SELECT * FROM result_cards WHERE id = ?", [result.insertId]);
      created.push(rows[0]);
    }
    await conn.commit();
    return created;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
