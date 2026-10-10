import { Router } from "express";
import { getPredictionForStudent, getPredictionForCustom } from "./predict.service.js";

const router = Router();

router.get("/explain/:studentId", async (req, res, next) => {
  try {
    const result = await getPredictionForStudent(Number(req.params.studentId));
    if (!result) return res.status(404).json({ error: "Student not found" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/explain/custom", async (req, res, next) => {
  try {
    const { attendance_rate, average_score, fee_status } = req.body;
    const result = await getPredictionForCustom({
      attendance_rate,
      average_score,
      fee_status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
