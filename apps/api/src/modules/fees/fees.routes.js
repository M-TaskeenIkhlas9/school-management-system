import { Router } from "express";
import { z } from "zod";
import * as feeService from "./fees.service.js";
import validate, { idParam, requiredId, isoDate, optionalText, optionalDate } from "../../middleware/validate.js";
import { createError } from "../../middleware/errorHandler.js";

const money = () => z.coerce.number().min(0);
const optionalMoney = () => z.preprocess((v) => (v === "" || v === null ? undefined : v), money().optional());

const feeSchema = z.object({
  student_id: requiredId(),
  month: optionalText(7),
  due_date: isoDate(),
  amount_due: money(),
  amount_paid: optionalMoney(),
  status: z.enum(["pending", "paid", "partial", "overdue"]).optional(),
  paid_date: optionalDate(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await feeService.getAll());
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
