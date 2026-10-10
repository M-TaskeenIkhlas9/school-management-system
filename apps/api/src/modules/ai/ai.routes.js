import { Router } from "express";
import * as aiService from "./ai.service.js";
import * as studentService from "../students/students.service.js";
import { idParam } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const router = Router();

// Students needing attention (low attendance / low scores)
router.get("/students/attention", async (_req, res) => {
  res.json(await aiService.getStudentsNeedingAttention());
});

// Insights: fee defaulters, low attendance, low scores
router.get("/insights", async (_req, res) => {
  res.json(await aiService.generateInsights());
});

// Per-student AI summary
router.get("/students/:id/summary", async (req, res) => {
  const profile = await studentService.getProfile(idParam(req));
  if (!profile) throw createError(404, "Student not found", "NOT_FOUND");

  const scores = profile.results.map((r) => Number(r.percentage));
  const averageScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const summary = await aiService.generateStudentSummary({
    studentName: `${profile.first_name} ${profile.last_name}`,
    attendanceRate: profile.attendance_rate,
    averageScore: Number(averageScore.toFixed(2)),
    feeStatus: profile.fees.some((f) => f.status !== "paid") ? "Pending" : "Clear",
  });
  res.json({ student_id: profile.id, summary });
});

export default router;
