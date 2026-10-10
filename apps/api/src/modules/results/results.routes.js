import { Router } from "express";
import { z } from "zod";
import * as resultService from "./results.service.js";
import validate, { idParam, requiredId, requiredText, optionalLongText } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const score = () => z.coerce.number().min(0);
const percentage = () => z.coerce.number().min(0).max(100);

const resultSchema = z.object({
  student_id: requiredId(),
  classroom_id: requiredId(),
  term: requiredText(50),
  total_score: score(),
  percentage: percentage(),
  remarks: optionalLongText(),
  ai_remarks: optionalLongText(),
});

const batchSchema = z.object({
  classroom_id: requiredId(),
  term: requiredText(50),
  results: z
    .array(z.object({ student_id: requiredId(), total_score: score(), percentage: percentage(), remarks: optionalLongText() }))
    .min(1, "No results provided"),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await resultService.getAll());
});

router.get("/:id", async (req, res) => {
  const result = await resultService.getById(idParam(req));
  if (!result) throw createError(404, "Result not found", "NOT_FOUND");
  res.json(result);
});

router.post("/", validate(resultSchema), async (req, res) => {
  res.status(201).json(await resultService.create(req.body));
});

router.post("/generate", validate(batchSchema), async (req, res) => {
  res.status(201).json(await resultService.generateBatch(req.body));
});

export default router;
