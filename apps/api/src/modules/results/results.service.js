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
export async function list({ student_id, classroom_id, term, classIds = null, ...page }) {
  const where = whereClause([
    ["r.student_id = ?", student_id],
    ["r.classroom_id = ?", classroom_id],
    ["r.term = ?", term],
    ["r.classroom_id IN (?)", classIds],
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

/**
 * Averages for reporting: overall, per class and term, grade spread, and the lowest results.
 * Limited to `classIds` when given.
 */
export async function summary({ classIds = null, classroom_id, term } = {}) {
  const where = whereClause([
    ["r.classroom_id IN (?)", classIds],
    ["r.classroom_id = ?", classroom_id],
    ["r.term = ?", term],
  ]);
  const [[overall]] = await pool.query(
    `SELECT COUNT(*) AS results, ROUND(AVG(r.percentage), 1) AS average FROM result_cards r ${where.sql}`,
    where.params
  );
  const [byClassTerm] = await pool.query(
    `SELECT c.name AS class_name, r.term, COUNT(*) AS results, ROUND(AVG(r.percentage), 1) AS average
     FROM result_cards r JOIN classrooms c ON c.id = r.classroom_id ${where.sql}
     GROUP BY c.name, r.term ORDER BY c.name, MIN(r.created_at)`,
    where.params
  );
  const [grades] = await pool.query(
    `SELECT r.grade, COUNT(*) AS count FROM result_cards r ${where.sql} GROUP BY r.grade ORDER BY r.grade`,
    where.params
  );
  const [lowest] = await pool.query(
    `SELECT CONCAT(s.first_name, ' ', s.last_name) AS student, c.name AS class_name, r.term, r.percentage, r.grade
     FROM result_cards r JOIN students s ON s.id = r.student_id JOIN classrooms c ON c.id = r.classroom_id
     ${where.sql} ORDER BY r.percentage ASC LIMIT 10`,
    where.params
  );
  const num = (v) => (v === null ? null : Number(v));
  return {
    results: Number(overall.results),
    average: num(overall.average),
    by_class_and_term: byClassTerm.map((r) => ({ ...r, results: Number(r.results), average: num(r.average) })),
    grade_distribution: grades.map((g) => ({ grade: g.grade, count: Number(g.count) })),
    lowest: lowest.map((r) => ({ ...r, percentage: num(r.percentage) })),
  };
}
