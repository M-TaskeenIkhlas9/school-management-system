import { Router } from "express";
import { z } from "zod";
import * as feeService from "./fees.service.js";
import validate, {
  idParam,
  parseQuery,
  requiredId,
  isoDate,
  optionalText,
  optionalDate,
  optionalId,
} from "../../middleware/validate.js";
import { pageParams } from "../../lib/pagination.js";
import { createError } from "../../middleware/errorHandler.js";

const money = () => z.coerce.number().min(0);
const optionalMoney = () => z.preprocess((v) => (v === "" || v === null ? undefined : v), money().optional());

const feeStatus = z.enum(["pending", "paid", "partial", "overdue"]);

const feeSchema = z.object({
  student_id: requiredId(),
  month: optionalText(7),
  due_date: isoDate(),
  amount_due: money(),
  amount_paid: optionalMoney(),
  status: feeStatus.optional(),
  paid_date: optionalDate(),
});

const listQuery = z.object({ ...pageParams, student_id: optionalId(), status: feeStatus.optional() });

const router = Router();

// GET /fees?page=&pageSize=&student_id=&status=
router.get("/", async (req, res) => {
  res.json(await feeService.list(parseQuery(listQuery, req.query)));
});

router.get("/defaulters", async (_req, res) => {
  res.json(await feeService.getDefaulters());
});

router.get("/:id", async (req, res) => {
  const fee = await feeService.getById(idParam(req));
  if (!fee) throw createError(404, "Fee record not found", "NOT_FOUND");
  res.json(fee);
});

router.post("/", validate(feeSchema), async (req, res) => {
  res.status(201).json(await feeService.create(req.body));
});

router.put("/:id", validate(feeSchema.omit({ student_id: true }).partial()), async (req, res) => {
  const fee = await feeService.update(idParam(req), req.body);
  if (!fee) throw createError(404, "Fee record not found", "NOT_FOUND");
  res.json(fee);
});

export default router;
