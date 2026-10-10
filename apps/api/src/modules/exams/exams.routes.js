import { Router } from "express";
import { z } from "zod";
import * as examService from "./exams.service.js";
import validate, { idParam, requiredId, requiredText, optionalNumber } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertClassAccess, classScope } from "../../middleware/access.js";

const generateExamSchema = z.object({
  classroom_id: requiredId(),
  subject: requiredText(100),
  prompt: requiredText(4000),
  num_questions: optionalNumber(),
  type: z.enum(["Test", "Midterm", "Final"]).optional(),
  total_marks: optionalNumber(),
});

const router = Router();

router.get("/", async (req, res) => {
  res.json(await examService.getAll({ classIds: classScope(req) }));
});

router.get("/:id", async (req, res) => {
  const exam = await examService.getById(idParam(req));
  if (!exam) throw createError(404, "Exam not found", "NOT_FOUND");
  assertClassAccess(req, exam.classroom_id);
  res.json(exam);
});

// AI-powered exam generation (also mounted at /ai/exams/generate)
router.post("/generate", validate(generateExamSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  res.status(201).json(await examService.generateWithAi(req.body));
});

export default router;
