import pool from "../../db/pool.js";
import * as aiService from "../ai/ai.service.js";

export async function getAll({ classIds = null } = {}) {
  if (classIds && !classIds.length) return [];
  const [rows] = await pool.query(
    `SELECT e.*, c.name as class_name,
            (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.id) as question_count
     FROM exams e
     JOIN classrooms c ON c.id = e.classroom_id
     ${classIds ? "WHERE e.classroom_id IN (?)" : ""}
     ORDER BY e.id DESC`,
    classIds ? [classIds] : []
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM exams WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const [questions] = await pool.execute("SELECT id, question, marks FROM exam_questions WHERE exam_id = ?", [id]);
  return { ...rows[0], questions };
}

export async function createWithQuestions({
  classroom_id,
  subject,
  title,
  prompt,
  type,
  total_marks,
  created_by_ai,
  ai_prompt_used,
  ai_generated_content,
  questions,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [examResult] = await conn.execute(
      `INSERT INTO exams (classroom_id, subject, title, prompt, type, total_marks, created_by_ai, ai_prompt_used, ai_generated_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classroom_id,
        subject,
        title || `${subject} Test`,
        prompt,
        type || "Test",
        total_marks || 50,
        created_by_ai ? 1 : 0,
        ai_prompt_used || null,
        ai_generated_content ? JSON.stringify(ai_generated_content) : null,
      ]
    );
    const examId = examResult.insertId;

    for (const q of questions) {
      await conn.execute("INSERT INTO exam_questions (exam_id, question, marks) VALUES (?, ?, ?)", [
        examId,
        q.question || q,
        q.marks || 5,
      ]);
    }

    await conn.commit();

    const [exam] = await pool.execute("SELECT * FROM exams WHERE id = ?", [examId]);
    const [examQuestions] = await pool.execute("SELECT id, question, marks FROM exam_questions WHERE exam_id = ?", [
      examId,
    ]);
    return { ...exam[0], questions: examQuestions };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Generate questions with AI (using the class curriculum as context) and save the exam. */
export async function generateWithAi({ classroom_id, subject, prompt, num_questions, type, total_marks }) {
  const [curriculum] = await pool.execute(
    "SELECT topics FROM curriculum_items WHERE classroom_id = ? AND subject = ? LIMIT 1",
    [classroom_id, subject]
  );
  const questions = await aiService.generateExamQuestions({
    subject,
    topics: curriculum[0]?.topics || prompt,
    prompt,
    num_questions: num_questions || 5,
  });
  return createWithQuestions({
    classroom_id,
    subject,
    title: `${subject} Test`,
    prompt,
    type: type || "Test",
    total_marks: total_marks || questions.reduce((sum, q) => sum + (q.marks || 5), 0),
    created_by_ai: true,
    ai_prompt_used: prompt,
    ai_generated_content: { questions },
    questions,
  });
}
