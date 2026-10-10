import { Router } from "express";
import * as examService from "../services/examService.js";
import * as aiService from "../services/aiService.js";
import pool from "../db.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await examService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const exam = await examService.getById(Number(req.params.id));
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (err) { next(err); }
});

// AI-powered exam generation
router.post(
  "/generate",
  validate({
    classroom_id: { required: true, type: "number" },
    subject: { required: true, type: "string" },
    prompt: { required: true, type: "string" },
  }),
  async (req, res, next) => {
    try {
      const { classroom_id, subject, prompt, num_questions, type, total_marks } = req.body;

      // Fetch curriculum topics for context
      const [curriculum] = await pool.execute(
        "SELECT topics, learning_objectives FROM curriculum_items WHERE classroom_id = ? AND subject = ?",
        [classroom_id, subject]
      );
      const topics = curriculum[0]?.topics || prompt;

      const questions = await aiService.generateExamQuestions({
        subject,
        topics,
        prompt,
        num_questions: num_questions || 5,
      });

      const exam = await examService.createWithQuestions({
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

      res.status(201).json(exam);
    } catch (err) { next(err); }
  }
);

export default router;
