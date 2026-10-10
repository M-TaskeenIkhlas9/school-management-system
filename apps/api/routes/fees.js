import { Router } from "express";
import * as feeService from "../services/feeService.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await feeService.getAll());
  } catch (err) { next(err); }
});

router.get("/defaulters", async (_req, res, next) => {
  try {
    res.json(await feeService.getDefaulters());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const fee = await feeService.getById(Number(req.params.id));
    if (!fee) return res.status(404).json({ error: "Fee record not found" });
    res.json(fee);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({
    student_id: { required: true, type: "number" },
    due_date: { required: true, type: "string" },
    amount_due: { required: true, type: "number", min: 0 },
  }),
  async (req, res, next) => {
    try {
      const fee = await feeService.create(req.body);
      res.status(201).json(fee);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const fee = await feeService.update(Number(req.params.id), req.body);
    if (!fee) return res.status(404).json({ error: "Fee record not found" });
    res.json(fee);
  } catch (err) { next(err); }
});

export default router;
