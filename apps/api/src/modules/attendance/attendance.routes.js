import { Router } from "express";
import { z } from "zod";
import * as attendanceService from "./attendance.service.js";
import validate, { idParam, parseQuery, requiredId, optionalDate, optionalId } from "../../middleware/validate.js";
import { pageParams } from "../../lib/pagination.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertClassAccess, assertStudentInClass, classScope } from "../../middleware/access.js";

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

const listQuery = z.object({
  ...pageParams,
  student_id: optionalId(),
  classroom_id: optionalId(),
  status: status.optional(),
  from: optionalDate(),
  to: optionalDate(),
});

const router = Router();

// GET /attendance?page=&pageSize=&student_id=&classroom_id=&status=&from=&to=
router.get("/", async (req, res) => {
  res.json(await attendanceService.list({ ...parseQuery(listQuery, req.query), classIds: classScope(req) }));
});

router.get("/summary", async (req, res) => {
  res.json(await attendanceService.summary({ classIds: classScope(req) }));
});

router.post("/", validate(createAttendanceSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  await assertStudentInClass(req.body.student_id, req.body.classroom_id);
  const row = await attendanceService.create({ ...req.body, marked_by: req.user.id });
  res.status(201).json(row);
});

router.put("/:id", validate(updateAttendanceSchema), async (req, res) => {
  const id = idParam(req);
  const existing = await attendanceService.getById(id);
  if (!existing) throw createError(404, "Attendance record not found", "NOT_FOUND");
  assertClassAccess(req, existing.classroom_id);
  res.json(await attendanceService.update(id, req.body));
});

export default router;
