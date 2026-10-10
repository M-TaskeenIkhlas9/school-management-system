import { Router } from "express";
import * as curriculumService from "../services/curriculumService.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await curriculumService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const item = await curriculumService.getById(Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Curriculum item not found" });
    res.json(item);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({ classroom_id: { required: true, type: "number" }, subject: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const item = await curriculumService.create(req.body);
      res.status(201).json(item);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const item = await curriculumService.update(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: "Curriculum item not found" });
    res.json(item);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await curriculumService.remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
