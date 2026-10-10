import { Router } from "express";
import { z } from "zod";
import * as curriculumService from "./curriculum.service.js";
import validate, { idParam, requiredId, requiredText, optionalText, optionalLongText, optionalNumber } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const curriculumSchema = z.object({
  classroom_id: requiredId(),
  subject: requiredText(100),
  book_title: optionalText(255),
  topics: optionalLongText(),
  chapter_number: optionalNumber(),
  learning_objectives: optionalLongText(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await curriculumService.getAll());
});

router.get("/:id", async (req, res) => {
  const item = await curriculumService.getById(idParam(req));
  if (!item) throw createError(404, "Curriculum item not found", "NOT_FOUND");
  res.json(item);
});

router.post("/", validate(curriculumSchema), async (req, res) => {
  res.status(201).json(await curriculumService.create(req.body));
});

router.put("/:id", validate(curriculumSchema.partial()), async (req, res) => {
  const item = await curriculumService.update(idParam(req), req.body);
  if (!item) throw createError(404, "Curriculum item not found", "NOT_FOUND");
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  await curriculumService.remove(idParam(req));
  res.json({ success: true });
});

export default router;
