import { Router } from "express";
import * as resultService from "./results.service.js";
import validate from "../../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await resultService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const result = await resultService.getById(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Result not found" });
    res.json(result);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({
    student_id: { required: true, type: "number" },
    classroom_id: { required: true, type: "number" },
    term: { required: true, type: "string" },
    total_score: { required: true, type: "number", min: 0 },
    percentage: { required: true, type: "number", min: 0, max: 100 },
  }),
  async (req, res, next) => {
    try {
      const result = await resultService.create(req.body);
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

router.post("/generate", async (req, res, next) => {
  try {
    const { classroom_id, term, results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: "No results provided" });
    }
    const created = await resultService.generateBatch({ classroom_id, term, results });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

export default router;
