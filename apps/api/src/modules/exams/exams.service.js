import pool from "../../db/pool.js";

export async function getAll() {
  const [rows] = await pool.execute(
    `SELECT e.*, c.name as class_name,
            (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.id) as question_count
     FROM exams e
     JOIN classrooms c ON c.id = e.classroom_id
     ORDER BY e.id DESC`
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM exams WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const [questions] = await pool.execute(
    "SELECT id, question, marks FROM exam_questions WHERE exam_id = ?",
    [id]
  );
  return { ...rows[0], questions };
}

export async function createWithQuestions({ classroom_id, subject, title, prompt, type, total_marks, created_by_ai, ai_prompt_used, ai_generated_content, questions }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [examResult] = await conn.execute(
      `INSERT INTO exams (classroom_id, subject, title, prompt, type, total_marks, created_by_ai, ai_prompt_used, ai_generated_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classroom_id, subject, title || `${subject} Test`, prompt,
        type || "Test", total_marks || 50,
        created_by_ai ? 1 : 0,
        ai_prompt_used || null,
        ai_generated_content ? JSON.stringify(ai_generated_content) : null,
      ]
    );
    const examId = examResult.insertId;

    for (const q of questions) {
      await conn.execute(
        "INSERT INTO exam_questions (exam_id, question, marks) VALUES (?, ?, ?)",
        [examId, q.question || q, q.marks || 5]
      );
    }

    await conn.commit();

    const [exam] = await pool.execute("SELECT * FROM exams WHERE id = ?", [examId]);
    const [examQuestions] = await pool.execute(
      "SELECT id, question, marks FROM exam_questions WHERE exam_id = ?",
      [examId]
    );
    return { ...exam[0], questions: examQuestions };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
