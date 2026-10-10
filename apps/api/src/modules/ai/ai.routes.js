import { Router } from "express";
import * as aiService from "./ai.service.js";
import * as studentService from "../students/students.service.js";
import * as attendanceService from "../attendance/attendance.service.js";

const router = Router();

// Students needing attention (backward compatible)
router.get("/students/attention", async (_req, res, next) => {
  try {
    res.json(await aiService.getStudentsNeedingAttention());
  } catch (err) { next(err); }
});

// AI insights (fee defaulters, low attendance, low scores)
router.get("/insights", async (_req, res, next) => {
  try {
    const insights = await aiService.generateInsights();
    res.json(insights);
  } catch (err) { next(err); }
});

// Per-student AI summary
router.get("/students/:id/summary", async (req, res, next) => {
  try {
    const profile = await studentService.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: "Student not found" });

    const attendanceRate = profile.attendance_rate;
    const scores = profile.results.map((r) => Number(r.percentage));
    const averageScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const feeStatus = profile.fees.some((f) => f.status !== "paid") ? "Pending" : "Clear";

    const summary = await aiService.generateStudentSummary({
      studentName: `${profile.first_name} ${profile.last_name}`,
      attendanceRate,
      averageScore: Number(averageScore.toFixed(2)),
      feeStatus,
    });

    res.json({ student_id: profile.id, summary });
  } catch (err) { next(err); }
});

export default router;
