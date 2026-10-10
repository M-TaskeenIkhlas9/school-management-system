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

router.get("/", async (_req, res) => {
  res.json(await studentService.getAll());
});

router.get("/:id", async (req, res) => {
  const profile = await studentService.getProfile(idParam(req));
  if (!profile) throw createError(404, "Student not found", "NOT_FOUND");
  res.json(profile);
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
