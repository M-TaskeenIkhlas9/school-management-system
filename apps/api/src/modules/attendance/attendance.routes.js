import { Router } from "express";
import { z } from "zod";
import * as attendanceService from "./attendance.service.js";
import validate, { idParam, requiredId, optionalDate } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const status = z.enum(["present", "absent", "late"]);

const createAttendanceSchema = z.object({
  student_id: requiredId(),
  classroom_id: requiredId(),
  day: optionalDate(),
  status: status.optional(),
});

const updateAttendanceSchema = z.object({
  day: optionalDate(),
  status: status.optional(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await attendanceService.getAll());
});

router.post("/", validate(createAttendanceSchema), async (req, res) => {
  const row = await attendanceService.create({ ...req.body, marked_by: req.user?.id ?? null });
  res.status(201).json(row);
});

router.put("/:id", validate(updateAttendanceSchema), async (req, res) => {
  const row = await attendanceService.update(idParam(req), req.body);
  if (!row) throw createError(404, "Attendance record not found", "NOT_FOUND");
  res.json(row);
});

export default router;
