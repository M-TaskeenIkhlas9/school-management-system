import { Router } from "express";
import { z } from "zod";
import * as studentService from "./students.service.js";
import { audit } from "../../lib/audit.js";
import * as classroomService from "../classrooms/classrooms.service.js";
import validate, {
  idParam,
  requiredText,
  optionalText,
  optionalDate,
  optionalEmail,
  optionalId,
} from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertStudentAccess, classScope } from "../../middleware/access.js";
import { redactStudent } from "./students.redact.js";

// CNIC / B-Form: 13 digits, stored as NADRA prints them (12345-1234567-1).
const nadraNumber = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).replace(/[\s-]/g, "")),
    z
      .string()
      .regex(/^\d{13}$/, "must be 13 digits, e.g. 35202-1234567-1")
      .transform((d) => `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`)
      .nullish()
  );

const studentSchema = z.object({
  first_name: requiredText(100),
  last_name: requiredText(100),
  roll_number: optionalText(50),
  gr_number: optionalText(30), // left empty, the next number in the register is given
  admission_date: optionalDate(),
  date_of_birth: optionalDate(),
  gender: z.preprocess((v) => (v === "" ? null : v), z.enum(["male", "female"]).nullish()),
  b_form: nadraNumber(),
  father_name: optionalText(150),
  father_cnic: nadraNumber(),
  religion: optionalText(50),
  address: optionalText(255),
  previous_school: optionalText(150),
  guardian_name: optionalText(200),
  guardian_phone: optionalText(30),
  guardian_email: optionalEmail(),
  status: z.enum(["active", "inactive"]).optional(),
  classroom_id: optionalId(), // enroll / move class in the same transaction
});

const router = Router();

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

// Add many students at once (rows read from an Excel/CSV sheet). The class is matched by name.
// Each row is added on its own; rows that can't be added are reported with the reason.
const importSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "The sheet has no rows")
    .max(2000, "Import at most 2000 students at a time"),
});

router.post("/import", validate(importSchema), async (req, res) => {
  const classrooms = await classroomService.getAll({});
  const byName = new Map();
  for (const c of classrooms) {
    byName.set(c.name.trim().toLowerCase(), c.id);
    if (c.section) byName.set(`${c.name} ${c.section}`.trim().toLowerCase(), c.id);
  }
  const results = [];
  for (const [index, raw] of req.body.rows.entries()) {
    const row = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v === null ? undefined : v])
    );
    const className = String(row.class ?? row.class_name ?? "").trim();
    const classroomId = className ? byName.get(className.toLowerCase()) : undefined;
    if (className && !classroomId) {
      results.push({ row: index + 2, ok: false, error: `No class called "${className}"` });
      continue;
    }
    const parsed = studentSchema.safeParse({ ...row, classroom_id: classroomId });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      results.push({ row: index + 2, ok: false, error: `${first.path.join(".") || "row"}: ${first.message}` });
      continue;
    }
    try {
      const student = await studentService.create(parsed.data);
      results.push({ row: index + 2, ok: true, id: student.id });
    } catch (err) {
      if (!err.status || err.status >= 500) throw err;
      results.push({ row: index + 2, ok: false, error: err.message });
    }
  }
  const added = results.filter((r) => r.ok).length;
  await audit(req, "students.import", { details: { added, failed: results.length - added } });
  res.status(added ? 201 : 400).json({ added, failed: results.length - added, results });
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
