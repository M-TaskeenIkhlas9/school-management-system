import pool from "../../db/pool.js";

export function calcGrade(percentage) {
  const p = Number(percentage);
  if (p >= 90) return "A+";
  if (p >= 80) return "A";
  if (p >= 70) return "B";
  if (p >= 60) return "C";
  if (p >= 50) return "D";
  return "F";
}

export async function getAll() {
  const [rows] = await pool.execute("SELECT * FROM result_cards ORDER BY id DESC");
  return rows;
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
  return (await getById(result.insertId));
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
