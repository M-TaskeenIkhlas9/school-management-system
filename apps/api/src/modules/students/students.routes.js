import { Router } from "express";
import { z } from "zod";
import * as studentService from "./students.service.js";
import validate, {
  idParam,
  requiredText,
  optionalText,
  optionalDate,
  optionalEmail,
  optionalId,
} from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertStudentAccess, classScope, hasPermission } from "../../middleware/access.js";

const studentSchema = z.object({
  first_name: requiredText(100),
  last_name: requiredText(100),
  roll_number: optionalText(50),
  date_of_birth: optionalDate(),
  guardian_name: optionalText(200),
  guardian_phone: optionalText(30),
  guardian_email: optionalEmail(),
  status: z.enum(["active", "inactive"]).optional(),
  classroom_id: optionalId(), // enroll / move class in the same transaction
});

const router = Router();

/** Remove data the caller may not see (e.g. fees for a teacher). */
function redactStudent(req, student) {
  const out = { ...student };
  if (!hasPermission(req, "fees:read")) {
    delete out.latest_fee_status;
    delete out.fees;
  }
  if (!hasPermission(req, "results:read")) delete out.results;
  if (!hasPermission(req, "attendance:read")) delete out.attendance_rate;
  return out;
}

router.get("/", async (req, res) => {
  const students = await studentService.getAll({ classIds: classScope(req) });
  res.json(students.map((s) => redactStudent(req, s)));
});

router.get("/:id", async (req, res) => {
  const id = idParam(req);
  await assertStudentAccess(req, id);
  const profile = await studentService.getProfile(id);
  if (!profile) throw createError(404, "Student not found", "NOT_FOUND");
  res.json(redactStudent(req, profile));
});

router.post("/", validate(studentSchema), async (req, res) => {
  res.status(201).json(await studentService.create(req.body));
});

router.put("/:id", validate(studentSchema.partial()), async (req, res) => {
  const student = await studentService.update(idParam(req), req.body);
  if (!student) throw createError(404, "Student not found", "NOT_FOUND");
  res.json(student);
});

router.delete("/:id", async (req, res) => {
  await studentService.remove(idParam(req));
  res.json({ success: true });
});

export default router;
