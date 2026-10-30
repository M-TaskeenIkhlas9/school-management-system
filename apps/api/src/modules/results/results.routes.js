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
import * as sheetService from "./sheet.service.js";
import * as remarksService from "./remarks.service.js";
import { agentLimiter } from "../../middleware/rateLimit.js";
import { audit } from "../../lib/audit.js";

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

const sheetQuery = z.object({ classroom_id: requiredId(), term: requiredText(50) });
const sheetSchema = z.object({
  classroom_id: requiredId(),
  term: requiredText(50),
  subjects: z
    .array(z.object({ name: requiredText(100), total: z.coerce.number().positive().max(1000) }))
    .min(1, "Add at least one subject")
    .max(20),
  rows: z
    .array(
      z.object({
        student_id: requiredId(),
        marks: z.record(z.string(), z.union([z.null(), z.literal(""), z.coerce.number().min(0)])),
      })
    )
    .max(500),
});

const remarksDraftSchema = z.object({
  classroom_id: requiredId(),
  term: requiredText(50),
  language: z.enum(["en", "ur"]).default("en"),
  result_ids: z.array(requiredId()).max(500).optional(),
});
const remarksSchema = z.object({
  classroom_id: requiredId(),
  term: requiredText(50),
  items: z
    .array(z.object({ result_id: requiredId(), remarks: optionalText(500), ai_draft: optionalText(500) }))
    .min(1, "No remarks to save")
    .max(500),
});

const router = Router();

// GET /results?page=&pageSize=&student_id=&classroom_id=&term=
router.get("/", async (req, res) => {
  res.json(await resultService.list({ ...parseQuery(listQuery, req.query), classIds: classScope(req) }));
});

// The class award list for a term: subjects and each student's marks so far.
router.get("/sheet", async (req, res) => {
  const { classroom_id, term } = parseQuery(sheetQuery, req.query);
  assertClassAccess(req, classroom_id);
  res.json(await sheetService.getSheet(classroom_id, term));
});

// Save the award list; each student's card for the term is created or replaced.
router.post("/sheet", validate(sheetSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  res.json(await sheetService.saveSheet(req.body));
});

// Report-card remarks for a class and term: each result with the figures a remark is written from.
router.get("/remarks", async (req, res) => {
  const { classroom_id, term } = parseQuery(sheetQuery, req.query);
  assertClassAccess(req, classroom_id);
  res.json(await remarksService.classRemarks(classroom_id, term));
});

// Draft remarks (English or Urdu) with the AI, or from the figures when no AI is set up. Nothing is saved.
router.post("/remarks/draft", agentLimiter, validate(remarksDraftSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  res.json(await remarksService.draftRemarks(req.body));
});

// Save the remarks the teacher approved.
router.put("/remarks", validate(remarksSchema), async (req, res) => {
  assertClassAccess(req, req.body.classroom_id);
  const result = await remarksService.saveRemarks(req.body);
  await audit(req, "results.remarks", {
    entityType: "classroom",
    entityId: req.body.classroom_id,
    details: { term: req.body.term, saved: result.saved, ai_drafted: req.body.items.filter((i) => i.ai_draft).length },
  });
  res.json(result);
});

// A printable report card: subjects, total, percentage, grade, position in class, attendance.
router.get("/:id/report-card", async (req, res) => {
  const card = await sheetService.reportCard(idParam(req));
  if (!card) throw createError(404, "Result not found", "NOT_FOUND");
  assertClassAccess(req, card.classroom_id);
  res.json(card);
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
