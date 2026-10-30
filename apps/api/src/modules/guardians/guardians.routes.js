import { Router } from "express";
import { z } from "zod";
import * as guardianService from "./guardians.service.js";
import validate, {
  idParam,
  parseQuery,
  requiredId,
  requiredText,
  optionalText,
  optionalEmail,
  optionalLongText,
  messageLanguage,
} from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertStudentAccess, classScope } from "../../middleware/access.js";
import { pageParams } from "../../lib/pagination.js";
import pool from "../../db/pool.js";

const guardianSchema = z.object({
  full_name: requiredText(200),
  email: optionalEmail(),
  phone: optionalText(30),
  preferred_channel: z.enum(["whatsapp", "sms", "email"]).optional(),
  language: messageLanguage(), // en | ur; empty: the school's default
  consent_whatsapp: z.boolean().optional(),
  consent_sms: z.boolean().optional(),
  consent_email: z.boolean().optional(),
  notes: optionalLongText(),
});

const linkSchema = z.object({
  student_id: requiredId(),
  relationship: optionalText(50),
  is_primary: z.boolean().optional(),
});

const router = Router();

// GET /guardians?q=&page=&pageSize=
router.get("/", async (req, res) => {
  const query = parseQuery(z.object({ ...pageParams, q: optionalText(100) }), req.query);
  res.json(await guardianService.list({ ...query, classIds: classScope(req) }));
});

router.get("/:id", async (req, res) => {
  const id = idParam(req);
  const guardian = await guardianService.getById(id);
  if (!guardian || !(await guardianService.isVisible(id, classScope(req)))) {
    throw createError(404, "Guardian not found", "NOT_FOUND");
  }
  res.json(guardian);
});

router.post("/", validate(guardianSchema), async (req, res) => {
  const id = await guardianService.create(req.body);
  res.status(201).json(await guardianService.getById(id));
});

router.put("/:id", validate(guardianSchema.partial()), async (req, res) => {
  const id = idParam(req);
  if (!(await guardianService.getById(id))) throw createError(404, "Guardian not found", "NOT_FOUND");
  res.json(await guardianService.update(id, req.body));
});

// Link this guardian to a student (e.g. a second child, or a second parent for a child).
router.post("/:id/students", validate(linkSchema), async (req, res) => {
  const id = idParam(req);
  if (!(await guardianService.getById(id))) throw createError(404, "Guardian not found", "NOT_FOUND");
  await assertStudentAccess(req, req.body.student_id);
  await guardianService.link(pool, req.body.student_id, id, {
    relationship: req.body.relationship,
    isPrimary: req.body.is_primary,
  });
  res.status(201).json(await guardianService.getById(id));
});

router.delete("/:id/students/:studentId", async (req, res) => {
  await guardianService.unlink(idParam(req, "studentId"), idParam(req));
  res.json({ success: true });
});

export default router;
