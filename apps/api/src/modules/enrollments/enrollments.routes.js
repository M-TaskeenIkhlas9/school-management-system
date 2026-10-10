import { Router } from "express";
import { z } from "zod";
import * as enrollmentService from "./enrollments.service.js";
import validate, { idParam, requiredId, optionalDate } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { classScope } from "../../middleware/access.js";

const enrollmentSchema = z.object({
  student_id: requiredId(),
  classroom_id: requiredId(),
  start_date: optionalDate(),
  end_date: optionalDate(),
  is_active: z.boolean().optional(),
});

const router = Router();

router.get("/", async (req, res) => {
  res.json(await enrollmentService.getAll({ classIds: classScope(req) }));
});

router.post("/", validate(enrollmentSchema), async (req, res) => {
  res.status(201).json(await enrollmentService.create(req.body));
});

router.put("/:id", validate(enrollmentSchema.partial()), async (req, res) => {
  const enrollment = await enrollmentService.update(idParam(req), req.body);
  if (!enrollment) throw createError(404, "Enrollment not found", "NOT_FOUND");
  res.json(enrollment);
});

export default router;
