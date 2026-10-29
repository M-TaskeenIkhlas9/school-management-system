import { Router } from "express";
import { z } from "zod";
import * as resultService from "./results.service.js";
import validate, {
  idParam,
  parseQuery,
  requiredId,
  requiredText,
  optionalLongText,
  optionalId,
  optionalText,
} from "../../middleware/validate.js";
import { pageParams } from "../../lib/pagination.js";
import { createError } from "../../middleware/errorHandler.js";
import { assertClassAccess, assertStudentInClass, classScope } from "../../middleware/access.js";

const score = () => z.coerce.number().min(0);
const percentage = () => z.coerce.number().min(0).max(100);

const resultSchema = z.object({
  student_id: requiredId(),
  classroom_id: requiredId(),
  term: requiredText(50),
  total_score: score(),
  percentage: percentage(),
  remarks: optionalLongText(),
  ai_remarks: optionalLongText(),
});

const batchSchema = z.object({
  classroom_id: requiredId(),
  term: requiredText(50),
  results: z
    .array(
      z.object({
        student_id: requiredId(),
        total_score: score(),
        percentage: percentage(),
        remarks: optionalLongText(),
      })
    )
    .min(1, "No results provided"),
});

const listQuery = z.object({
  ...pageParams,
  student_id: optionalId(),
  classroom_id: optionalId(),
  term: optionalText(50),
});

const router = Router();

// GET /results?page=&pageSize=&student_id=&classroom_id=&term=
router.get("/", async (req, res) => {
  res.json(await resultService.list({ ...parseQuery(listQuery, req.query), classIds: classScope(req) }));
});

router.get("/:id", async (req, res) => {
  const result = await resultService.getById(idParam(req));
  if (!result) throw createError(404, "Result not found", "NOT_FOUND");
  assertClassAccess(req, result.classroom_id);
  res.json(result);
});

router.post("/", validate(resultSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  await assertStudentInClass(req.body.student_id, req.body.classroom_id);
  res.status(201).json(await resultService.create(req.body));
});

router.put(
  "/:id",
  validate(resultSchema.pick({ term: true, total_score: true, percentage: true, remarks: true }).partial()),
  async (req, res) => {
    const id = idParam(req);
    const existing = await resultService.getById(id);
    if (!existing) throw createError(404, "Result not found", "NOT_FOUND");
    assertClassAccess(req, existing.classroom_id);
    res.json(await resultService.update(id, req.body));
  }
);

router.delete("/:id", async (req, res) => {
  const id = idParam(req);
  const existing = await resultService.getById(id);
  if (!existing) throw createError(404, "Result not found", "NOT_FOUND");
  assertClassAccess(req, existing.classroom_id);
  await resultService.remove(id);
  res.status(204).end();
});

router.post("/generate", validate(batchSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  for (const item of req.body.results) await assertStudentInClass(item.student_id, req.body.classroom_id);
  res.status(201).json(await resultService.generateBatch(req.body));
});

export default router;
