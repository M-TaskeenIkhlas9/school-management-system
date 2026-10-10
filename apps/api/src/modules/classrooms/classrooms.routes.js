import { Router } from "express";
import { z } from "zod";
import * as classroomService from "./classrooms.service.js";
import validate, { idParam, requiredText, optionalText } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const classroomSchema = z.object({
  name: requiredText(100),
  grade: requiredText(20),
  section: optionalText(20),
  academic_year: optionalText(20),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await classroomService.getAll());
});

router.get("/:id", async (req, res) => {
  const classroom = await classroomService.getById(idParam(req));
  if (!classroom) throw createError(404, "Classroom not found", "NOT_FOUND");
  res.json(classroom);
});

router.post("/", validate(classroomSchema), async (req, res) => {
  res.status(201).json(await classroomService.create(req.body));
});

router.put("/:id", validate(classroomSchema.partial()), async (req, res) => {
  const classroom = await classroomService.update(idParam(req), req.body);
  if (!classroom) throw createError(404, "Classroom not found", "NOT_FOUND");
  res.json(classroom);
});

router.delete("/:id", async (req, res) => {
  await classroomService.remove(idParam(req));
  res.json({ success: true });
});

export default router;
