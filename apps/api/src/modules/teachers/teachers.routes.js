import { Router } from "express";
import { z } from "zod";
import * as teacherService from "./teachers.service.js";
import validate, {
  idParam,
  requiredText,
  optionalText,
  optionalDate,
  optionalEmail,
} from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { audit } from "../../lib/audit.js";

const teacherSchema = z.object({
  first_name: requiredText(100),
  last_name: requiredText(100),
  subject: optionalText(100),
  phone: optionalText(30),
  email: optionalEmail(),
  joining_date: optionalDate(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await teacherService.getAll());
});

router.get("/:id", async (req, res) => {
  const id = idParam(req);
  const teacher = await teacherService.getById(id);
  if (!teacher) throw createError(404, "Teacher not found", "NOT_FOUND");
  res.json({ ...teacher, classroom_ids: await teacherService.getClassIds(id) });
});

const classesSchema = z.object({ classroom_ids: z.array(z.coerce.number().int().positive()).max(100) });

// Replace the classes this teacher may access: { classroom_ids: [1, 2] }
router.put("/:id/classes", validate(classesSchema), async (req, res) => {
  const id = idParam(req);
  if (!(await teacherService.getById(id))) throw createError(404, "Teacher not found", "NOT_FOUND");
  const classroomIds = await teacherService.setClasses(id, req.body.classroom_ids);
  await audit(req, "teacher.classes.set", {
    entityType: "teacher",
    entityId: id,
    details: { classroom_ids: classroomIds },
  });
  res.json({ teacher_id: id, classroom_ids: classroomIds });
});

router.post("/", validate(teacherSchema), async (req, res) => {
  res.status(201).json(await teacherService.create(req.body));
});

router.put("/:id", validate(teacherSchema.partial()), async (req, res) => {
  const teacher = await teacherService.update(idParam(req), req.body);
  if (!teacher) throw createError(404, "Teacher not found", "NOT_FOUND");
  res.json(teacher);
});

router.delete("/:id", async (req, res) => {
  await teacherService.remove(idParam(req));
  res.json({ success: true });
});

export default router;
