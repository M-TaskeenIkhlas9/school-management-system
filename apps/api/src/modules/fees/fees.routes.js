import { Router } from "express";
import { z } from "zod";
import * as feeService from "./fees.service.js";
import * as families from "./families.service.js";
import onlinePayments from "../payments/payments.routes.js";
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
import { audit } from "../../lib/audit.js";

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

const generateSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM"),
  due_date: isoDate(),
  amount: money().refine((n) => n > 0, "must be more than 0"),
  classroom_id: optionalId(),
});

const paymentSchema = z.object({
  amount: money().refine((n) => n > 0, "must be more than 0"),
  paid_on: optionalDate(),
  method: z.enum(["cash", "bank", "online", "other"]).default("cash"),
  note: optionalText(200),
});

const challanQuery = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    classroom_id: optionalId(),
    fee_id: optionalId(),
  })
  .refine((q) => q.month || q.fee_id, "Give a month or a fee");

const concessionSchema = z.object({
  student_id: requiredId(),
  kind: z.enum(["scholarship", "staff_child", "need_based", "other"]).default("other"),
  type: z.enum(["percent", "amount"]).default("percent"),
  value: money().refine((n) => n > 0, "must be more than 0"),
  note: optionalText(200),
});

const router = Router();

// Payments that came in by 1Bill, Raast or bank transfer.
router.use("/online", onlinePayments);

// ---------- Family accounts (a primary guardian and their children) ----------

router.get("/families", async (req, res) => {
  res.json(await families.listFamilies({ q: typeof req.query.q === "string" ? req.query.q : "" }));
});

router.get("/families/:id", async (req, res) => {
  res.json(await families.statement(idParam(req)));
});

// One payment for the whole family, spread over the children's oldest unpaid fees.
router.post("/families/:id/payments", validate(paymentSchema), async (req, res) => {
  const id = idParam(req);
  const result = await families.payFamily(id, req.body, req.user.id);
  await audit(req, "fees.family_payment", {
    entityType: "guardian",
    entityId: id,
    details: { amount: result.amount, fees: result.applied.length },
  });
  res.status(201).json(result);
});

// ---------- Concessions (scholarship, staff child, need-based …) ----------

router.get("/concessions", async (req, res) => {
  res.json(await families.listConcessions({ student_id: Number(req.query.student_id) || undefined }));
});

router.post("/concessions", validate(concessionSchema), async (req, res) => {
  const concession = await families.addConcession(req.body, req.user.id);
  await audit(req, "fees.concession", { entityType: "student", entityId: req.body.student_id, details: req.body });
  res.status(201).json(concession);
});

router.delete("/concessions/:id", async (req, res) => {
  const id = idParam(req);
  await families.endConcession(id);
  await audit(req, "fees.concession_end", { entityType: "concession", entityId: id });
  res.status(204).end();
});

// Bill a month's fee to one class (or every class). Students already billed that month are skipped.
// (Writes on /fees need fees:write — see app.js.)
router.post("/generate", validate(generateSchema), async (req, res) => {
  const result = await feeService.generateMonth(req.body);
  await audit(req, "fees.generate", { details: { ...req.body, created: result.created } });
  res.status(201).json(result);
});

// Fee challans to print: one fee (?fee_id=) or a month's unpaid fees, optionally for one class.
router.get("/challans", async (req, res) => {
  res.json(await feeService.challans(parseQuery(challanQuery, req.query)));
});

router.get("/:id/payments", async (req, res) => {
  res.json(await feeService.payments(idParam(req)));
});

// Record a payment or instalment; the response is the receipt.
router.post("/:id/payments", validate(paymentSchema), async (req, res) => {
  const id = idParam(req);
  const receipt = await feeService.recordPayment(id, req.body, req.user.id);
  await audit(req, "fees.payment", {
    entityType: "fee",
    entityId: id,
    details: { amount: receipt.amount, method: receipt.method },
  });
  res.status(201).json(receipt);
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req);
  await feeService.remove(id);
  await audit(req, "fees.delete", { entityType: "fee", entityId: id });
  res.status(204).end();
});

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
