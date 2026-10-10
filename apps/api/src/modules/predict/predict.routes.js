import { Router } from "express";
import { z } from "zod";
import { getPredictionForStudent, getPredictionForCustom } from "./predict.service.js";
import validate, { idParam, optionalNumber, optionalText } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const customSchema = z.object({
  attendance_rate: optionalNumber(),
  average_score: optionalNumber(),
  fee_status: optionalText(50),
});

const router = Router();

router.get("/explain/:studentId", async (req, res) => {
  const result = await getPredictionForStudent(idParam(req, "studentId"));
  if (!result) throw createError(404, "Student not found", "NOT_FOUND");
  res.json(result);
});

router.post("/explain/custom", validate(customSchema), async (req, res) => {
  res.json(await getPredictionForCustom(req.body));
});

export default router;
