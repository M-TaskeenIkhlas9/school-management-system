import { Router } from "express";
import * as teacherService from "../services/teacherService.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await teacherService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const teacher = await teacherService.getById(Number(req.params.id));
    if (!teacher) return res.status(404).json({ error: "Teacher not found" });
    res.json(teacher);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({ first_name: { required: true, type: "string" }, last_name: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const teacher = await teacherService.create(req.body);
      res.status(201).json(teacher);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const teacher = await teacherService.update(Number(req.params.id), req.body);
    if (!teacher) return res.status(404).json({ error: "Teacher not found" });
    res.json(teacher);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await teacherService.remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
